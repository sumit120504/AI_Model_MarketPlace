# AI Model Marketplace

A decentralized marketplace for AI models using blockchain and IPFS.

## Prerequisites

- Node.js (v16 or higher)
- Python (v3.8 or higher)
- Git

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/sumit120504/AI_Model_MarketPlace.git
cd AI_Model_MarketPlace
```

2. Install all dependencies (this will set up both frontend and backend):
```bash
npm run install:all
```

3. Start the development servers:
```bash
npm run dev
```

This will start:
- Backend server at http://localhost:3000
- Frontend development server at http://localhost:5173

## Project Structure

```
AI_Model_MarketPlace/
├── backend/              # Backend server
│   ├── src/             # Source code
│   ├── models/          # Model storage
│   └── requirements.txt # Python dependencies
├── frontend/            # Frontend application
│   └── src/            # Source code
└── contracts/          # Smart contracts
```

## Development

- Frontend is built with React + Vite
- Backend uses Express.js + Python for model execution
- Smart contracts use Solidity

### Available Commands

Root directory:
```bash
npm run dev          # Start both frontend and backend in development mode
npm run start        # Start both services in production mode
npm run build        # Build frontend for production
npm run install:all  # Install all dependencies
```

Backend:
```bash
cd backend
npm run dev     # Start backend with hot-reload
npm run start   # Start backend in production mode
npm test        # Run tests
```

Frontend:
```bash
cd frontend
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
```

## Environment Setup

1. Backend (.env):
```env
PORT=3000
RPC_URL=your_ethereum_rpc_url
PRIVATE_KEY=your_private_key
IPFS_API_KEY=your_pinata_api_key
IPFS_SECRET_KEY=your_pinata_secret_key
```

2. Frontend (.env):
```env
VITE_BACKEND_URL=http://localhost:3000
VITE_CHAIN_ID=your_chain_id
```

## Adding Models to Marketplace

1. Prepare your model:
```bash
cd backend
python src/models/package_model.py [model_path] [output_dir] \
  --name "Model Name" \
  --description "Model Description" \
  --model-type [type] \
  --framework [framework]
```

2. Use the frontend interface to:
- Upload packaged model
- Set price and stake amount
- Register on blockchain

## License

MIT