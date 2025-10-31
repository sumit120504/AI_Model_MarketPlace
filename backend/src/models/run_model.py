import sys
import pickle
import json
import os
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np

def load_model(model_path):
    try:
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
            
        with open(model_path, 'rb') as f:
            model_dict = pickle.load(f)
            
        # Validate model structure
        required_keys = ['model', 'vectorizer', 'metadata']
        missing_keys = [key for key in required_keys if key not in model_dict]
        if missing_keys:
            raise ValueError(f"Invalid model file: missing {', '.join(missing_keys)}")
            
        # Extract model components
        classifier = model_dict['model']
        vectorizer = model_dict['vectorizer']
        metadata = model_dict.get('metadata', {})
        
        # Validate component types
        if not hasattr(classifier, 'predict') or not hasattr(classifier, 'predict_proba'):
            raise ValueError("Invalid model: missing required methods")
        if not hasattr(vectorizer, 'transform'):
            raise ValueError("Invalid vectorizer: missing transform method")
            
        return classifier, vectorizer, metadata
    except Exception as e:
        return None, None, {'error': str(e)}

def predict_spam(text, model_path):
    try:
        # Input validation and size limits
        if not text or not isinstance(text, str):
            return json.dumps({
                'error': 'Invalid input: text must be a non-empty string',
                'success': False
            })
        
        # Limit input size to prevent memory issues (100KB)
        MAX_INPUT_SIZE = 100 * 1024
        if len(text.encode('utf-8')) > MAX_INPUT_SIZE:
            return json.dumps({
                'error': f'Input text too large: maximum size is {MAX_INPUT_SIZE} bytes',
                'success': False
            })
            
        # Load model and vectorizer
        classifier, vectorizer, metadata = load_model(model_path)
        if classifier is None or vectorizer is None:
            return json.dumps({
                'error': metadata.get('error', 'Failed to load model'),
                'success': False
            })

        # Preprocess and transform input text
        text = text.strip()
        try:
            X = vectorizer.transform([text])
        except Exception as e:
            return json.dumps({
                'error': f'Text vectorization failed: {str(e)}',
                'success': False
            })
        
        # Make prediction with error handling
        try:
            prediction = classifier.predict(X)[0]
            probabilities = classifier.predict_proba(X)[0]
            
            # Get confidence scores for both classes
            spam_confidence = float(probabilities[1]) if prediction else float(probabilities[0])
            not_spam_confidence = float(probabilities[0]) if prediction else float(probabilities[1])
        except Exception as e:
            return json.dumps({
                'error': f'Prediction failed: {str(e)}',
                'success': False
            })
        
        result = {
            'success': True,
            'isSpam': bool(prediction),
            'confidence': spam_confidence,
            'result': 'SPAM' if prediction else 'NOT_SPAM',
            'details': {
                'spam_confidence': spam_confidence,
                'not_spam_confidence': not_spam_confidence,
                'input_length': len(text),
                'model_metadata': metadata
            }
        }
        
        return json.dumps(result)
        
    except Exception as e:
        return json.dumps({
            'error': f'Unexpected error: {str(e)}',
            'success': False
        })

def get_model_metadata(model_path):
    """Get model metadata without running inference"""
    try:
        _, _, metadata = load_model(model_path)
        return json.dumps({
            'success': True,
            'details': {
                'model_metadata': metadata
            }
        })
    except Exception as e:
        return json.dumps({
            'error': f'Failed to get model metadata: {str(e)}',
            'success': False
        })

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Missing arguments', 'success': False}))
        sys.exit(1)
        
    model_path = sys.argv[1]
    
    if len(sys.argv) == 2 or sys.argv[2] == '--metadata-only':
        print(get_model_metadata(model_path))
    else:
        text = sys.argv[2]
        print(predict_spam(text, model_path))