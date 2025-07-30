import os
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
from typing import Dict, Any, Optional, List
from utils.recipe_api import fetch_relevant_recipes
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup, NavigableString
from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
import asyncio
import json
import re
import psutil
import torch

load_dotenv()

# Initialize FastAPI
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatState(BaseModel):
    question: str
    answer: str
    recipes: list[Any]

# Define request/response models
class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str
    recipes: list[Any] = []

# Check if CUDA is available and set device
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# Configure quantization for 4-bit loading
quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
)

# Load model and tokenizer with quantization
try:
    print("Loading Zephyr model with 4-bit quantization...")
    print(f"Current memory usage before loading: {psutil.Process().memory_info().rss / 1024 / 1024:.1f} MB")
    print(f"GPU memory before loading: {torch.cuda.memory_allocated() / 1024 / 1024:.1f} MB")
    
    # Use the Zephyr 7B model with 4-bit quantization
    model_name = "HuggingFaceH4/zephyr-7b-beta"
    
    print(f"Loading tokenizer from {model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.pad_token = tokenizer.eos_token
    print("Tokenizer loaded successfully")
    
    print(f"Loading model from {model_name} with quantization...")
    print(f"Quantization config: {quantization_config}")
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=quantization_config,
        device_map="auto",
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
        trust_remote_code=True
    )
    
    print(f"Model loaded successfully!")
    print(f"Model device: {model.device}")
    print(f"Model dtype: {next(model.parameters()).dtype}")
    print(f"Final memory usage: {psutil.Process().memory_info().rss / 1024 / 1024:.1f} MB")
    print(f"Final GPU memory: {torch.cuda.memory_allocated() / 1024 / 1024:.1f} MB")
    print(f"Successfully loaded Zephyr model with 4-bit quantization on {device}")
    
except Exception as e:
    print(f"Failed to load Zephyr model: {e}")
    print(f"Error type: {type(e).__name__}")
    import traceback
    traceback.print_exc()
    print("Falling back to DialoGPT-medium...")
    try:
        model_name = "microsoft/DialoGPT-medium"
        
        print(f"Loading tokenizer from {model_name}...")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        tokenizer.pad_token = tokenizer.eos_token
        print("Tokenizer loaded successfully")
        
        print(f"Loading model from {model_name} with quantization...")
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            quantization_config=quantization_config,
            device_map="auto",
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True,
        )
        
        print(f"Model loaded successfully!")
        print(f"Model device: {model.device}")
        print(f"Model dtype: {next(model.parameters()).dtype}")
        print(f"Final memory usage: {psutil.Process().memory_info().rss / 1024 / 1024:.1f} MB")
        print(f"Final GPU memory: {torch.cuda.memory_allocated() / 1024 / 1024:.1f} MB")
        print(f"Successfully loaded {model_name} with 4-bit quantization on {device}")
        
    except Exception as e2:
        print(f"Failed to load quantized model: {e2}")
        print(f"Error type: {type(e2).__name__}")
        traceback.print_exc()
        print("Falling back to CPU with a smaller model...")
        try:
            model_name = "microsoft/DialoGPT-small"
            print(f"Loading {model_name} on CPU...")
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            tokenizer.pad_token = tokenizer.eos_token
            
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map="cpu",
                torch_dtype=torch.float32
            )
            device = "cpu"
            print(f"Model loaded successfully on {device}!")
            print(f"Final memory usage: {psutil.Process().memory_info().rss / 1024 / 1024:.1f} MB")
            print(f"Successfully loaded DialoGPT-small on {device}")
        except Exception as e3:
            print(f"Failed to load fallback model: {e3}")
            print(f"Error type: {type(e3).__name__}")
            traceback.print_exc()
            raise Exception("No models could be loaded")

def extract_keywords(question: str) -> list[str]:
    prompt = f"Extract the main ingredients, dish names, or key search terms from this question: '{question}'. Return as a comma-separated list."
    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=32, pad_token_id=tokenizer.eos_token_id)
    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    keywords = generated_text[len(prompt):].split(",")
    return [k.strip() for k in keywords if k.strip()]

# LangGraph nodes
async def retrieve_node(state: ChatState) -> ChatState:
    keywords = extract_keywords(state.question)
    recipes = await fetch_relevant_recipes(keywords)
    state.recipes = recipes
    return state

