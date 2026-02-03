"""
Mock AI Service for E2E testing.
Returns predictable responses without loading any ML models.
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Mock AI Recipe Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    recipes: List[dict] = []


class ImportRecipeRequest(BaseModel):
    url: str


class ImportRecipeResponse(BaseModel):
    title: str
    description: str
    ingredients: str
    instructions: str
    imageUrl: str = ""
    tags: List[str] = []
    cookTime: str = "30"
    difficulty: str = "Medium"
    timeReasoning: str = "Mock analysis"
    difficultyReasoning: str = "Mock analysis"


class AutoCategoryRequest(BaseModel):
    title: str = ""
    description: str = ""
    ingredients: str = ""
    instructions: str = ""


class AutoCategoryResponse(BaseModel):
    categories: List[str]


class RecipeAnalysisRequest(BaseModel):
    title: str
    description: Optional[str] = None
    ingredients: str
    instructions: str


@app.post("/recipe/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Return a predictable mock response."""
    return ChatResponse(
        answer=f"I'm the mock AI assistant. You asked: {request.question}. For testing, here's a helpful response!",
        recipes=[]
    )


@app.post("/recipe/import", response_model=ImportRecipeResponse)
async def import_recipe(request: ImportRecipeRequest):
    """Return a predictable mock recipe from any URL."""
    return ImportRecipeResponse(
        title="Mock Imported Recipe",
        description="A delicious mock recipe imported for testing purposes.",
        ingredients="2 cups flour\n1 cup sugar\n3 eggs",
        instructions="1. Mix ingredients\n2. Bake at 350F for 30 minutes\n3. Enjoy!",
        imageUrl="",
        tags=["imported", "mock"],
        cookTime="30",
        difficulty="Medium",
        timeReasoning="Mock: Estimated from typical recipe",
        difficultyReasoning="Mock: Medium complexity"
    )


@app.post("/recipe/auto-category", response_model=AutoCategoryResponse)
async def auto_category(request: AutoCategoryRequest):
    """Return mock categories."""
    return AutoCategoryResponse(categories=["mock", "dessert"])


@app.post("/recipe/analyze")
async def analyze_recipe(request: RecipeAnalysisRequest):
    """Return mock recipe analysis."""
    return {
        "estimatedTime": "30",
        "difficulty": "Medium",
        "timeReasoning": "Mock: Typical cooking time",
        "difficultyReasoning": "Mock: Moderate skill level",
        "description": request.description or f"A tasty {request.title}"
    }


@app.get("/health")
async def health_check():
    """Health check - always healthy, no model loading."""
    return {
        "status": "healthy",
        "model_loaded": True,
        "tokenizer_loaded": True,
        "device": "mock",
        "category_classifier_loaded": True
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
