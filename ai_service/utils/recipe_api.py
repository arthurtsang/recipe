import httpx
from typing import List, Dict

RECIPE_BACKEND_URL = "https://recipe.youramaryllis.com"  # Production backend URL

async def fetch_relevant_recipes(keywords: List[str]) -> List[Dict]:
    """
    Query the recipe backend API for recipes relevant to the user's keywords.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{RECIPE_BACKEND_URL}/api/recipes/search", json={"keywords": keywords})
        response.raise_for_status()
        return response.json() 