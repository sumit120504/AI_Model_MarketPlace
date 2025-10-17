#!/bin/bash

# Quick Start Script for Backend Compute Node

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Decentralized AI Marketplace - Backend Setup           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js >= 16.x"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi

echo "✅ npm version: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Check .env file
if [ ! -f .env ]; then
    echo "⚠️  .env file not found"
    echo "📝 Creating .env from template..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file with your configuration:"
    echo "   - MODEL_REGISTRY_ADDRESS"
    echo "   - INFERENCE_MARKET_ADDRESS"
    echo "   - PRIVATE_KEY"
    echo ""
    echo "Run this script again after updating .env"
    exit 0
fi

echo "✅ .env file found"
echo ""

# Create logs directory
mkdir -p logs
echo "✅ Logs directory created"
echo ""

# Test spam detector
echo "🧪 Testing Spam Detector..."
npm run test:model

if [ $? -ne 0 ]; then
    echo "❌ Spam detector test failed"
    exit 1
fi

echo ""
echo "✅ All tests passed!"
echo ""

# Final instructions
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                  Setup Complete! ✅                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "1. Verify your .env configuration:"
echo "   - Contract addresses are correct"
echo "   - Private key is set"
echo "   - Wallet is authorized in InferenceMarket"
echo ""
echo "2. Start the compute node:"
echo "   npm start"
echo ""
echo "3. Or start in development mode (auto-restart):"
echo "   npm run dev"
echo ""
echo "4. Check status at:"
echo "   http://localhost:3001/status"
echo ""
echo "5. Monitor logs:"
echo "   tail -f logs/compute-node.log"
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Ready to earn from AI inferences! 🚀                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""