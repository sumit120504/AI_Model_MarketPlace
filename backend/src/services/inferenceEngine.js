const { getBlockchainService } = require('./blockchainService');
const { getSpamDetector } = require('../models/spamDetector');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

class InferenceEngine {
  constructor() {
    this.blockchain = null;
    this.spamDetector = null;
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
      
      // Initialize blockchain service
      this.blockchain = getBlockchainService();
      await this.blockchain.initialize();
      
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
    
    // Check if already processing
    if (this.processing.has(requestId)) {
      logger.warn(`Request #${requestId} already being processed`);
      return;
    }
    
    // Mark as processing
    this.processing.set(requestId, { startTime: Date.now(), status: 'processing' });
    
    try {
      logger.logInference(requestId, 'Starting', request);
      
      // Step 1: Pickup request
      await this.blockchain.pickupRequest(requestId);
      this.processing.get(requestId).status = 'picked_up';
      
      // Step 2: Get request details
      const requestDetails = await this.blockchain.getRequest(requestId);
      
      // Step 3: Get model details
      const model = await this.blockchain.getModel(requestDetails.modelId);
      logger.info(`Using model: ${model.name} (ID: ${model.modelId})`);
      
      // Step 4: Get input data
      // In MVP, we'll use dummy text. In production, fetch from IPFS or user input
      const inputText = await this.getInputData(requestDetails.inputDataHash);
      
      // Step 5: Run AI inference
      logger.logInference(requestId, 'Running AI model...');
      const result = await this.spamDetector.detectSpam(inputText);
      
      // Step 6: Submit result to blockchain
      logger.logInference(requestId, 'Submitting result', { result: result.result });
      await this.blockchain.submitResult(requestId, result.result);
      
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
      
      // Report failure to blockchain
      try {
        await this.blockchain.reportFailure(requestId, error.message.substring(0, 100));
      } catch (reportError) {
        logger.error(`Failed to report failure for #${requestId}:`, reportError);
      }
      
      this.stats.failed++;
      this.stats.totalProcessed++;
      
    } finally {
      // Remove from processing map
      this.processing.delete(requestId);
    }
  }
  
  /**
   * Poll for pending requests (backup mechanism)
   */
  async pollPendingRequests() {
    try {
      const pendingIds = await this.blockchain.getPendingRequests();
      
      if (pendingIds.length > 0) {
        logger.info(`Found ${pendingIds.length} pending requests`);
        
        for (const requestId of pendingIds) {
          // Skip if already processing
          if (!this.processing.has(requestId)) {
            const requestDetails = await this.blockchain.getRequest(requestId);
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
   * In MVP, we use sample data. In production, fetch from IPFS or user upload
   */
  async getInputData(inputDataHash) {
    // Check cache first
    const cached = this.cache.get(inputDataHash);
    if (cached) {
      logger.info('Using cached input data');
      return cached;
    }
    
    // For MVP: Generate sample spam/non-spam emails based on hash
    // In production: Fetch actual data from IPFS or user-provided source
    
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
    const selectedEmail = sampleEmails[hashNum % sampleEmails.length];
    
    // Cache for future use
    this.cache.set(inputDataHash, selectedEmail);
    
    logger.info(`Selected sample email (hash: ${inputDataHash.substring(0, 10)}...)`);
    
    return selectedEmail;
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

module.exports = { InferenceEngine, getInferenceEngine };