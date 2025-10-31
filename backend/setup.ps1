# AI Model Marketplace Setup Script
param (
    [string]$pythonPath
)

Write-Host "🚀 Setting up AI Model Marketplace environment..."

# Create virtual environment if not exists
if (-not (Test-Path ".venv")) {
    Write-Host "Creating Python virtual environment..."
    if ($pythonPath) {
        & $pythonPath -m venv .venv
    } else {
        python -m venv .venv
    }
}

# Activate virtual environment
Write-Host "Activating virtual environment..."
& ".\.venv\Scripts\Activate.ps1"

# Install required packages
Write-Host "Installing Python dependencies..."
pip install -r requirements.txt

# Verify dependencies
Write-Host "Verifying dependencies..."
python src/models/import_check.py

# Create model download directory
Write-Host "Creating model directories..."
New-Item -ItemType Directory -Force -Path "models/downloaded"

Write-Host "`n✅ Setup complete!"
Write-Host @"

To package your model for the marketplace:
python src/models/package_model.py [model_path] [output_dir] --name "Model Name" --description "Model Description" --model-type [type] --framework [framework]

Example:
python src/models/package_model.py models/my_model.pt packaged_model --name "Image Classifier" --description "Classifies images into 10 categories" --model-type image_classification --framework pytorch --input-size 224x224 --labels "cat,dog,bird"

Available model types:
- text_classification
- image_classification 
- sentiment_analysis
- regression
- other

Available frameworks:
- pytorch
- tensorflow
- sklearn
- other
"@