def llm_node(state: ChatState) -> ChatState:
    prompt = f"User question: {state.question}\n"
    if state.recipes:
        prompt += "Relevant recipes:\n"
        for r in state.recipes:
            prompt += f"- {r.get('title', 'Untitled')}\n"
            prompt += f"  Description: {r.get('description', '')}\n"
            # Use latest version for ingredients/instructions if available
            if r.get('versions') and len(r['versions']) > 0:
                v = r['versions'][0]
                prompt += f"  Ingredients: {v.get('ingredients', '')}\n"
                prompt += f"  Instructions: {v.get('instructions', '')}\n"
    prompt += "\nAnswer the user's question using the above recipes."
    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=256, pad_token_id=tokenizer.eos_token_id)
    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    state.answer = generated_text[len(prompt):].strip()
    return state


# Build LangGraph
graph = StateGraph(ChatState)
graph.add_node("retrieve", retrieve_node)
graph.add_node("llm", llm_node)
graph.add_edge("retrieve", "llm")
graph.add_edge("llm", END)
graph.set_entry_point("retrieve")

# /chat endpoint
@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        state = ChatState(question=request.question, answer="", recipes=[])
        compiled_graph = graph.compile()
        result = await compiled_graph.ainvoke(state)
        return ChatResponse(answer=result["answer"], recipes=result["recipes"])
    except Exception as e:
        import traceback
        traceback.print_exc()  # This will print the full stack trace to your console
        raise HTTPException(status_code=500, detail=str(e)) 

class AutoCategoryRequest(BaseModel):
    title: str = ""
    description: str = ""
    ingredients: str = ""
    instructions: str = ""

class AutoCategoryResponse(BaseModel):
    categories: list[str]

# Try to load a DistilBERT-based text classification pipeline for categories
try:
    category_classifier = pipeline(
        "text-classification",
        model="distilbert-base-uncased-finetuned-sst-2-english",  # Replace with a real category model if available
        top_k=None,  # For multi-label, set top_k or use return_all_scores=True
    )
except Exception as e:
    category_classifier = None
    category_classifier_error = str(e)

@app.post("/auto-category", response_model=AutoCategoryResponse)
async def auto_category(request: AutoCategoryRequest = Body(...)):
    if not category_classifier:
        raise HTTPException(status_code=500, detail=f"Category classifier not available: {category_classifier_error}")
    # Concatenate all text fields for classification
    text = " ".join([
        request.title or "",
        request.description or "",
        request.ingredients or "",
        request.instructions or ""
    ]).strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided for category prediction.")
    # Run the classifier
    results = category_classifier(text, return_all_scores=True)
    # Extract categories with high confidence (e.g., score > 0.5)
    categories = []
    if isinstance(results, list) and len(results) > 0:
        for label_score in results[0]:
            if label_score["score"] > 0.5:
                categories.append(label_score["label"])
    return AutoCategoryResponse(categories=categories or [results[0][0]["label"]])

class ImportRecipeRequest(BaseModel):
    url: str

class ImportRecipeResponse(BaseModel):
    title: str
    description: str
    ingredients: str
    instructions: str
    imageUrl: str = ""
    tags: list[str] = []

