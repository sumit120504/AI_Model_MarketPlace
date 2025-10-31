# Check if Python virtual environment exists
if (-not (Test-Path ".venv")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv .venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..."
& ./.venv/Scripts/Activate.ps1

# Install requirements
Write-Host "Installing Python dependencies..."
pip install -r requirements.txt

Write-Host "✅ Python environment setup complete!"