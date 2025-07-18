# AI Service for Recipe App

This service provides AI-powered chat and recipe Q&A using Mistral and retrieval-augmented generation (RAG) from your recipe backend.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Update `utils/recipe_api.py` with your recipe backend API URL.

3. (Optional) Download or configure the Mistral model for local use.

## Running Locally

```bash
uvicorn app:app --reload
```

## API

### POST /chat
- **Body:** `{ "question": "How do I make chocolate cake?" }`
- **Response:** `{ "answer": "..." }`

## Extending
- Add more tools/nodes to the LangGraph pipeline for new features (e.g., nutrition lookup, tagging, etc.)
