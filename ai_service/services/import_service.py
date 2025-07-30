"""
Recipe import service for extracting recipe data from web pages.
"""
import asyncio
import json
import re
import torch
from typing import Dict, Any, List
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from pydantic import BaseModel
from utils.json_parser import parse_llm_response, extract_json_from_markdown


class ImportRecipeRequest(BaseModel):
    url: str


class ImportRecipeResponse(BaseModel):
    title: str
    description: str
    ingredients: str
    instructions: str
    imageUrl: str = ""
    tags: List[str] = []


async def fetch_html_with_playwright(url: str) -> str:
    """Fetch HTML using Playwright headless browser to get fully rendered content."""
    try:
        async with async_playwright() as p:
            # Launch browser in headless mode with SSL certificate validation disabled
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--ignore-ssl-errors=yes',
                    '--ignore-certificate-errors=yes',
                    '--ignore-certificate-errors-spki-list=yes',
                    '--ignore-ssl-errors-skip-list=yes',
                    '--disable-web-security',
                    '--allow-running-insecure-content'
                ]
            )
            context = await browser.new_context(ignore_https_errors=True)
            page = await context.new_page()
            
            # Set a realistic user agent to avoid detection
            await page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            })
            
            # Navigate to page with more lenient waiting
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                # Try to wait for network to be mostly idle, but don't fail if it times out
                try:
                    await page.wait_for_load_state("networkidle", timeout=10000)
                except Exception:
                    print("[import-recipe] Network idle timeout, continuing anyway")
                    pass
            except Exception as e:
                print(f"[import-recipe] Page load timeout, trying to get content anyway: {e}")
                # If even domcontentloaded fails, try a basic load
                await page.goto(url, wait_until="load", timeout=15000)
            
            # Wait longer for any lazy-loaded images and JavaScript to execute
            print("[import-recipe] Waiting for JavaScript and lazy-loaded images...")
            await page.wait_for_timeout(8000)  # Increased from 3000ms to 8000ms
            
            # Try to trigger any lazy loading by scrolling
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(2000)  # Wait after scrolling
            
            # Get the fully rendered HTML
            html = await page.content()
            print(f"[import-recipe] HTML length: {len(html)} characters")
            
            await browser.close()
            return html
            
    except Exception as e:
        print(f"[import-recipe] Playwright error: {e}")
        # If Playwright fails, we could fallback to requests here if needed
        raise e


def extract_images_from_html(soup, base_url):
    """Extract and process image URLs from HTML."""
    from urllib.parse import urlparse, urljoin
    
    image_urls = []
    
    # Debug: Print all img tags found
    all_imgs = soup.find_all('img')
    print(f"[import-recipe] Found {len(all_imgs)} img tags in HTML")
    for i, img in enumerate(all_imgs[:5]):  # Show first 5 for debugging
        print(f"[import-recipe] img[{i}]: src='{img.get('src')}', data-src='{img.get('data-src')}', class='{img.get('class')}'")
    
    for img in soup.find_all('img'):
        src = img.get('src')
        srcset = img.get('srcset')
        data_src = img.get('data-src')
        data_original_src = img.get('data-original-src')
        data_lazy_src = img.get('data-lazy-src')
        data_pin_media = img.get('data-pin-media')
        
        # Try different image source attributes (now including more modern lazy-loading attributes)
        img_src = src or data_src or data_original_src or data_lazy_src or data_pin_media
        if img_src:
            print(f"[import-recipe] Processing img_src: '{img_src}'")
            
            # Convert relative URLs to absolute
            if img_src.startswith('/'):
                parsed = urlparse(base_url)
                base_domain = f"{parsed.scheme}://{parsed.netloc}"
                img_src = base_domain + img_src
                print(f"[import-recipe] Converted to absolute: '{img_src}'")
            elif img_src.startswith('http'):
                print(f"[import-recipe] Already absolute: '{img_src}'")
                pass  # Already absolute
            else:
                # Relative URL, prepend base URL
                img_src = urljoin(base_url, img_src)
                print(f"[import-recipe] Joined with base: '{img_src}'")
            
            # Skip obvious non-recipe images - be more precise about matching
            skip_keywords = ['logo', 'icon', 'avatar', 'social', 'ad', 'advertisement']
            url_lower = img_src.lower()
            
            # Check if any skip keyword appears as a standalone word or at word boundaries
            should_skip = False
            for keyword in skip_keywords:
                # Check for keyword as standalone word (surrounded by non-letters)
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, url_lower):
                    should_skip = True
                    print(f"[import-recipe] Skip keyword '{keyword}' found in URL")
                    break
            
            print(f"[import-recipe] Skip check - URL: '{img_src}', should_skip: {should_skip}")
            
            if not should_skip:
                image_urls.append(img_src)
                print(f"[import-recipe] Added image: {img_src}")
            else:
                print(f"[import-recipe] Skipped image: {img_src}")
        else:
            print(f"[import-recipe] No img_src found for this img tag")
        
        # Also check srcset for higher quality images
        if srcset:
            # Parse srcset format: "url1 1x, url2 2x, ..."
            srcset_urls = []
            for src_desc in srcset.split(','):
                src_desc = src_desc.strip()
                if ' ' in src_desc:
                    src_url = src_desc.split(' ')[0]
                    if src_url.startswith('http') or src_url.startswith('/'):
                        if src_url.startswith('/'):
                            parsed = urlparse(base_url)
                            base_domain = f"{parsed.scheme}://{parsed.netloc}"
                            src_url = base_domain + src_url
                        srcset_urls.append(src_url)
            
            # Add the highest resolution image from srcset
            if srcset_urls:
                image_urls.extend(srcset_urls)
    
    return image_urls


