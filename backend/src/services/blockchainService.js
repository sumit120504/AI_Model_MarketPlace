const { ethers } = require('ethers');
const { config } = require('../config/config');
const logger = require('../utils/logger');

// Contract ABIs (minimal - only functions we need)
const INFERENCE_MARKET_ABI = [
  "event InferenceRequested(uint256 indexed requestId, uint256 indexed modelId, address indexed user, bytes32 inputDataHash, uint256 payment)",
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
   * Pickup a pending request
   */
  async pickupRequest(requestId) {
    try {
      logger.info(`Picking up request #${requestId}...`);
      
      const tx = await this.inferenceMarket.pickupRequest(requestId, {
        gasLimit: config.gasLimit
      });
      
      logger.logTransaction(tx.hash, `Pickup request #${requestId}`);
      
      const receipt = await tx.wait();
      
      logger.info(`✅ Request #${requestId} picked up (Block: ${receipt.blockNumber})`);
      
      return { success: true, txHash: tx.hash, receipt };
      
    } catch (error) {
      logger.error(`Failed to pickup request #${requestId}:`, error);
      throw error;
    }
  }
  
  /**
   * Submit inference result with proof
   */
  async submitResult(requestId, resultData) {
    try {
      logger.info(`Submitting result for request #${requestId}...`);
      
      // Generate result hash
      const resultHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(resultData)
      );
      
      logger.info(`Result: ${resultData}`);
      logger.info(`Result Hash: ${resultHash}`);
      
      const tx = await this.inferenceMarket.submitResult(
        requestId,
        resultHash,
        resultData,
        {
          gasLimit: config.gasLimit
        }
      );
      
      logger.logTransaction(tx.hash, `Submit result #${requestId}`);
      
      const receipt = await tx.wait();
      
      logger.info(`✅ Result submitted for #${requestId} (Block: ${receipt.blockNumber})`);
      
      return { success: true, txHash: tx.hash, receipt, resultHash };
      
    } catch (error) {
      logger.error(`Failed to submit result for #${requestId}:`, error);
      throw error;
    }
  }
  
  /**
   * Report failed inference
   */
  async reportFailure(requestId, reason) {
    try {
      logger.warn(`Reporting failure for request #${requestId}: ${reason}`);
      
      const tx = await this.inferenceMarket.reportFailure(requestId, reason, {
        gasLimit: config.gasLimit
      });
      
      logger.logTransaction(tx.hash, `Report failure #${requestId}`);
      
      const receipt = await tx.wait();
      
      logger.info(`✅ Failure reported for #${requestId}`);
      
      return { success: true, txHash: tx.hash, receipt };
      
    } catch (error) {
      logger.error(`Failed to report failure for #${requestId}:`, error);
      throw error;
    }
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

module.exports = { BlockchainService, getBlockchainService };