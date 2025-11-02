import 'dotenv/config';

const config = {
  // Blockchain
  rpcUrls: [
    'https://rpc-amoy.polygon.technology/',
    'https://polygon-amoy.blockpi.network/v1/rpc/public',
    'https://polygon-amoy.drpc.org',
    'https://polygon-amoy-bor-rpc.publicnode.com',
    'https://polygon-amoy-heimdall-rpc.publicnode.com',
    // Add managed endpoints (Tenderly/Alchemy/QuickNode/Chainstack) for production
    // 'https://polygon-amoy.gateway.tenderly.co/<ACCESS_KEY>',
  ],
  rpcUrl: 'https://rpc-amoy.polygon.technology/',  // Primary RPC
  chainId: 80002,  // Amoy testnet chainId
  networkName: 'amoy',
  
  // Contracts
  modelRegistryAddress: process.env.MODEL_REGISTRY_ADDRESS,
  inferenceMarketAddress: process.env.INFERENCE_MARKET_ADDRESS,
  
  // Node Credentials
  privateKey: process.env.PRIVATE_KEY,
  nodeAddress: process.env.NODE_ADDRESS,
  
  // API
  port: parseInt(process.env.PORT) || 3001,
  host: process.env.HOST || 'localhost',
  
  // Polling
  pollInterval: parseInt(process.env.POLL_INTERVAL) || 5000,
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5,
  
  // AI Model
  modelPath: process.env.MODEL_PATH || './models/spam_detector',
  modelCacheSize: parseInt(process.env.MODEL_CACHE_SIZE) || 3,
  inferenceTimeout: parseInt(process.env.INFERENCE_TIMEOUT) || 30000,
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || './logs/compute-node.log',
  
  // IPFS
  ipfsGateway: process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs',
  ipfsApiKey: process.env.PINATA_API_KEY,
  ipfsSecretKey: process.env.PINATA_SECRET_KEY,
  
  // Gas Settings
  gasLimit: parseInt(process.env.GAS_LIMIT) || 500000,
  minGasPrice: process.env.MIN_GAS_PRICE || '40', // 40 Gwei minimum
  maxGasPrice: process.env.MAX_GAS_PRICE || '500', // 500 Gwei maximum
  minTipCap: process.env.MIN_TIP_CAP || '25', // 25 Gwei minimum tip required by network
  priorityIncrease: parseFloat(process.env.PRIORITY_INCREASE) || 1.3, // 30% increase per attempt
  
  // Transaction retry settings
  maxRetries: parseInt(process.env.MAX_RETRIES) || 5,
  baseRetryDelay: parseInt(process.env.BASE_RETRY_DELAY) || 1000, // 1 second base delay
  maxRetryDelay: parseInt(process.env.MAX_RETRY_DELAY) || 10000 // 10 second max delay
};

// Validation
function validateConfig() {
  const required = [
    'modelRegistryAddress',
    'inferenceMarketAddress',
    'privateKey'
  ];
  
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }
  
  // Validate addresses
  if (!config.modelRegistryAddress.startsWith('0x')) {
    throw new Error('Invalid modelRegistryAddress');
  }
  
  if (!config.inferenceMarketAddress.startsWith('0x')) {
    throw new Error('Invalid inferenceMarketAddress');
  }

  // Validate IPFS configuration
  if (!config.ipfsApiKey || !config.ipfsSecretKey) {
    throw new Error('Missing Pinata API credentials (PINATA_API_KEY and PINATA_SECRET_KEY)');
  }
  
  console.log('✅ Configuration validated');
}

export { config, validateConfig };