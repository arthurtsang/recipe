#!/usr/bin/env python3
"""
Pre-download script for the Zephyr model to avoid long startup times.
This script downloads the model and tokenizer to the Hugging Face cache.
"""

import os
import sys
from transformers import AutoTokenizer, AutoModelForCausalLM
from transformers import BitsAndBytesConfig
import torch
import psutil

def main():
    print("=== Pre-downloading Zephyr 7B model ===")
    print(f"Current memory usage: {psutil.Process().memory_info().rss / 1024 / 1024:.1f} MB")
    
    # Set up quantization config
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
    
    model_name = "HuggingFaceH4/zephyr-7b-beta"
    
    try:
        print(f"\n1. Downloading tokenizer from {model_name}...")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        tokenizer.pad_token = tokenizer.eos_token
        print("✅ Tokenizer downloaded successfully")
        
        print(f"\n2. Downloading model from {model_name}...")
        print("This may take several minutes depending on your internet connection...")
        
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            quantization_config=quantization_config,
            device_map="auto",
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True,
            trust_remote_code=True
        )
        
        print("✅ Model downloaded successfully!")
        print(f"Model device: {model.device}")
        print(f"Model dtype: {next(model.parameters()).dtype}")
        print(f"Final memory usage: {psutil.Process().memory_info().rss / 1024 / 1024:.1f} MB")
        
        # Clean up to free memory
        del model
        del tokenizer
        torch.cuda.empty_cache()
        
        print("\n✅ Model pre-download completed!")
        print("The model is now cached and will load much faster on next startup.")
        
    except Exception as e:
        print(f"❌ Error downloading model: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 