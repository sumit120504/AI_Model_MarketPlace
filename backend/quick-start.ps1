# quick-start.ps1 - Windows PowerShell Version (ASCII-safe)

Write-Host "=============================================="
Write-Host "   Decentralized AI Marketplace - Backend Setup"
Write-Host "=============================================="
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js not found. Please install Node.js >= 16.x"
    exit 1
}
Write-Host "[OK] Node.js version: $(node --version)"

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] npm not found"
    exit 1
}
Write-Host "[OK] npm version: $(npm --version)"
Write-Host ""

# Install dependencies
Write-Host "[INFO] Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install dependencies"
    exit 1
}
Write-Host "[OK] Dependencies installed"
Write-Host ""

# Check .env file
if (-not (Test-Path ".env")) {
    Write-Host "[WARNING] .env file not found"
    Write-Host "[INFO] Creating .env from template..."
    Copy-Item ".env.example" ".env"
    Write-Host "[OK] .env file created"
    Write-Host ""
    Write-Host "[IMPORTANT] Edit .env file with your configuration:"
    Write-Host "   - MODEL_REGISTRY_ADDRESS"
    Write-Host "   - INFERENCE_MARKET_ADDRESS"
    Write-Host "   - PRIVATE_KEY"
    Write-Host ""
    Write-Host "Run this script again after updating .env"
    exit 0
}
Write-Host "[OK] .env file found"
Write-Host ""

# Create logs directory
if (-not (Test-Path "logs")) { 
    New-Item -ItemType Directory -Path "logs" | Out-Null 
}
Write-Host "[OK] Logs directory created"
Write-Host ""

# Test spam detector
Write-Host "[INFO] Testing Spam Detector..."
npm run test:model
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Spam detector test failed"
    exit 1
}
Write-Host "[OK] All tests passed!"
Write-Host ""

# Final instructions
Write-Host "=============================================="
Write-Host "Setup Complete!"
Write-Host "=============================================="
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Verify your .env configuration:"
Write-Host "   - Contract addresses are correct"
Write-Host "   - Private key is set"
Write-Host "   - Wallet is authorized in InferenceMarket"
Write-Host ""
Write-Host "2. Start the compute node:"
Write-Host "   npm start"
Write-Host ""
Write-Host "3. Or start in development mode (auto-restart):"
Write-Host "   npm run dev"
Write-Host ""
Write-Host "4. Check status at:"
Write-Host "   http://localhost:3001/status"
Write-Host ""
Write-Host "5. Monitor logs:"
Write-Host "   Get-Content logs\compute-node.log -Wait"
Write-Host ""
Write-Host "Ready to earn from AI inferences!"
Write-Host "=============================================="
