"""
AI Recipe Server - Restructured modular application.
"""
import os
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline
from pydantic import BaseModel
from typing import List

# Import our modular services
from models.model_loader import load_model_and_tokenizer
from services.import_service import ImportRecipeRequest, ImportRecipeResponse, import_recipe_from_url
from services.chat_service import ChatRequest, ChatResponse, process_chat_request

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="AI Recipe Server", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variables
model = None
tokenizer = None
device = None
category_classifier = None


@app.on_event("startup")
async def startup_event():
    """Initialize models on startup."""
    global model, tokenizer, device, category_classifier
    
    print("Starting AI Recipe Server...")
    
    # Load main LLM model
    model, tokenizer, device = load_model_and_tokenizer()
    
    # Try to load category classifier
    try:
        category_classifier = pipeline(
            "text-classification",
            model="distilbert-base-uncased-finetuned-sst-2-english",
            top_k=None,
        )
        print("Category classifier loaded successfully")
    except Exception as e:
        category_classifier = None
        print(f"Failed to load category classifier: {e}")
    
    print("AI Recipe Server startup complete!")


# Chat endpoint
@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Handle chat requests."""
    if not model or not tokenizer:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return await process_chat_request(request, model, tokenizer, device)


# Import recipe endpoint
@app.post("/import-recipe", response_model=ImportRecipeResponse)
async def import_recipe(request: ImportRecipeRequest = Body(...)):
    """Import recipe from external URL."""
    if not model or not tokenizer:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return await import_recipe_from_url(request.url, model, tokenizer, device)


# Auto-category endpoint
class AutoCategoryRequest(BaseModel):
    title: str = ""
    description: str = ""
    ingredients: str = ""
    instructions: str = ""


class AutoCategoryResponse(BaseModel):
    categories: List[str]


@app.post("/auto-category", response_model=AutoCategoryResponse)
async def auto_category(request: AutoCategoryRequest = Body(...)):
    """Auto-categorize recipe based on content."""
    if not category_classifier:
        raise HTTPException(status_code=500, detail="Category classifier not available")
    
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


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "tokenizer_loaded": tokenizer is not None,
        "device": device,
        "category_classifier_loaded": category_classifier is not None
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 