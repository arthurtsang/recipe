import os
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
from typing import Dict, Any
from utils.recipe_api import fetch_relevant_recipes
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup, NavigableString
from transformers import pipeline
import asyncio

load_dotenv()

# Initialize FastAPI
app = FastAPI()

class ChatState(BaseModel):
    question: str
    answer: str
    recipes: list[Any]

# Define request/response models
class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str

llm = pipeline("text-generation", model="mistralai/Mistral-7B-Instruct-v0.3",
    token=os.getenv("HUGGINGFACE_HUB_TOKEN")
)

def extract_keywords(question: str) -> list[str]:
    prompt = f"Extract the main ingredients, dish names, or key search terms from this question: '{question}'. Return as a comma-separated list."
    result = llm(prompt, max_new_tokens=32)
    keywords = result[0]["generated_text"].split(",")
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
    result = llm(prompt, max_new_tokens=256)
    state.answer = result[0]["generated_text"][len(prompt):].strip()
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
        return ChatResponse(answer=result["answer"])
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
        visible_text = soup.get_text(separator="\n", strip=True)
        print(f"[import-recipe] Extracted visible text, length: {len(visible_text)}")
        prompt = (
            "Extract the following fields from this recipe web page text. "
            "Return a JSON object with keys: title, description, ingredients, instructions, imageUrl. "
            "Ingredients and instructions should be lists.\n"
            f"Page text:\n{visible_text}\n"
            "JSON:"
        )
        print(f"[import-recipe] Sending prompt to LLM (length: {len(prompt)})")
        result = llm(prompt, max_new_tokens=512)
        print(f"[import-recipe] LLM call complete.")
        import json
        try:
            import re
            match = re.search(r'\{.*\}', result[0]["generated_text"], re.DOTALL)
            if match:
                data = json.loads(match.group(0))
            else:
                data = {}
        except Exception as e:
            print(f"[import-recipe] Error parsing LLM output: {e}")
            data = {}
        return ImportRecipeResponse(
            title=data.get("title", "Imported Recipe"),
            description=data.get("description", ""),
            ingredients="\n".join(data.get("ingredients", [])) if isinstance(data.get("ingredients", list)) else str(data.get("ingredients", "")),
            instructions="\n".join(data.get("instructions", [])) if isinstance(data.get("instructions", list)) else str(data.get("instructions", "")),
            imageUrl=data.get("imageUrl", ""),
            tags=["imported"]
        )
    except Exception as e:
        return ImportRecipeResponse(
            title="Imported Recipe",
            description=f"Error: {str(e)}",
            ingredients="",
            instructions="",
            imageUrl="",
            tags=["imported", "error"]
        ) 