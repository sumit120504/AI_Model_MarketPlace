import { ethers } from 'ethers';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { getGasSettings, getReplacementGasSettings } from '../utils/gasUtils.js';

// Contract ABIs (minimal - only functions we need)
const INFERENCE_MARKET_ABI = [
  // Events
  "event InferenceRequested(uint256 indexed requestId, uint256 indexed modelId, address indexed user, bytes32 inputDataHash, uint256 payment)",
  "event InferenceComputing(uint256 indexed requestId, address indexed computeNode)",
  "event InferenceCompleted(uint256 indexed requestId, bytes32 resultHash, address computeNode)",
  "event InferenceFailed(uint256 indexed requestId, string reason)",
  "event PaymentReleased(uint256 indexed requestId, address indexed creator, address indexed computeNode, uint256 creatorAmount, uint256 nodeAmount, uint256 platformFee)",
  "event UserRefunded(uint256 indexed requestId, address indexed user, uint256 amount)",
  "event ComputeNodeAuthorized(address indexed node)",
  "event ComputeNodeRevoked(address indexed node)",
  
  // Core Functions
  "function pickupRequest(uint256 _requestId) external",
  "function submitResult(uint256 _requestId, bytes32 _resultHash, string memory _resultData) external",
  "function reportFailure(uint256 _requestId, string memory _reason) external",
  "function requestRefund(uint256 _requestId) external",
  
  // View Functions
  "function getRequest(uint256 _requestId) external view returns (tuple(uint256 requestId, uint256 modelId, address user, uint256 payment, bytes32 inputDataHash, bytes32 resultHash, address computeNode, uint256 createdAt, uint256 completedAt, uint8 status))",
  "function getPendingRequests() external view returns (uint256[] memory)",
  "function getUserRequests(address _user) external view returns (uint256[] memory)",
  "function getRequestStatus(uint256 _requestId) external view returns (string memory)",
  "function getTotalRequests() external view returns (uint256)",
  
  // Node Management
  "function authorizedComputeNodes(address) external view returns (bool)",
  "function nodeEarnings(address) external view returns (uint256)",
  "function withdrawNodeEarnings() external",
  
  // Constants
  "function TIMEOUT_DURATION() external view returns (uint256)",
  "function PLATFORM_FEE_PERCENT() external view returns (uint256)",
  "function COMPUTE_NODE_FEE_PERCENT() external view returns (uint256)"
];

const MODEL_REGISTRY_ABI = [
  // Core View Functions
  "function getModel(uint256 _modelId) external view returns (tuple(uint256 modelId, address creator, string ipfsHash, string name, string description, uint8 category, uint256 pricePerInference, uint256 creatorStake, uint256 totalInferences, uint256 totalEarnings, uint256 reputationScore, uint256 createdAt, bool isActive))",
  "function isModelAvailable(uint256 _modelId) external view returns (bool)",
  "function getCreatorModels(address _creator) external view returns (uint256[] memory)",
  "function getActiveModels() external view returns (uint256[] memory)",
  "function getTotalModels() external view returns (uint256)",
  
  // State Changing Functions
  "function registerModel(string calldata _ipfsHash, string calldata _name, string calldata _description, uint8 _category, uint256 _pricePerInference) external payable returns (uint256)",
  "function recordInference(uint256 _modelId, uint256 _payment) external",
  "function penalizeModel(uint256 _modelId, uint256 _slashAmount) external",
  
  // Events
  "event ModelRegistered(uint256 indexed modelId, address indexed creator, string name, uint256 pricePerInference)",
  "event ModelUpdated(uint256 indexed modelId, uint256 newPrice)",
  "event ModelDeactivated(uint256 indexed modelId)",
  "event ModelActivated(uint256 indexed modelId)",
  "event ReputationUpdated(uint256 indexed modelId, uint256 newScore)",
  
  // Constants
  "function MIN_STAKE() external view returns (uint256)",
  "function PLATFORM_FEE_PERCENT() external view returns (uint256)"
];

