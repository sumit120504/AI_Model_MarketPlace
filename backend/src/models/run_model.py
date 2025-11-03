"""
Simple spam detection model runner for scikit-learn pipeline model.
"""
import sys
import json
import traceback
from pathlib import Path
import pickle
import numpy as np
from typing import Dict, Any

def load_model(model_path: str) -> Any:
    """Load the spam detection model"""
    try:
        path = Path(model_path)
        if not path.exists():
            raise ValueError(f"Model file not found: {model_path}")
            
        if path.stat().st_size == 0:
            raise ValueError(f"Model file is empty: {model_path}")
            
        with open(model_path, 'rb') as f:
            model = pickle.load(f)
            
        print("Model loaded successfully")
        return model
    except Exception as e:
        raise Exception(f"Failed to load model: {str(e)}")

def run_inference(model, input_text: str) -> Dict:
    """Run spam detection inference"""
    try:
        # Get prediction (0 or 1)
        prediction = model.predict([input_text])[0]
        
        # Get probability scores
        probabilities = model.predict_proba([input_text])[0]
        
        print(f"Raw prediction: {prediction}")
        print(f"Raw probabilities: {probabilities}")
        
        # Format result
        result = {
            'label': 'SPAM' if prediction == 1 else 'NOT_SPAM',
            'confidence': float(probabilities[prediction]),
            'probabilities': {
                'NOT_SPAM': float(probabilities[0]),
                'SPAM': float(probabilities[1])
            }
        }
        
        print(f"Processed result: {json.dumps(result)}")
        return result
        
    except Exception as e:
        print(f"Error during inference: {str(e)}")
        raise Exception(f"Inference failed: {str(e)}")

def main():
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected model_path and input_json_path arguments")
            
        model_path = sys.argv[1]
        input_json_path = sys.argv[2]
        
        # Read input JSON
        with open(input_json_path, 'r') as f:
            input_json = json.load(f)
            
        input_text = input_json.get('input')
        if not isinstance(input_text, str):
            raise ValueError(f"Expected string input, got {type(input_text)}")
            
        print(f"Input text: {input_text[:100]}...")
        
        # Load model
        model = load_model(model_path)
        
        # Run inference
        result = run_inference(model, input_text)
        
        # Return results
        output = {
            'success': True,
            'output': result
        }
        
        print(json.dumps(output))
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == '__main__':
    main()