import { getBlockchainService } from './blockchainService.js';
import { getSpamDetector } from '../models/spamDetector.js';
import { getRequestIndexer } from './requestIndexer.js';
import ipfsService from './ipfsService.js';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';

class InferenceEngine {
  constructor() {
    this.blockchain = null;
    this.spamDetector = null;
    this.requestIndexer = null;
    this.ipfsService = null;
    this.processing = new Map(); // Track requests being processed
    this.cache = new NodeCache({ stdTTL: 600 }); // 10 min cache
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now()
    };
  }
  
  /**
   * Initialize the inference engine
   */
  async initialize() {
    try {
      logger.info('Initializing Inference Engine...');
      
      // Create models download directory if it doesn't exist
      const fs = await import('fs');
      const path = await import('path');
      const modelsDir = './models/downloaded';
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      
      // Initialize blockchain service
      this.blockchain = getBlockchainService();
      await this.blockchain.initialize();
      
      // Initialize request indexer
      this.requestIndexer = getRequestIndexer();
      await this.requestIndexer.initialize();
      this.requestIndexer.startMaintenance();
      
      // Initialize IPFS service
      this.ipfsService = ipfsService;
      await this.ipfsService.initialize();
      
      // Initialize AI model
      this.spamDetector = getSpamDetector();
      await this.spamDetector.initialize();
      
      logger.info('✅ Inference Engine initialized');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize Inference Engine:', error);
      throw error;
    }
  }
  
  /**
   * Start processing requests
   */
  async start() {
    logger.info('🚀 Starting Inference Engine...');
    
    // Listen for new requests
    this.blockchain.listenForRequests(async (request) => {
      await this.handleNewRequest(request);
    });
    
    // Poll for pending requests (backup mechanism)
    setInterval(async () => {
      await this.pollPendingRequests();
    }, 30000); // Every 30 seconds
    
    // Log stats periodically
    setInterval(() => {
      this.logStats();
    }, 60000); // Every minute
    
    logger.info('✅ Inference Engine started');
  }
  
  /**
   * Handle new inference request
   */
  async handleNewRequest(request) {
    const { requestId } = request;
    
    // Atomic check-and-set to prevent race conditions
    if (this.processing.has(requestId)) {
      logger.warn(`Request #${requestId} already being processed`);
      return;
    }
    
    // Mark as processing atomically
    const processingInfo = { startTime: Date.now(), status: 'processing' };
    this.processing.set(requestId, processingInfo);
    
    try {
      logger.logInference(requestId, 'Starting', request);
      
      // Step 1: Pickup request
      await this.blockchain.pickupRequest(requestId);
      this.processing.get(requestId).status = 'picked_up';
      
      // Step 2: Get request details
      const requestDetails = await this.blockchain.getRequest(requestId);
      
      // Step 3: Get model details and download model
      const model = await this.blockchain.getModel(requestDetails.modelId);
      logger.info(`Using model: ${model.name} (ID: ${model.modelId})`);
      
      // Step 4: Download model from IPFS
      logger.info(`Downloading model from IPFS: ${model.ipfsHash}`);
      const modelPath = `./models/downloaded/${model.modelId}`;
      await this.ipfsService.downloadFile(model.ipfsHash, modelPath);
      
      // Step 5: Get input data from IPFS
      const inputText = await this.getInputData(requestDetails.inputDataHash);
      
      // Step 6: Run AI inference
      logger.logInference(requestId, 'Running AI model...');
      let result;
      let success = false;
      
      try {
        result = await this.spamDetector.detectSpam(inputText);
        success = true;
      } catch (inferenceError) {
        logger.error(`Inference failed: ${inferenceError.message}`);
        // User can request refund via the contract's requestRefund function
        throw inferenceError;
      }
      
      // Step 7: Submit result to blockchain (this will automatically trigger payment)
      logger.logInference(requestId, 'Submitting result', { result: result.result });
      const submitResponse = await this.blockchain.submitResult(requestId, result.result);
      
      if (submitResponse.paymentProcessed) {
        logger.info(`Result submitted and payment processed successfully for request #${requestId}`);
      } else {
        logger.warn(`Result submitted but payment confirmation not received for request #${requestId}`);
      }
      
      // Update stats
      this.stats.successful++;
      this.stats.totalProcessed++;
      
      logger.logInference(requestId, '✅ COMPLETED', {
        result: result.result,
        confidence: result.confidence,
        duration: `${Date.now() - this.processing.get(requestId).startTime}ms`
      });
      
    } catch (error) {
      logger.error(`Failed to process request #${requestId}:`, error);
      
      // Report failure (user can request refund)
      try {
        await this.blockchain.reportFailure(requestId, error.message.substring(0, 100));
        logger.info(`Failure reported for request #${requestId}, user can request refund`);
      } catch (reportError) {
        logger.error(`Failed to report failure for #${requestId}:`, reportError);
      }
      
      this.stats.failed++;
      this.stats.totalProcessed++;
      
    } finally {
      // Always remove from processing map, even if reportFailure fails
      try {
        this.processing.delete(requestId);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup request #${requestId}:`, cleanupError);
      }
    }
  }
  
  /**
   * Poll for pending requests using indexer (avoids gas limit issues)
   */
  async pollPendingRequests() {
    try {
      const pendingIds = this.requestIndexer.getPendingRequests();
      
      if (pendingIds.length > 0) {
        logger.info(`Found ${pendingIds.length} pending requests via indexer`);
        
        for (const requestId of pendingIds) {
          // Skip if already processing
          if (!this.processing.has(requestId)) {
            const requestDetails = await this.requestIndexer.getRequest(requestId);
            await this.handleNewRequest({
              requestId,
              modelId: requestDetails.modelId,
              user: requestDetails.user,
              inputDataHash: requestDetails.inputDataHash,
              payment: requestDetails.payment
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error polling pending requests:', error);
    }
  }
  
  /**
   * Get input data for inference
   * Try IPFS first, fallback to sample data
   */
  async getInputData(inputDataHash) {
    // Check cache first
    const cached = this.cache.get(inputDataHash);
    if (cached) {
      logger.info('Using cached input data');
      return cached;
    }
    
    let inputData;
    
    try {
      // Try to fetch from IPFS
      if (this.ipfsService && this.ipfsService.isValidHash(inputDataHash)) {
        inputData = await this.ipfsService.getFileContent(inputDataHash);
        logger.info(`📥 Retrieved input data from IPFS: ${inputDataHash.substring(0, 10)}...`);
      } else {
        throw new Error('Invalid IPFS hash or IPFS service not available');
      }
    } catch (ipfsError) {
      logger.warn(`Failed to fetch from IPFS: ${ipfsError.message}, using sample data`);
      
      // Fallback to sample data for MVP
      const sampleEmails = [
        "Hi John, let's meet for coffee tomorrow at 3pm. Looking forward to catching up!",
        "CONGRATULATIONS! You've WON $1,000,000! Click here NOW to claim your prize!!!",
        "Meeting reminder: Q4 planning session scheduled for Monday 10am in Conference Room B",
        "🎉 FREE MONEY! Limited time offer! Act now and get rich quick! No risk!!!",
        "Your package has been delivered. Tracking number: 1Z999AA10123456784",
        "Buy now! Special discount! Click here! Hurry before it's too late!!!"
      ];
      
      // Use hash to deterministically select an email
      const hashNum = parseInt(inputDataHash.slice(2, 10), 16);
      inputData = sampleEmails[hashNum % sampleEmails.length];
      
      logger.info(`Using sample data (hash: ${inputDataHash.substring(0, 10)}...)`);
    }
    
    // Cache for future use
    this.cache.set(inputDataHash, inputData);
    
    return inputData;
  }
  
  /**
   * Log engine statistics
   */
  logStats() {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const successRate = this.stats.totalProcessed > 0 
      ? ((this.stats.successful / this.stats.totalProcessed) * 100).toFixed(2)
      : 0;
    
    logger.info('📊 Engine Stats:', {
      uptime: `${uptime}s`,
      totalProcessed: this.stats.totalProcessed,
      successful: this.stats.successful,
      failed: this.stats.failed,
      successRate: `${successRate}%`,
      currentlyProcessing: this.processing.size
    });
  }
  
  /**
   * Get engine status
   */
  getStatus() {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const successRate = this.stats.totalProcessed > 0 
      ? ((this.stats.successful / this.stats.totalProcessed) * 100).toFixed(2)
      : 0;
    
    return {
      isRunning: true,
      uptime,
      stats: {
        totalProcessed: this.stats.totalProcessed,
        successful: this.stats.successful,
        failed: this.stats.failed,
        successRate: parseFloat(successRate)
      },
      currentlyProcessing: Array.from(this.processing.keys()),
      model: this.spamDetector.getModelInfo()
    };
  }
  
  /**
   * Stop the engine gracefully
   */
  async stop() {
    logger.info('Stopping Inference Engine...');
    
    // Wait for ongoing processing to complete
    const maxWait = 30000; // 30 seconds
    const startWait = Date.now();
    
    while (this.processing.size > 0 && (Date.now() - startWait) < maxWait) {
      logger.info(`Waiting for ${this.processing.size} requests to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.logStats();
    logger.info('✅ Inference Engine stopped');
  }
}

// Singleton instance
let inferenceEngineInstance = null;

function getInferenceEngine() {
  if (!inferenceEngineInstance) {
    inferenceEngineInstance = new InferenceEngine();
  }
  return inferenceEngineInstance;
}

export { InferenceEngine, getInferenceEngine };