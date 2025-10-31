import sys
import json
import torch
import tensorflow as tf
import pickle
import argparse
import hashlib
from pathlib import Path
import shutil

def hash_file(file_path):
    """Calculate SHA256 hash of file"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def validate_model(model_path, model_type):
    """Validate model can be loaded and run basic inference"""
    try:
        ext = Path(model_path).suffix.lower()
        
        if ext == '.pt' or ext == '.pth':
            model = torch.load(model_path)
            model.eval()
            # Try dummy inference
            x = torch.randn(1, 3, 224, 224)  # Example input
            with torch.no_grad():
                _ = model(x)
                
        elif ext == '.h5' or ext == '.keras':
            model = tf.keras.models.load_model(model_path)
            model.summary()
            
        elif ext == '.pkl' or ext == '.pickle':
            with open(model_path, 'rb') as f:
                model = pickle.load(f)
                # Verify it has predict method
                if not hasattr(model, 'predict'):
                    raise ValueError("Model must have predict method")
                
        elif ext == '.onnx':
            import onnxruntime as ort
            model = ort.InferenceSession(model_path)
            
        else:
            raise ValueError(f"Unsupported model format: {ext}")
            
        return True, None
        
    except Exception as e:
        return False, str(e)

def package_model(args):
    """Package model with metadata for marketplace"""
    
    # Validate input paths
    model_path = Path(args.model_path)
    if not model_path.exists():
        print(f"Error: Model file not found at {model_path}")
        return False
        
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Validate model
    print("\nValidating model...")
    valid, error = validate_model(model_path, args.model_type)
    if not valid:
        print(f"Error validating model: {error}")
        return False
        
    print("✅ Model validation successful")
    
    # Create metadata
    model_hash = hash_file(model_path)
    metadata = {
        "name": args.name,
        "description": args.description,
        "model_type": args.model_type,
        "framework": args.framework,
        "input_format": args.input_format,
        "output_format": args.output_format,
        "version": args.version,
        "creator": args.creator,
        "license": args.license,
        "hash": model_hash,
        "config": {
            "labels": args.labels.split(",") if args.labels else None,
            "input_size": [int(x) for x in args.input_size.split("x")] if args.input_size else None,
        }
    }
    
    # Save metadata
    metadata_path = output_dir / "model_metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
        
    # Copy model to output dir
    output_model = output_dir / f"model{model_path.suffix}"
    shutil.copy2(model_path, output_model)
    
    print(f"\nModel packaged successfully in {output_dir}")
    print("\nMetadata summary:")
    print(json.dumps(metadata, indent=2))
    
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Package AI model for marketplace')
    
    # Required arguments
    parser.add_argument('model_path', help='Path to model file (.pt, .h5, .pkl, etc)')
    parser.add_argument('output_dir', help='Output directory for packaged model')
    parser.add_argument('--name', required=True, help='Model name')
    parser.add_argument('--description', required=True, help='Model description')
    parser.add_argument('--model-type', required=True, choices=['text_classification', 'image_classification', 'sentiment_analysis', 'regression', 'other'], help='Type of model')
    parser.add_argument('--framework', required=True, choices=['pytorch', 'tensorflow', 'sklearn', 'other'], help='ML framework used')
    
    # Optional arguments
    parser.add_argument('--input-format', help='Description of expected input format')
    parser.add_argument('--output-format', help='Description of model output format')
    parser.add_argument('--version', default='1.0.0', help='Model version')
    parser.add_argument('--creator', help='Creator name or organization')
    parser.add_argument('--license', default='MIT', help='License')
    parser.add_argument('--labels', help='Comma-separated list of output labels (for classification)')
    parser.add_argument('--input-size', help='Input dimensions (e.g., 224x224 for images)')
    
    args = parser.parse_args()
    
    if package_model(args):
        sys.exit(0)
    else:
        sys.exit(1)