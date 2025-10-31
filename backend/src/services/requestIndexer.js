import { getBlockchainService } from './blockchainService.js';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';

/**
 * Off-chain request indexer to avoid gas limit issues with getPendingRequests
 * Caches pending requests and updates them via events
 */
class RequestIndexer {
  constructor() {
    this.blockchain = null;
    this.cache = new NodeCache({ stdTTL: 300 }); // 5 minute cache
    this.pendingRequests = new Set();
    this.isIndexing = false;
    this.lastBlockNumber = 0;
  }

  /**
   * Initialize the indexer
   */
  async initialize() {
    try {
      this.blockchain = getBlockchainService();
      await this.blockchain.initialize();
      
      // Start listening for events
      this.startEventListening();
      
      // Initial index of pending requests
      await this.indexPendingRequests();
      
      logger.info('✅ Request Indexer initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Request Indexer:', error);
      throw error;
    }
  }

  /**
   * Start listening for blockchain events
   */
  startEventListening() {
    // Listen for new inference requests
    this.blockchain.inferenceMarket.on('InferenceRequested', (requestId, modelId, user, inputDataHash, payment, event) => {
      logger.info(`📝 Indexing new request: #${requestId.toString()}`);
      this.pendingRequests.add(requestId.toString());
      this.cache.set(`request_${requestId}`, {
        requestId: requestId.toString(),
        modelId: modelId.toString(),
        user,
        inputDataHash,
        payment: payment.toString(),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        status: 'PENDING'
      });
    });

    // Listen for request pickup (InferenceComputing event)
    this.blockchain.inferenceMarket.on('InferenceComputing', (requestId, computeNode, event) => {
      logger.info(`🔄 Request picked up: #${requestId.toString()}`);
      this.pendingRequests.delete(requestId.toString());
      this.cache.set(`request_${requestId}`, {
        ...this.cache.get(`request_${requestId}`),
        status: 'COMPUTING',
        computeNode,
        pickedUpAt: event.blockNumber
      });
    });

    // Listen for completion
    this.blockchain.inferenceMarket.on('InferenceCompleted', (requestId, resultHash, computeNode, event) => {
      logger.info(`✅ Request completed: #${requestId.toString()}`);
      this.pendingRequests.delete(requestId.toString());
      this.cache.set(`request_${requestId}`, {
        ...this.cache.get(`request_${requestId}`),
        status: 'COMPLETED',
        resultHash,
        completedAt: event.blockNumber
      });
    });

    // Listen for failures
    this.blockchain.inferenceMarket.on('InferenceFailed', (requestId, reason, event) => {
      logger.info(`❌ Request failed: #${requestId.toString()}`);
      this.pendingRequests.delete(requestId.toString());
      this.cache.set(`request_${requestId}`, {
        ...this.cache.get(`request_${requestId}`),
        status: 'FAILED',
        failureReason: reason,
        failedAt: event.blockNumber
      });
    });

    logger.info('🎧 Event listeners started');
  }

  /**
   * Index existing pending requests from blockchain
   */
  async indexPendingRequests() {
    if (this.isIndexing) {
      logger.warn('Indexing already in progress, skipping...');
      return;
    }

    try {
      this.isIndexing = true;
      logger.info('📊 Indexing existing pending requests...');

      // Get current block number
      const currentBlock = await this.blockchain.provider.getBlockNumber();
      this.lastBlockNumber = currentBlock;

      // Get pending requests from blockchain (this might hit gas limit with many requests)
      const blockchainPending = await this.blockchain.getPendingRequests();
      
      // Update our index
      this.pendingRequests.clear();
      blockchainPending.forEach(requestId => {
        this.pendingRequests.add(requestId);
      });

      logger.info(`📊 Indexed ${this.pendingRequests.size} pending requests`);
      
    } catch (error) {
      logger.error('Failed to index pending requests:', error);
      // Don't throw - we can still work with cached data
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Get pending requests from index (avoiding gas limit issues)
   */
  getPendingRequests() {
    const pending = Array.from(this.pendingRequests);
    logger.info(`📋 Returning ${pending.length} pending requests from index`);
    return pending;
  }

  /**
   * Get request details from cache or blockchain
   */
  async getRequest(requestId) {
    // Try cache first
    const cached = this.cache.get(`request_${requestId}`);
    if (cached) {
      return cached;
    }

    // Fallback to blockchain
    try {
      const request = await this.blockchain.getRequest(requestId);
      // Cache the result
      this.cache.set(`request_${requestId}`, request);
      return request;
    } catch (error) {
      logger.error(`Failed to get request #${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Check if request is pending
   */
  isRequestPending(requestId) {
    return this.pendingRequests.has(requestId.toString());
  }

  /**
   * Get indexer statistics
   */
  getStats() {
    return {
      pendingCount: this.pendingRequests.size,
      cacheSize: this.cache.keys().length,
      isIndexing: this.isIndexing,
      lastBlockNumber: this.lastBlockNumber
    };
  }

  /**
   * Periodic cleanup and re-indexing
   */
  async performMaintenance() {
    try {
      logger.info('🧹 Performing indexer maintenance...');
      
      // Clean up old cache entries
      const keys = this.cache.keys();
      const now = Date.now();
      let cleaned = 0;
      
      keys.forEach(key => {
        const entry = this.cache.get(key);
        if (entry && entry.timestamp && (now - entry.timestamp) > 300000) { // 5 minutes
          this.cache.del(key);
          cleaned++;
        }
      });
      
      if (cleaned > 0) {
        logger.info(`🧹 Cleaned up ${cleaned} old cache entries`);
      }
      
      // Re-index if needed (but not too frequently)
      const timeSinceLastIndex = Date.now() - (this.lastIndexTime || 0);
      if (timeSinceLastIndex > 60000) { // 1 minute
        await this.indexPendingRequests();
        this.lastIndexTime = Date.now();
      }
      
    } catch (error) {
      logger.error('Maintenance error:', error);
    }
  }

  /**
   * Start maintenance interval
   */
  startMaintenance() {
    // Run maintenance every 30 seconds
    setInterval(() => {
      this.performMaintenance();
    }, 30000);
    
    logger.info('🔄 Maintenance interval started');
  }
}

// Singleton instance
let requestIndexerInstance = null;

function getRequestIndexer() {
  if (!requestIndexerInstance) {
    requestIndexerInstance = new RequestIndexer();
  }
  return requestIndexerInstance;
}

export { RequestIndexer, getRequestIndexer };