// Add constants at the top of the file after imports
const MAX_RETRIES = 5;
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
      
      // Try each RPC URL until one works
      let provider = null;
      let network = null;
      
      for (const rpcUrl of config.rpcUrls) {
        try {
          const tempProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
          network = await tempProvider.getNetwork();
          
          if (network.chainId === config.chainId) {
            provider = tempProvider;
            logger.info(`✅ Connected to RPC: ${rpcUrl}`);
            break;
          }
        } catch (error) {
          logger.warn(`Failed to connect to RPC ${rpcUrl}: ${error.message}`);
          continue;
        }
      }
      
      if (!provider) {
        throw new Error('Failed to connect to any RPC endpoint');
      }
      
      this.provider = provider;
      
      // Create wallet with proper chain
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
      
      // Verify chain and connection
      const balance = await this.wallet.getBalance();
      
      // Check authorization with retries
      let isAuthorized = false;
      for (let i = 0; i < 3; i++) {
        try {
          isAuthorized = await this.inferenceMarket.authorizedComputeNodes(this.wallet.address);
          break;
        } catch (error) {
          logger.warn(`Authorization check attempt ${i + 1} failed:`, error.message);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info(`✅ Connected to ${network.name || 'Amoy'} (Chain ID: ${network.chainId})`);
      logger.info(`Wallet: ${this.wallet.address}`);
      logger.info(`Balance: ${ethers.utils.formatEther(balance)} MATIC`);
      logger.info(`Authorized: ${isAuthorized ? 'YES ✅' : 'NO ❌'}`);
      
      if (!isAuthorized) {
        logger.warn('⚠️  Node is NOT authorized. Ask contract owner to authorize this address.');
      }
      
      if (balance.lt(ethers.utils.parseEther('0.01'))) {
        logger.warn('⚠️  Low balance! Get more test MATIC from faucet.');
      }
      
      // Verify we can get current gas prices
      const gasSettings = await this.getGasSettings(0);
      logger.info('Initial gas settings:', {
        maxPriorityFee: ethers.utils.formatUnits(gasSettings.maxPriorityFeePerGas, 'gwei') + ' Gwei',
        maxFee: ethers.utils.formatUnits(gasSettings.maxFeePerGas, 'gwei') + ' Gwei'
      });
      
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
   * Get request details with human-readable status
   */
  async getRequest(requestId) {
    try {
      const [request, status] = await Promise.all([
        this.inferenceMarket.getRequest(requestId),
        this.inferenceMarket.getRequestStatus(requestId)
      ]);
      
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
        status: request.status, // Numeric status
        statusText: status // Human readable status
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
      const isAvailable = await this.modelRegistry.isModelAvailable(modelId);
      
      // Map category to human-readable name
      const categories = [
        'TEXT_CLASSIFICATION',
        'IMAGE_CLASSIFICATION',
        'SENTIMENT_ANALYSIS',
        'OTHER'
      ];
      
      return {
        modelId: model.modelId.toString(),
        creator: model.creator,
        ipfsHash: model.ipfsHash,
        name: model.name,
        description: model.description,
        category: {
          id: model.category,
          name: categories[model.category]
        },
        pricePerInference: ethers.utils.formatEther(model.pricePerInference),
        creatorStake: ethers.utils.formatEther(model.creatorStake),
        totalInferences: model.totalInferences.toString(),
        totalEarnings: ethers.utils.formatEther(model.totalEarnings),
        reputationScore: model.reputationScore.toNumber(),
        createdAt: new Date(model.createdAt.toNumber() * 1000).toISOString(),
        isActive: model.isActive,
        isAvailable: isAvailable // Includes both active status and sufficient stake check
      };
    } catch (error) {
      logger.error(`Failed to get model #${modelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get current network gas settings with a small incremental increase per attempt
   * @param {number} attempt - retry attempt index (0-based)
   */
  /**
 * Get recommended gas settings dynamically
 */
  async getGasSettings(attempt = 0) {
    // Use exact minimum tip required by network
    const minTipCap = ethers.BigNumber.from('25000000000'); // 25 Gwei in wei
    const block = await this.provider.getBlock('latest');
    const baseFee = block.baseFeePerGas || minTipCap;
    
    // Increase tip by 25 Gwei per attempt
    const tipIncrease = ethers.utils.parseUnits(String(attempt * 25), 'gwei');
    const maxPriorityFeePerGas = minTipCap.add(tipIncrease);
    
    // Set max fee to double base fee plus priority fee
    const maxFeePerGas = baseFee.mul(2).add(maxPriorityFeePerGas);
    
    return {
      type: 2, // EIP-1559
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit: config.gasLimit,
      nonce: await this.wallet.getTransactionCount()
    };
  }

  /**
   * Execute transaction with retries
   */
  async executeWithRetry(operation) {
    let lastError;
    let attempt = 0;
    const maxAttempts = config.maxRetries;
    const baseDelay = config.baseRetryDelay;
    const maxRetryDelay = config.maxRetryDelay;
    
    // List of backup RPC URLs to try
    const rpcUrls = config.rpcUrls;

    for (const rpcUrl of rpcUrls) {
      // Update provider URL
      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(config.privateKey, this.provider);
      
      // Reconnect contracts with the new provider and wallet
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

      // Try operation with current RPC
      while (attempt < maxAttempts) {
        try {
          // Get fresh gas settings for each attempt
          const priorityLevel = attempt; // Increase priority with each attempt
          const gasParams = await getGasSettings(this.provider, priorityLevel);
          
          // Add current nonce to gas settings
          const nonce = await this.wallet.getTransactionCount();
          const params = { ...gasParams, nonce };
          
          // Execute operation
          const result = await operation(params);
          return result;

        } catch (error) {
          lastError = error;
          attempt++;
          
          if (attempt < maxAttempts) {
            // Check for specific error conditions
            if (error.code === 'REPLACEMENT_UNDERPRICED') {
              logger.info('Transaction underpriced, retrying with higher gas...');
              const replacementGas = await getReplacementGasSettings(this.provider, lastError.transaction);
              try {
                const result = await operation(replacementGas);
                return result;
              } catch (retryError) {
                lastError = retryError;
                continue;
              }
            }
            
            if (attempt < maxAttempts) {
              // Exponential backoff with max delay
              const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxRetryDelay);
              logger.info(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            
            throw error; // Max attempts reached for this RPC
          }
        }
      } catch (error) {
        lastError = error;
        logger.warn(`Failed on RPC ${rpcUrl}:`, error.message);
        
        // Try next RPC
        currentRpcIndex++;
        if (currentRpcIndex < rpcUrls.length) {
          logger.info(`Switching to next RPC: ${rpcUrls[currentRpcIndex]}`);
          continue;
        }
        
        // All RPCs exhausted
        logger.error(`All RPCs failed after ${attempt} total attempts`);
        throw lastError;
      }
    }
  }
  
  shouldRetryError(error) {
    // Network/connection errors
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || 
        error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      return true;
    }
    
    // Nonce too low - might need fresh nonce
    if (error.code === 'NONCE_EXPIRED' || error.code === 'REPLACEMENT_UNDERPRICED' ||
        (error.error?.message || '').includes('nonce too low')) {
      return true;
    }
    
    // Gas price errors
    if (this.isGasError(error)) {
      return true;
    }
    
    // RPC node errors
    if (error.code === 'SERVER_ERROR' || error.code === 'INTERNAL_ERROR' ||
        error.error?.code === -32000 || error.error?.code === -32603) {
      return true;
    }
    
    return false;
  }
  
  isGasError(error) {
    if (!error) return false;
    
    // Check various gas-related error patterns
    return error.code === 'REPLACEMENT_UNDERPRICED' ||
           error.code === 'UNPREDICTABLE_GAS_LIMIT' ||
           (error.error?.code === -32000 && (
             error.error.message.includes('gas price') ||
             error.error.message.includes('maxFeePerGas') ||
             error.error.message.includes('maxPriorityFeePerGas')
           ));
  }

  /**
   * Pickup a pending request
   */
  async pickupRequest(requestId) {
    return this.executeWithRetry(async (gasSettings) => {
      logger.info(`Picking up request #${requestId}...`);
      
      // Get current nonce and gas settings
      const nonce = await this.wallet.getTransactionCount();
      const gasParams = await getGasSettings(this.provider, 0);
      
      const tx = await this.inferenceMarket.pickupRequest(requestId, {
        ...gasParams,
        nonce
      });
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
      
  // Use gasSettings provided by executeWithRetry
  const tx = await this.inferenceMarket.submitResult(requestId, resultHash, resultData, gasSettings);
      logger.logTransaction(tx.hash, `Submit result #${requestId}`);
      
      const receipt = await tx.wait();
      
      // Check for both InferenceCompleted and PaymentReleased events
      const completedEvent = receipt.events?.find(e => e.event === 'InferenceCompleted');
      const paymentEvent = receipt.events?.find(e => e.event === 'PaymentReleased');
      
      if (completedEvent && paymentEvent) {
        const { creator, computeNode, creatorAmount, nodeAmount, platformFee } = paymentEvent.args;
        logger.info(`✅ Result submitted for #${requestId} and payment processed:`);
        logger.info(`  - Creator (${creator}): ${ethers.utils.formatEther(creatorAmount)} MATIC`);
        logger.info(`  - Compute Node (${computeNode}): ${ethers.utils.formatEther(nodeAmount)} MATIC`);
        logger.info(`  - Platform Fee: ${ethers.utils.formatEther(platformFee)} MATIC`);
      } else {
        logger.warn(`⚠️ Result submitted but payment events not found for #${requestId}`);
      }
      
      return { 
        success: true, 
        txHash: tx.hash, 
        receipt, 
        resultHash,
        paymentProcessed: !!(completedEvent && paymentEvent)
      };
    });
  }

  /**
   * Report failed inference
   */
  async reportFailure(requestId, reason) {
    return this.executeWithRetry(async (gasSettings) => {
      logger.info(`Reporting failure for request #${requestId}...`);
      
      try {
        // Get request details first
        const request = await this.inferenceMarket.getRequest(requestId);
        if (!request || request.status !== 1) { // 1 = COMPUTING
          throw new Error('Invalid request state for failure reporting');
        }
        
        // Get current nonce and gas settings
        const nonce = await this.wallet.getTransactionCount();
        const gasParams = await getGasSettings(this.provider, 0);
        
        // Report failure which triggers refund
        const tx = await this.inferenceMarket.reportFailure(requestId, reason, {
          ...gasParams,
          nonce
        });
        logger.logTransaction(tx.hash, `Report failure for request #${requestId}`);
        
        const receipt = await tx.wait();
        
        // Verify refund event
        const refundEvent = receipt.events?.find(e => e.event === 'UserRefunded');
        const failureEvent = receipt.events?.find(e => e.event === 'InferenceFailed');
        
        if (refundEvent && failureEvent) {
          logger.info(`✅ Failure reported and refund processed for request #${requestId}`);
          return { 
            success: true, 
            txHash: tx.hash, 
            receipt,
            refundAmount: ethers.utils.formatEther(refundEvent.args.amount)
          };
        } else {
          throw new Error('Required events not found in transaction receipt');
        }
      } catch (error) {
        logger.error(`Failed to report failure for request #${requestId}:`, error);
        
        // If transaction underpriced, try with higher gas
        if (error.code === 'REPLACEMENT_UNDERPRICED') {
          logger.info('Retrying with higher gas price...');
          const gasParams = await getGasSettings(this.provider, 1); // Retry with higher gas
          const tx = await this.inferenceMarket.reportFailure(requestId, reason, {
            ...gasParams,
            nonce: await this.wallet.getTransactionCount()
          });
          const receipt = await tx.wait();
          return {
            success: true,
            txHash: tx.hash,
            receipt
          };
        }
        
        throw error;
      }
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

  /**
   * Get compute node earnings
   */
  async getNodeEarnings() {
    try {
      const earnings = await this.inferenceMarket.nodeEarnings(this.wallet.address);
      return ethers.utils.formatEther(earnings);
    } catch (error) {
      logger.error('Failed to get node earnings:', error);
      throw error;
    }
  }

  /**
   * Withdraw accumulated compute node earnings
   */
  async withdrawNodeEarnings() {
    return this.executeWithRetry(async (gasSettings) => {
      logger.info('Withdrawing compute node earnings...');
      
      const tx = await this.inferenceMarket.withdrawNodeEarnings(gasSettings);
      logger.logTransaction(tx.hash, 'Withdraw node earnings');
      
      const receipt = await tx.wait();
      logger.info('✅ Node earnings withdrawn');
      
      return { success: true, txHash: tx.hash, receipt };
    });
  }

  /**
   * Get all requests for a specific user
   */
  async getUserRequests(userAddress) {
    try {
      const requestIds = await this.inferenceMarket.getUserRequests(userAddress);
      return requestIds.map(id => id.toString());
    } catch (error) {
      logger.error(`Failed to get requests for user ${userAddress}:`, error);
      return [];
    }
  }

  /**
   * Get total number of requests in the system
   */
  async getTotalRequests() {
    try {
      const total = await this.inferenceMarket.getTotalRequests();
      return total.toString();
    } catch (error) {
      logger.error('Failed to get total requests:', error);
      throw error;
    }
  }

  /**
   * Get timeout duration for requests
   */
  async getTimeoutDuration() {
    try {
      const timeout = await this.inferenceMarket.TIMEOUT_DURATION();
      return timeout.toNumber(); // Returns seconds
    } catch (error) {
      logger.error('Failed to get timeout duration:', error);
      throw error;
    }
  }

  /**
   * Get fee percentages
   */
  async getFeeStructure() {
    try {
      const [platformFee, nodeFee] = await Promise.all([
        this.inferenceMarket.PLATFORM_FEE_PERCENT(),
        this.inferenceMarket.COMPUTE_NODE_FEE_PERCENT()
      ]);
      
      return {
        platformFeePercent: platformFee.toNumber(),
        computeNodeFeePercent: nodeFee.toNumber(),
        creatorFeePercent: 100 - platformFee.toNumber() - nodeFee.toNumber()
      };
    } catch (error) {
      logger.error('Failed to get fee structure:', error);
      throw error;
    }
  }

  /**
   * Wrapper to expose gas settings via the service for tests/consumers
   * Delegates to utils.getGasSettings(provider, attempt)
   */
  async getGasSettings(attempt = 0) {
    return await getGasSettings(this.provider, attempt);
  }

  /**
   * Request refund for a timed out request
   * @param {string} requestId - Request ID
   */
  async requestRefund(requestId) {
    return this.executeWithRetry(async (gasSettings) => {
      logger.info(`Requesting refund for request #${requestId}...`);
      
      const tx = await this.inferenceMarket.requestRefund(requestId, gasSettings);
      logger.logTransaction(tx.hash, `Request refund for request #${requestId}`);
      
      const receipt = await tx.wait();
      logger.info(`✅ Refund requested for request #${requestId}`);
      
      return { success: true, txHash: tx.hash, receipt };
    });
  }

  /**
   * Get all models created by a specific address
   */
  async getCreatorModels(creatorAddress) {
    try {
      const modelIds = await this.modelRegistry.getCreatorModels(creatorAddress);
      const models = await Promise.all(
        modelIds.map(id => this.getModel(id.toString()))
      );
      return models;
    } catch (error) {
      logger.error(`Failed to get models for creator ${creatorAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get all active models in the marketplace
   */
  async getActiveModels() {
    try {
      const modelIds = await this.modelRegistry.getActiveModels();
      const models = await Promise.all(
        modelIds.map(id => this.getModel(id.toString()))
      );
      return models;
    } catch (error) {
      logger.error('Failed to get active models:', error);
      throw error;
    }
  }

  /**
   * Get total number of registered models
   */
  async getTotalModels() {
    try {
      const total = await this.modelRegistry.getTotalModels();
      return total.toString();
    } catch (error) {
      logger.error('Failed to get total models:', error);
      throw error;
    }
  }

  /**
   * Check if a model is available for inference
   * This checks both active status and sufficient stake
   */
  async isModelAvailable(modelId) {
    try {
      return await this.modelRegistry.isModelAvailable(modelId);
    } catch (error) {
      logger.error(`Failed to check model ${modelId} availability:`, error);
      throw error;
    }
  }

  /**
   * Get minimum stake required for models
   */
  async getMinStake() {
    try {
      const minStake = await this.modelRegistry.MIN_STAKE();
      return ethers.utils.formatEther(minStake);
    } catch (error) {
      logger.error('Failed to get minimum stake:', error);
      throw error;
    }
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