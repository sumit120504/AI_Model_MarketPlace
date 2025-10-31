import { ethers } from 'ethers';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';

// Contract ABIs (minimal - only functions we need)
const INFERENCE_MARKET_ABI = [
  // Events
  "event InferenceRequested(uint256 indexed requestId, uint256 indexed modelId, address indexed user, bytes32 inputDataHash, uint256 payment)",
  "event RequestPickedUp(uint256 indexed requestId, address indexed computeNode)",
  "event InferenceCompleted(uint256 indexed requestId, bytes32 resultHash, address indexed computeNode)",
  "event InferenceFailed(uint256 indexed requestId, string reason)",
  // Functions
  "function pickupRequest(uint256 _requestId) external",
  "function submitResult(uint256 _requestId, bytes32 _resultHash, string memory _resultData) external",
  "function reportFailure(uint256 _requestId, string memory _reason) external",
  "function getRequest(uint256 _requestId) external view returns (tuple(uint256 requestId, uint256 modelId, address user, uint256 payment, bytes32 inputDataHash, bytes32 resultHash, address computeNode, uint256 createdAt, uint256 completedAt, uint8 status))",
  "function getPendingRequests() external view returns (uint256[] memory)",
  "function authorizedComputeNodes(address) external view returns (bool)"
];

const MODEL_REGISTRY_ABI = [
  "function getModel(uint256 _modelId) external view returns (tuple(uint256 modelId, address creator, string ipfsHash, string name, string description, uint8 category, uint256 pricePerInference, uint256 creatorStake, uint256 totalInferences, uint256 totalEarnings, uint256 reputationScore, uint256 createdAt, bool isActive))"
];

