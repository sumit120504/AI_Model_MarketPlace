import sys
import json
import traceback
from pathlib import Path
import torch
import tensorflow as tf
import pickle
import numpy as np
from typing import Any, Dict, Union

def load_model(model_path: str, model_type: str) -> Any:
    """Load model based on type and file extension"""
    try:
        ext = Path(model_path).suffix.lower()
        
        if ext == '.pt' or ext == '.pth':
            model = torch.load(model_path)
            model.eval()  # Set to inference mode
            return model
            
        elif ext == '.h5' or ext == '.keras':
            return tf.keras.models.load_model(model_path)
            
        elif ext == '.pkl' or ext == '.pickle':
            with open(model_path, 'rb') as f:
                return pickle.load(f)
                
        elif ext == '.onnx':
            import onnxruntime as ort
            return ort.InferenceSession(model_path)
            
        else:
            raise ValueError(f"Unsupported model format: {ext}")
            
    except Exception as e:
        raise Exception(f"Failed to load model: {str(e)}")

def preprocess_input(input_data: Union[str, Dict, list], model_type: str, config: Dict) -> Any:
    """Preprocess input data based on model type"""
    try:
        if model_type == 'text_classification':
            # Convert text to format expected by model
            if isinstance(input_data, str):
                return input_data
            elif isinstance(input_data, dict) and 'text' in input_data:
                return input_data['text']
                
        elif model_type == 'image_classification':
            # Load and preprocess image data
            import cv2
            import base64
            
            if isinstance(input_data, str) and input_data.startswith('data:image'):
                # Handle base64 image
                img_data = base64.b64decode(input_data.split(',')[1])
                nparr = np.frombuffer(img_data, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            else:
                raise ValueError("Invalid image data format")
                
            # Resize and normalize
            target_size = config.get('input_size', (224, 224))
            img = cv2.resize(img, target_size)
            img = img.astype(np.float32) / 255.0
            return img
            
        elif model_type == 'regression':
            # Convert numeric features
            return np.array(input_data, dtype=np.float32)
            
        else:
            # Pass through for unknown types
            return input_data
            
    except Exception as e:
        raise Exception(f"Failed to preprocess input: {str(e)}")

def run_inference(model: Any, preprocessed_input: Any, model_type: str) -> Dict:
    """Run inference with loaded model"""
    try:
        if isinstance(model, torch.nn.Module):
            with torch.no_grad():
                input_tensor = torch.tensor(preprocessed_input)
                output = model(input_tensor)
                return output.numpy().tolist()
                
        elif isinstance(model, tf.keras.Model):
            output = model.predict(preprocessed_input)
            return output.tolist()
            
        elif hasattr(model, 'predict'):
            # scikit-learn style
            output = model.predict(preprocessed_input)
            return output.tolist() if isinstance(output, np.ndarray) else output
            
        elif hasattr(model, 'run'):
            # ONNX model
            output = model.run(None, {'input': preprocessed_input})
            return output[0].tolist()
            
        else:
            raise ValueError("Unsupported model type")
            
    except Exception as e:
        raise Exception(f"Inference failed: {str(e)}")

def postprocess_output(output: Any, model_type: str, config: Dict) -> Dict:
    """Postprocess model output based on type"""
    try:
        if model_type == 'text_classification':
            # Convert classification output to labels if provided
            labels = config.get('labels', [])
            if isinstance(output, (list, np.ndarray)):
                probs = output if len(output) == len(labels) else output[0]
                label_idx = np.argmax(probs)
                return {
                    'label': labels[label_idx] if labels else str(label_idx),
                    'confidence': float(probs[label_idx]),
                    'probabilities': {
                        label: float(prob) 
                        for label, prob in zip(labels or range(len(probs)), probs)
                    }
                }
                
        elif model_type == 'image_classification':
            # Similar to text classification
            return postprocess_output(output, 'text_classification', config)
            
        elif model_type == 'regression':
            # Return numeric predictions
            return {
                'prediction': float(output[0]) if isinstance(output, (list, np.ndarray)) else float(output)
            }
            
        else:
            # Default to returning raw output
            return {'output': output}
            
    except Exception as e:
        raise Exception(f"Failed to postprocess output: {str(e)}")

def main():
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected model_path and input_json arguments")
            
        model_path = sys.argv[1]
        input_json = json.loads(sys.argv[2])
        
        # Extract input data and metadata
        input_data = input_json['input']
        model_type = input_json['modelType']
        model_config = input_json['modelConfig']
        
        # Load model
        model = load_model(model_path, model_type)
        
        # Preprocess
        preprocessed_input = preprocess_input(input_data, model_type, model_config)
        
        # Run inference
        raw_output = run_inference(model, preprocessed_input, model_type)
        
        # Postprocess
        processed_output = postprocess_output(raw_output, model_type, model_config)
        
        # Return results
        result = {
            'success': True,
            'output': processed_output,
            'metadata': {
                'model_type': model_type,
                'input_shape': np.array(preprocessed_input).shape if hasattr(preprocessed_input, 'shape') else None
            }
        }
        
        print(json.dumps(result))
        
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