@app.post("/import-recipe", response_model=ImportRecipeResponse)
async def import_recipe(request: ImportRecipeRequest = Body(...)):
    url = request.url
    try:
        print(f"[import-recipe] Fetching URL: {url}")
        verify_ssl = False if 'myrecipe.kitchen' in url else True
        resp = requests.get(url, timeout=10, verify=verify_ssl)
        print(f"[import-recipe] Fetched URL, status: {resp.status_code}")
        html = resp.text
        html_len = len(html)
        print(f"[import-recipe] HTML length: {html_len}")
        if html_len > 1500:
            print(f"[import-recipe] HTML (start):\n{html[:500]}")
            print(f"[import-recipe] HTML (middle):\n{html[html_len//2:html_len//2+500]}")
            print(f"[import-recipe] HTML (end):\n{html[-500:]}")
        else:
            print(f"[import-recipe] HTML (all):\n{html}")
        
        soup = BeautifulSoup(html, "html.parser")
        
        # Extract image URLs first
        image_urls = []
        for img in soup.find_all('img'):
            src = img.get('src')
            srcset = img.get('srcset')
            data_src = img.get('data-src')
            
            # Try different image source attributes
            img_src = src or data_src
            if img_src:
                # Convert relative URLs to absolute
                if img_src.startswith('/'):
                    # Extract base URL from the original URL
                    from urllib.parse import urlparse
                    parsed = urlparse(url)
                    base_url = f"{parsed.scheme}://{parsed.netloc}"
                    img_src = base_url + img_src
                elif img_src.startswith('http'):
                    pass  # Already absolute
                else:
                    # Relative URL, prepend base URL
                    from urllib.parse import urljoin
                    img_src = urljoin(url, img_src)
                
                # Skip obvious non-recipe images
                if not any(skip in img_src.lower() for skip in ['logo', 'icon', 'avatar', 'social', 'ad', 'advertisement']):
                    image_urls.append(img_src)
            
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
                                from urllib.parse import urlparse
                                parsed = urlparse(url)
                                base_url = f"{parsed.scheme}://{parsed.netloc}"
                                src_url = base_url + src_url
                            srcset_urls.append(src_url)
                # Add the highest quality srcset image
                if srcset_urls:
                    image_urls.extend(srcset_urls)
        
        print(f"[import-recipe] Found {len(image_urls)} image URLs: {image_urls[:3]}...")  # Show first 3
        
        visible_text = soup.get_text(separator="\n", strip=True)
        print(f"[import-recipe] Extracted visible text, length: {len(visible_text)}")
        
        # Create a more detailed prompt for better extraction
        prompt = (
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
        
        print(f"[import-recipe] Sending prompt to LLM (length: {len(prompt)})")
        inputs = tokenizer(prompt, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=512, pad_token_id=tokenizer.eos_token_id)
        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        print(f"[import-recipe] LLM call complete.")
        
        try:
            # Extract the response part after the prompt
            response_text = generated_text[len(prompt):].strip()
            print(f"[import-recipe] Raw response: {response_text}")
            
            # Try to parse the entire response as JSON first
            try:
                data = json.loads(response_text)
                print(f"[import-recipe] Parsed data directly: {data}")
            except json.JSONDecodeError as e:
                print(f"[import-recipe] JSON decode error: {e}")
                
                # First try to extract JSON by finding balanced braces (handles extra content after JSON)
                data = {}
                json_start = response_text.find('{')
                
                if json_start != -1:
                    brace_count = 0
                    json_end = json_start
                    
                    for i, char in enumerate(response_text[json_start:], json_start):
                        if char == '{':
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                json_end = i
                                break
                    
                    if brace_count == 0:  # Found balanced JSON
                        json_str = response_text[json_start:json_end + 1]
                        try:
                            data = json.loads(json_str)
                            print(f"[import-recipe] Parsed data with balanced braces: {data}")
                        except json.JSONDecodeError as e:
                            print(f"[import-recipe] Balanced JSON still invalid: {e}")
                            data = {}  # Clear data to try next method
                
                # If balanced braces didn't work, try to complete incomplete JSON
                if not data and response_text.strip().startswith('{'):
                    print(f"[import-recipe] Attempting to complete/fix JSON with LLM...")
                    completion_prompt = (
                        "Fix and complete this JSON to make it valid. "
                        "Return only the corrected JSON:\n\n"
                        f"{response_text}\n\n"
                        "Fixed JSON:"
                    )
                    
                    completion_inputs = tokenizer(completion_prompt, return_tensors="pt").to(device)
                    with torch.no_grad():
                        completion_outputs = model.generate(**completion_inputs, max_new_tokens=200, pad_token_id=tokenizer.eos_token_id)
                    completion_text = tokenizer.decode(completion_outputs[0], skip_special_tokens=True)
                    completion_response = completion_text[len(completion_prompt):].strip()
                    
                    print(f"[import-recipe] LLM fix response: {completion_response}")
                    
                    # Try to extract JSON from the completion response
                    comp_start = completion_response.find('{')
                    if comp_start != -1:
                        comp_brace_count = 0
                        comp_end = comp_start
                        
                        for i, char in enumerate(completion_response[comp_start:], comp_start):
                            if char == '{':
                                comp_brace_count += 1
                            elif char == '}':
                                comp_brace_count -= 1
                                if comp_brace_count == 0:
                                    comp_end = i
                                    break
                        
                        if comp_brace_count == 0:
                            fixed_json = completion_response[comp_start:comp_end + 1]
                            try:
                                data = json.loads(fixed_json)
                                print(f"[import-recipe] Successfully parsed LLM-fixed JSON: {data}")
                            except json.JSONDecodeError:
                                print(f"[import-recipe] LLM-fixed JSON still invalid")
                                data = {}
                        else:
                            print(f"[import-recipe] No balanced JSON in LLM fix response")
                    else:
                        print(f"[import-recipe] No JSON found in LLM fix response")
                
                # If still no data, log the failure
                if not data:
                    print(f"[import-recipe] All JSON parsing methods failed")
        except Exception as e:
            print(f"[import-recipe] Error parsing LLM output: {e}")
            print(f"[import-recipe] Raw response: {response_text}")
            data = {}
        
        # If JSON parsing failed completely, try to extract from markdown format
        if not data or (not data.get("title") and not data.get("ingredients") and not data.get("instructions")):
            print(f"[import-recipe] JSON parsing failed, attempting markdown extraction...")
            
            # Try to extract from markdown format
            markdown_prompt = (
                "Extract recipe information from this web page text. "
                "Return the information in this exact markdown format:\n\n"
                "# Title\n"
                "Recipe title here\n\n"
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
            
            markdown_inputs = tokenizer(markdown_prompt, return_tensors="pt").to(device)
            with torch.no_grad():
                markdown_outputs = model.generate(**markdown_inputs, max_new_tokens=512, pad_token_id=tokenizer.eos_token_id)
            markdown_text = tokenizer.decode(markdown_outputs[0], skip_special_tokens=True)
            markdown_response = markdown_text[len(markdown_prompt):].strip()
            
            print(f"[import-recipe] Markdown response: {markdown_response}")
            
            # Parse markdown sections
            title_match = re.search(r'# (.+?)(?:\n|$)', markdown_response)
            description_match = re.search(r'## Description\n(.+?)(?:\n## |$)', markdown_response, re.DOTALL)
            ingredients_match = re.search(r'## Ingredients\n(.+?)(?:\n## |$)', markdown_response, re.DOTALL)
            instructions_match = re.search(r'## Instructions\n(.+?)(?:\n## |$)', markdown_response, re.DOTALL)
            image_match = re.search(r'## Image\n(.+?)(?:\n|$)', markdown_response)
            
            if title_match:
                data["title"] = title_match.group(1).strip()
            if description_match:
                data["description"] = description_match.group(1).strip()
            if ingredients_match:
                # Extract ingredients from markdown list
                ingredients_text = ingredients_match.group(1).strip()
                ingredients_list = [line.strip('- ').strip() for line in ingredients_text.split('\n') if line.strip().startswith('-')]
                data["ingredients"] = ingredients_list
            if instructions_match:
                # Extract instructions from numbered list
                instructions_text = instructions_match.group(1).strip()
                instructions_list = []
                for line in instructions_text.split('\n'):
                    line = line.strip()
                    if re.match(r'^\d+\.', line):
                        instructions_list.append(re.sub(r'^\d+\.\s*', '', line))
                data["instructions"] = instructions_list
            if image_match:
                data["imageUrl"] = image_match.group(1).strip()
            
            print(f"[import-recipe] Extracted from markdown: {data}")
        
        # If no image URL was extracted by LLM, use the best available image
        if not data.get("imageUrl") and image_urls:
            # Try to find a larger, better quality image
            best_image = image_urls[0]  # fallback to first
            for img_url in image_urls:
                # Prefer larger images (look for keywords in URL that indicate larger size)
                if any(keyword in img_url.lower() for keyword in ['1500x', '1200x', '800x', 'large', 'original']):
                    best_image = img_url
                    break
                # Avoid small thumbnails
                elif any(keyword in img_url.lower() for keyword in ['75x75', '100x100', '150x150']):
                    continue
                else:
                    best_image = img_url
            
            data["imageUrl"] = best_image
            print(f"[import-recipe] Using best available image: {best_image}")
        
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