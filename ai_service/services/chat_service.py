"""
Chat service for handling recipe-related conversations.
"""
import torch
from pydantic import BaseModel
from typing import List, Any


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    recipes: List[Any] = []


def generate_chat_response(question: str, model, tokenizer, device) -> str:
    """Generate a chat response using the LLM."""
    print(f"[chat] Generating response for: {question}")
    
    # Create a prompt for recipe assistance
    prompt = (
        "You are a helpful cooking assistant. Answer questions about recipes, "
        "cooking techniques, ingredients, and meal planning. "
        "Be friendly, informative, and concise.\n\n"
        f"Question: {question}\n\n"
        "Answer:"
    )
    
    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    
    with torch.no_grad():
        outputs = model.generate(
            **inputs, 
            max_new_tokens=256, 
            pad_token_id=tokenizer.eos_token_id,
            temperature=0.7,
            do_sample=True
        )
    
    response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    answer = response_text[len(prompt):].strip()
    
    print(f"[chat] Generated answer: {answer[:100]}...")
    
    return answer


def retrieve_relevant_recipes(question: str) -> List[Any]:
    """Retrieve relevant recipes based on the question."""
    # TODO: Implement recipe search/retrieval logic
    # This could integrate with the backend database or search service
    print(f"[chat] Retrieving recipes for: {question}")
    return []  # Return empty list for now


async def process_chat_request(request: ChatRequest, model, tokenizer, device) -> ChatResponse:
    """Process a chat request and return response."""
    try:
        # Retrieve relevant recipes (if any)
        recipes = retrieve_relevant_recipes(request.question)
        
        # Generate response
        answer = generate_chat_response(request.question, model, tokenizer, device)
        
        return ChatResponse(answer=answer, recipes=recipes)
        
    except Exception as e:
        print(f"[chat] Error processing request: {e}")
        import traceback
        traceback.print_exc()
        
        return ChatResponse(
            answer="I'm sorry, I encountered an error while processing your request. Please try again.",
            recipes=[]
        ) 