def select_best_image(image_urls):
    """Select the best image from available URLs based on size indicators."""
    if not image_urls:
        return ""
    
    best_image = image_urls[0]  # fallback to first
    
    # Look for AllRecipes main recipe images first (they have specific patterns)
    for img_url in image_urls:
        # AllRecipes main recipe images often have these patterns
        if '/thmb/' in img_url and any(size in img_url for size in ['750x0', '800x', '1200x', '1500x']):
            # Check if it's not a small thumbnail or author photo
            if not any(skip in img_url.lower() for skip in ['40x0', '58x0', '76x0', 'headshot', 'avatar']):
                best_image = img_url
                break
    
    # If no AllRecipes pattern found, use general logic
    if best_image == image_urls[0]:
        for img_url in image_urls:
            # Prefer larger images (look for keywords in URL that indicate larger size)
            if any(keyword in img_url.lower() for keyword in ['1500x', '1200x', '800x', '750x', 'large', 'original']):
                best_image = img_url
                break
            # Avoid small thumbnails
            elif any(keyword in img_url.lower() for keyword in ['75x75', '100x100', '150x150', '40x0', '58x0']):
                continue
            else:
                best_image = img_url
    
    return best_image


def create_recipe_extraction_prompt(visible_text):
    """Create the prompt for recipe extraction."""
    return (
        "Extract recipe information from this web page text. "
        "Return a JSON object with the following structure:\n"
        "{\n"
        '  "title": "Recipe title",\n'
        '  "description": "Brief description or summary",\n'
        '  "ingredients": ["ingredient 1", "ingredient 2", ...],\n'
        '  "instructions": ["step 1", "step 2", ...],\n'
        '  "imageUrl": "URL of the main recipe image"\n'
        "}\n\n"
        "Guidelines:\n"
        "- Extract the main recipe title\n"
        "- List all ingredients with quantities\n"
        "- Break down cooking instructions into numbered steps\n"
        "- If multiple images are found, use the most relevant one for the recipe\n"
        "- Be precise and include all important details\n\n"
        f"Page text:\n{visible_text}\n\n"
        "JSON:"
    )


def create_markdown_extraction_prompt(visible_text):
    """Create the prompt for markdown extraction as fallback."""
    return (
        "Extract recipe information from this web page text. "
        "Return the information in this exact markdown format:\n\n"
        "# Recipe Title\n"
        "## Description\n"
        "Brief description here\n\n"
        "## Ingredients\n"
        "- ingredient 1\n"
        "- ingredient 2\n"
        "- ingredient 3\n\n"
        "## Instructions\n"
        "1. step 1\n"
        "2. step 2\n"
        "3. step 3\n\n"
        "## Image\n"
        "image_url_here\n\n"
        f"Page text:\n{visible_text}\n\n"
        "Markdown:"
    )


