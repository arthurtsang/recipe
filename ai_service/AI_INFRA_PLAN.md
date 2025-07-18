# Local AI Infrastructure Plan (for Recipe App & Other Projects)

## 1. Overview

- **Language:** Python (FastAPI for API, HuggingFace for models)
- **Deployment:** GPU server for production, CPU fallback for dev
- **Structure:** Standalone service (`ai_service/`) with REST API, Dockerized for portability
- **Extensible:** Add endpoints for chat, tagging, step-by-step, and more as needed
- **Reusable:** Other projects can call the same API

---

## 2. Model Recommendations

### Chat/Assistant

- **Llama 3 (Meta)** or **Mistral 7B/8x7B**
  - Llama 3: Best for general chat, reasoning, and recipe Q&A
  - Mistral: Fast, open, and good for instruction-following

### Tagging/Categorization

- **DistilBERT, MiniLM, or T5** for text classification
- Or use the same LLM for both chat and tagging (with prompt engineering)
- For zero-shot tags: `facebook/bart-large-mnli` or similar

### Step-by-Step Cooking Help

- Use the chat LLM with a prompt like:
  > “Given these instructions: ... What is the next step after: ...”

---

## 3. Directory Structure Proposal

```text
ai_service/
  app.py            # FastAPI app
  requirements.txt  # Python dependencies
  Dockerfile        # For deployment
  models/           # (Optional) Downloaded models
  utils/            # Helper scripts
  README.md         # Usage and API docs
```

---

## 4. API Endpoints

- `POST /chat` — General chat/assistant
- `POST /tag` — Suggest tags for a recipe
- `POST /step` — Step-by-step cooking help

---

## 5. Deployment & Usage

- Run locally (CPU) for dev, on GPU server for production
- Dockerfile provided for easy deployment
- Can be called from any project via HTTP

---

## 6. Security

- (Optional) Add API key/token auth for production

---

## 7. Next Steps

1. Scaffold the Python FastAPI service with the above endpoints
2. Add model loading logic (Llama 3/Mistral for chat, zero-shot for tags)
3. Provide a Dockerfile for easy deployment
4. Document how to run locally (CPU) and on GPU