// Add constants at the top of the file after imports
const MIN_GAS_PRICE = ethers.utils.parseUnits('25', 'gwei'); // 25 Gwei minimum
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.inferenceMarket = null;
    this.modelRegistry = null;
    this.isConnected = false;
  }
  
  /**
   * Initialize blockchain connection
   */
  async initialize() {
    try {
      logger.info('Connecting to blockchain...');
      
      // Create provider
      this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      
      // Create wallet
      this.wallet = new ethers.Wallet(config.privateKey, this.provider);
      
      // Connect to contracts
      this.inferenceMarket = new ethers.Contract(
        config.inferenceMarketAddress,
        INFERENCE_MARKET_ABI,
        this.wallet
      );
      
      this.modelRegistry = new ethers.Contract(
        config.modelRegistryAddress,
        MODEL_REGISTRY_ABI,
        this.wallet
      );
      
      // Verify connection
      const network = await this.provider.getNetwork();
      const balance = await this.wallet.getBalance();
      const isAuthorized = await this.inferenceMarket.authorizedComputeNodes(this.wallet.address);
      
      logger.info(`✅ Connected to ${network.name} (Chain ID: ${network.chainId})`);
      logger.info(`Wallet: ${this.wallet.address}`);
      logger.info(`Balance: ${ethers.utils.formatEther(balance)} MATIC`);
      logger.info(`Authorized: ${isAuthorized ? 'YES ✅' : 'NO ❌'}`);
      
      if (!isAuthorized) {
        logger.warn('⚠️  Node is NOT authorized. Ask contract owner to authorize this address.');
      }
      
      if (balance.lt(ethers.utils.parseEther('0.01'))) {
        logger.warn('⚠️  Low balance! Get more test MATIC from faucet.');
      }
      
      this.isConnected = true;
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize blockchain connection:', error);
      throw error;
    }
  }
  
  /**
   * Listen for InferenceRequested events
   * @param {Function} callback - Called when new request detected
   */
  listenForRequests(callback) {
    logger.info('Starting event listener for InferenceRequested...');
    
    this.inferenceMarket.on('InferenceRequested', (requestId, modelId, user, inputDataHash, payment, event) => {
      logger.info(`🔔 New inference request detected: #${requestId.toString()}`);
      
      callback({
        requestId: requestId.toString(),
        modelId: modelId.toString(),
        user,
        inputDataHash,
        payment: ethers.utils.formatEther(payment),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });
    });
    
    logger.info('✅ Event listener active');
  }
  
  /**
   * Get pending requests from blockchain
   */
  async getPendingRequests() {
    try {
      const requestIds = await this.inferenceMarket.getPendingRequests();
      return requestIds.map(id => id.toString());
    } catch (error) {
      logger.error('Failed to get pending requests:', error);
      return [];
    }
  }
  
  /**
   * Get request details
   */
  async getRequest(requestId) {
    try {
      const request = await this.inferenceMarket.getRequest(requestId);
      
      return {
        requestId: request.requestId.toString(),
        modelId: request.modelId.toString(),
        user: request.user,
        payment: ethers.utils.formatEther(request.payment),
        inputDataHash: request.inputDataHash,
        resultHash: request.resultHash,
        computeNode: request.computeNode,
        createdAt: request.createdAt.toString(),
        completedAt: request.completedAt.toString(),
        status: request.status // 0=PENDING, 1=COMPUTING, 2=COMPLETED, 3=FAILED, 4=REFUNDED
      };
    } catch (error) {
      logger.error(`Failed to get request #${requestId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get model details
   */
  async getModel(modelId) {
    try {
      const model = await this.modelRegistry.getModel(modelId);
      
      return {
        modelId: model.modelId.toString(),
        creator: model.creator,
        ipfsHash: model.ipfsHash,
        name: model.name,
        description: model.description,
        category: model.category,
        pricePerInference: ethers.utils.formatEther(model.pricePerInference),
        isActive: model.isActive
      };
    } catch (error) {
      logger.error(`Failed to get model #${modelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get current network gas settings with minimum values enforced
   */
  async getGasSettings() {
    const feeData = await this.provider.getFeeData();
    return {
      maxFeePerGas: feeData.maxFeePerGas?.gt(MIN_GAS_PRICE) 
        ? feeData.maxFeePerGas 
        : MIN_GAS_PRICE,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.gt(MIN_GAS_PRICE) 
        ? feeData.maxPriorityFeePerGas 
        : MIN_GAS_PRICE,
      gasLimit: config.gasLimit
    };
  }

  /**
   * Execute transaction with retries
   */
  async executeWithRetry(operation) {
    let lastError;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const gasSettings = await this.getGasSettings();
        return await operation(gasSettings);
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${i + 1}/${MAX_RETRIES} failed: ${error.message}`);
        if (i < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }
    throw lastError;
  }

  /**
   * Pickup a pending request
   */
  async pickupRequest(requestId) {
    return this.executeWithRetry(async (gasSettings) => {
      logger.info(`Picking up request #${requestId}...`);
      
      const tx = await this.inferenceMarket.pickupRequest(requestId, gasSettings);
      logger.logTransaction(tx.hash, `Pickup request #${requestId}`);
      
      const receipt = await tx.wait();
      logger.info(`✅ Request #${requestId} picked up (Block: ${receipt.blockNumber})`);
      
      return { success: true, txHash: tx.hash, receipt };
    });
  }

  /**
   * Submit inference result with proof
   */
  async submitResult(requestId, resultData) {
    return this.executeWithRetry(async (gasSettings) => {
      logger.info(`Submitting result for request #${requestId}...`);
      
      const resultHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(resultData));
      logger.info(`Result Hash: ${resultHash}`);
      
      const tx = await this.inferenceMarket.submitResult(requestId, resultHash, resultData, gasSettings);
      logger.logTransaction(tx.hash, `Submit result #${requestId}`);
      
      const receipt = await tx.wait();
      logger.info(`✅ Result submitted for #${requestId} (Block: ${receipt.blockNumber})`);
      
      return { success: true, txHash: tx.hash, receipt, resultHash };
    });
  }

  /**
   * Report failed inference
   */
  async reportFailure(requestId, reason) {
    return this.executeWithRetry(async (gasSettings) => {
      logger.warn(`Reporting failure for request #${requestId}: ${reason}`);
      
      const tx = await this.inferenceMarket.reportFailure(requestId, reason, gasSettings);
      logger.logTransaction(tx.hash, `Report failure #${requestId}`);
      
      const receipt = await tx.wait();
      logger.info(`✅ Failure reported for #${requestId}`);
      
      return { success: true, txHash: tx.hash, receipt };
    });
  }

  /**
   * Get current gas price
   */
  async getGasPrice() {
    const gasPrice = await this.provider.getGasPrice();
    return ethers.utils.formatUnits(gasPrice, 'gwei');
  }
  
  /**
   * Get wallet balance
   */
  async getBalance() {
    const balance = await this.wallet.getBalance();
    return ethers.utils.formatEther(balance);
  }
}

// Singleton instance
let blockchainServiceInstance = null;

function getBlockchainService() {
  if (!blockchainServiceInstance) {
    blockchainServiceInstance = new BlockchainService();
  }
  return blockchainServiceInstance;
}

export { BlockchainService, getBlockchainService };