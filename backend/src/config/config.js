require('dotenv').config();

const config = {
  // Blockchain
  rpcUrl: process.env.RPC_URL || 'https://rpc-mumbai.maticvigil.com',
  chainId: parseInt(process.env.CHAIN_ID) || 80001,
  networkName: process.env.NETWORK_NAME || 'mumbai',
  
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
  ipfsGateway: process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud',
  ipfsApiKey: process.env.IPFS_API_KEY,
  
  // Gas
  gasLimit: parseInt(process.env.GAS_LIMIT) || 500000,
  gasPrice: process.env.GAS_PRICE || '35'
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
  
  console.log('✅ Configuration validated');
}

module.exports = { config, validateConfig };