def extract_recipe_with_llm(visible_text, model, tokenizer, device):
    """Extract recipe data using LLM with JSON and markdown fallbacks."""
    print(f"[import-recipe] Sending prompt to LLM (length: {len(visible_text) + 600})")
    
    # Try JSON extraction first
    json_prompt = create_recipe_extraction_prompt(visible_text)
    json_inputs = tokenizer(json_prompt, return_tensors="pt").to(device)
    
    with torch.no_grad():
        json_outputs = model.generate(**json_inputs, max_new_tokens=512, pad_token_id=tokenizer.eos_token_id)
    json_text = tokenizer.decode(json_outputs[0], skip_special_tokens=True)
    json_response = json_text[len(json_prompt):].strip()
    
    print(f"[import-recipe] LLM call complete.")
    print(f"[import-recipe] Raw response: {json_response}")
    
    # Parse the JSON response
    data = parse_llm_response(json_response, model, tokenizer, device)
    
    # If JSON parsing failed completely, try markdown extraction
    if not data or (not data.get("title") and not data.get("ingredients") and not data.get("instructions")):
        print(f"[import-recipe] JSON parsing failed, attempting markdown extraction...")
        
        markdown_prompt = create_markdown_extraction_prompt(visible_text)
        markdown_inputs = tokenizer(markdown_prompt, return_tensors="pt").to(device)
        
        with torch.no_grad():
            markdown_outputs = model.generate(**markdown_inputs, max_new_tokens=512, pad_token_id=tokenizer.eos_token_id)
        markdown_text = tokenizer.decode(markdown_outputs[0], skip_special_tokens=True)
        markdown_response = markdown_text[len(markdown_prompt):].strip()
        
        print(f"[import-recipe] Markdown response: {markdown_response}")
        
        # Parse markdown sections
        data = extract_json_from_markdown(markdown_response)
        print(f"[import-recipe] Extracted from markdown: {data}")
    
    return data


async def import_recipe_from_url(url: str, model, tokenizer, device) -> ImportRecipeResponse:
    """Import recipe from a given URL."""
    try:
        print(f"[import-recipe] Fetching URL: {url}")
        html = await fetch_html_with_playwright(url)
        print(f"[import-recipe] Fetched URL, status: {200}") # Playwright doesn't return status code directly here
        
        soup = BeautifulSoup(html, "html.parser")
        
        # Extract image URLs
        image_urls = extract_images_from_html(soup, url)
        print(f"[import-recipe] Found {len(image_urls)} image URLs:")
        for i, img_url in enumerate(image_urls[:10]):  # Show first 10 images
            print(f"[import-recipe]   {i+1}: {img_url}")
        if len(image_urls) > 10:
            print(f"[import-recipe]   ... and {len(image_urls) - 10} more images")
        
        # Extract visible text
        visible_text = soup.get_text(separator="\n", strip=True)
        print(f"[import-recipe] Extracted visible text, length: {len(visible_text)}")
        
        # Extract recipe data using LLM
        data = extract_recipe_with_llm(visible_text, model, tokenizer, device)
        
        # Always prioritize our found images over LLM hallucination
        best_image = ""
        if image_urls:
            best_image = select_best_image(image_urls)
            
        # If LLM provided an image and it's one of our found images, use it
        llm_image = data.get("imageUrl", "")
        if llm_image and llm_image in image_urls:
            best_image = llm_image
            print(f"[import-recipe] LLM selected valid image: {llm_image}")
        elif llm_image:
            print(f"[import-recipe] LLM selected image not in found images: {llm_image}")
            # Don't use LLM hallucinated images, stick with our found ones
            
        # Set the final image
        data["imageUrl"] = best_image
        if best_image:
            print(f"[import-recipe] Final selected image: {best_image}")
        else:
            print(f"[import-recipe] No suitable image found")
        
        # Log all images that look like recipe images (for debugging)
        recipe_like_images = [img for img in image_urls if any(keyword in img.lower() for keyword in ['1500x', '750x', '800x', '1200x', 'recipe', 'food', 'dish']) and not any(skip in img.lower() for skip in ['headshot', 'avatar', 'author'])]
        if recipe_like_images:
            print(f"[import-recipe] Recipe-like images found:")
            for img in recipe_like_images[:5]:
                print(f"[import-recipe]   - {img}")
        
        return ImportRecipeResponse(
            title=data.get("title", "Imported Recipe"),
            description=data.get("description", ""),
            ingredients="\n".join(data.get("ingredients", [])) if isinstance(data.get("ingredients"), list) else str(data.get("ingredients", "")),
            instructions="\n".join(data.get("instructions", [])) if isinstance(data.get("instructions"), list) else str(data.get("instructions", "")),
            imageUrl=data.get("imageUrl", ""),
            tags=["imported"]
        )
        
    except Exception as e:
        print(f"[import-recipe] Error: {e}")
        import traceback
        traceback.print_exc()
        return ImportRecipeResponse(
            title="Imported Recipe",
            description=f"Error: {str(e)}",
            ingredients="",
            instructions="",
            imageUrl="",
            tags=["imported", "error"]
        ) 