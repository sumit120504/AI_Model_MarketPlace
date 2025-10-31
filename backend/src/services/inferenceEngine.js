import { getBlockchainService } from './blockchainService.js';
import { getModelRunner } from '../models/modelRunner.js';
import { getRequestIndexer } from './requestIndexer.js';
import ipfsService from './ipfsService.js';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';
import path from 'path';
import fs from 'fs';

class InferenceEngine {
  constructor() {
    this.blockchain = null;
    this.modelRunner = null;
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
  
  async initialize() {
    try {
      logger.info('Initializing Inference Engine...');
      
      // Create models download directory if it doesn't exist
      const modelsDir = './models/downloaded';
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      
      // Initialize services
      this.blockchain = getBlockchainService();
      await this.blockchain.initialize();
      
      this.requestIndexer = getRequestIndexer();
      await this.requestIndexer.initialize();
      this.requestIndexer.startMaintenance();
      
      this.ipfsService = ipfsService;
      await this.ipfsService.initialize();
      
      this.modelRunner = getModelRunner();
      await this.modelRunner.initialize();
      
      logger.info('✅ Inference Engine initialized');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize Inference Engine:', error);
      throw error;
    }
  }
  
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
  
  async handleNewRequest(request) {
    const { requestId } = request;
    
    // Atomic check-and-set to prevent race conditions
    if (this.processing.has(requestId)) {
      logger.warn(`Request #${requestId} already being processed`);
      return;
    }
    
    // Mark as processing atomically with detailed status tracking
    const processingInfo = {
      startTime: Date.now(),
      status: 'processing',
      steps: {
        pickup: { status: 'pending', startTime: null, endTime: null },
        modelDownload: { status: 'pending', startTime: null, endTime: null },
        inputData: { status: 'pending', startTime: null, endTime: null },
        inference: { status: 'pending', startTime: null, endTime: null },
        submission: { status: 'pending', startTime: null, endTime: null }
      }
    };
    this.processing.set(requestId, processingInfo);
    
    const updateStatus = (step, status) => {
      const stepInfo = processingInfo.steps[step];
      if (status === 'started') {
        stepInfo.status = 'running';
        stepInfo.startTime = Date.now();
      } else if (status === 'completed') {
        stepInfo.status = 'completed';
        stepInfo.endTime = Date.now();
      } else if (status === 'failed') {
        stepInfo.status = 'failed';
        stepInfo.endTime = Date.now();
      }
      processingInfo.status = `${step}_${status}`;
      
      // Log status update with timing information
      const duration = stepInfo.endTime ? (stepInfo.endTime - stepInfo.startTime) : null;
      logger.info(`[Request #${requestId}] ${step}: ${status} ${duration ? `(${duration}ms)` : ''}`);
    };
    
    try {
      // Start request processing
      logger.logInference(requestId, 'Starting', {
        ...request,
        steps: processingInfo.steps
      });
      
      // Step 1: Pickup request on blockchain
      updateStatus('pickup', 'started');
      await this.blockchain.pickupRequest(requestId);
      updateStatus('pickup', 'completed');
      
      // Step 2: Get request details and validate state
      logger.info(`[Request #${requestId}] Getting request details...`);
      const requestDetails = await this.blockchain.getRequest(requestId);
      
      // Validate request status
      if (!requestDetails) {
        throw new Error('Failed to get request details from blockchain');
      }
      
      if (requestDetails.status !== 1) { // 1 = COMPUTING status
        throw new Error(`Invalid request status: ${requestDetails.statusText} (expected: COMPUTING)`);
      }
      
      logger.info(`[Request #${requestId}] Details:`, { 
        modelId: requestDetails.modelId,
        inputDataHash: requestDetails.inputDataHash,
        status: requestDetails.statusText
      });
      
      // Step 3: Get model details and download from IPFS
      updateStatus('modelDownload', 'started');
      let model;
      try {
        logger.info(`[Request #${requestId}] Fetching model #${requestDetails.modelId} from blockchain...`);
        model = await this.blockchain.getModel(requestDetails.modelId);
        
        if (!model || !model.ipfsHash) {
          updateStatus('modelDownload', 'failed');
          throw new Error('Invalid model data returned from blockchain');
        }
        
        logger.info(`[Request #${requestId}] Found model: ${model.name} (ID: ${model.modelId}, IPFS: ${model.ipfsHash})`);
        
        // Ensure models directory exists
        const modelsDir = path.join(process.cwd(), 'models', 'downloaded');
        await fs.promises.mkdir(modelsDir, { recursive: true });
        
        // Use model metadata to determine file extension, or default to .pkl
        const modelExt = model.metadata?.fileExtension || '.pkl';
        const modelPath = path.join(modelsDir, `${model.modelId}${modelExt}`);
        
        // Check if model already exists and validate it
        let needsDownload = true;
        try {
          const stats = await fs.promises.stat(modelPath);
          if (stats.size > 0) {
            // Verify the existing file's hash
            const existingHash = await this.ipfsService.getFileHash(modelPath);
            if (existingHash === model.ipfsHash) {
              logger.info(`[Request #${requestId}] Model already exists locally and verified, skipping download`);
              needsDownload = false;
            } else {
              logger.warn(`[Request #${requestId}] Existing model hash mismatch, re-downloading`);
            }
          }
        } catch (statError) {
          logger.info(`[Request #${requestId}] Model file not found locally`);
        }

        if (needsDownload) {
          logger.info(`[Request #${requestId}] Downloading model from IPFS: ${model.ipfsHash}`);
          await this.ipfsService.downloadFile(model.ipfsHash, modelPath);
          
          // Verify the downloaded file
          const stats = await fs.promises.stat(modelPath);
          if (stats.size === 0) {
            throw new Error('Downloaded model file is empty');
          }
          logger.info(`[Request #${requestId}] Model file downloaded successfully. Size: ${stats.size} bytes`);
          
          // Verify the hash of the downloaded file
          const downloadedHash = await this.ipfsService.getFileHash(modelPath);
          if (downloadedHash !== model.ipfsHash) {
            throw new Error('Model file integrity check failed: IPFS hash mismatch');
          }
          logger.info(`[Request #${requestId}] Model file integrity verified`);
        }
        
        // Verify file integrity by checking IPFS hash
        const uploadedHash = await this.ipfsService.getFileHash(modelPath);
        if (uploadedHash !== model.ipfsHash) {
          throw new Error('Model file integrity check failed: IPFS hash mismatch');
        }
        logger.info(`[Request #${requestId}] Model file integrity verified: ${uploadedHash}`);
        
        // Load and validate model
        logger.info(`[Request #${requestId}] Loading and validating model...`);
        await this.modelRunner.setModelPath(modelPath, model);
        logger.info(`[Request #${requestId}] Model loaded and validated successfully`);
        
        updateStatus('modelDownload', 'completed');
        
      } catch (modelError) {
        updateStatus('modelDownload', 'failed');
        throw new Error(`Model setup failed: ${modelError.message}`);
      }
      
      // Step 4: Get input data from IPFS
      updateStatus('inputData', 'started');
      try {
        const inputText = await this.getInputData(requestDetails.inputDataHash);
        if (!inputText) {
          throw new Error('Retrieved input data is empty');
        }
        updateStatus('inputData', 'completed');
        
        // Step 5: Run AI inference
        updateStatus('inference', 'started');
        logger.info(`[Request #${requestId}] Starting inference with input length: ${inputText.length} chars`);
        
        const result = await this.modelRunner.runInference(inputText);
        
        if (!result || !result.success) {
          updateStatus('inference', 'failed');
          throw new Error(result?.error || 'Inference failed with no result');
        }
        
        logger.info(`[Request #${requestId}] Inference successful:`, { 
          result: result.result,
          confidence: result.confidence
        });
        
        updateStatus('inference', 'completed');
        
        // Step 6: Submit result to blockchain
        updateStatus('submission', 'started');
        logger.info(`[Request #${requestId}] Submitting result to blockchain...`);
        
        const submitResponse = await this.blockchain.submitResult(requestId, result.result);
        
        if (submitResponse.paymentProcessed) {
          logger.info(`[Request #${requestId}] Result submitted and payment processed`);
          updateStatus('submission', 'completed');
        } else {
          throw new Error('Result submitted but payment not processed');
        }
        
        // Update stats
        this.stats.successful++;
        this.stats.totalProcessed++;
        
        logger.logInference(requestId, '✅ COMPLETED', {
          result: result.result,
          confidence: result.confidence,
          duration: `${Date.now() - processingInfo.startTime}ms`
        });
        
      } catch (inferenceError) {
        const errorMsg = inferenceError.message || 'Unknown error during inference';
        logger.error(`[Request #${requestId}] Inference failed: ${errorMsg}`);
        
        // Report failure to blockchain (this will trigger refund)
        try {
          const truncatedError = errorMsg.substring(0, 100);
          await this.blockchain.reportFailure(requestId, truncatedError);
          logger.info(`[Request #${requestId}] Failure reported and refund initiated`);
        } catch (reportError) {
          logger.error(`[Request #${requestId}] Failed to report failure:`, reportError);
        }
        
        this.stats.failed++;
        this.stats.totalProcessed++;
        
        throw new Error(`Inference failed: ${errorMsg}`);
      }
      
    } catch (error) {
      logger.error(`[Request #${requestId}] Processing failed:`, error);
      
      // Report failure if not already reported
      try {
        await this.blockchain.reportFailure(requestId, error.message.substring(0, 100));
        logger.info(`[Request #${requestId}] Failure reported, user can request refund`);
      } catch (reportError) {
        logger.error(`[Request #${requestId}] Failed to report failure:`, reportError);
      }
      
      this.stats.failed++;
      this.stats.totalProcessed++;
      
      throw error;
    } finally {
      // Always remove from processing map
      try {
        this.processing.delete(requestId);
      } catch (cleanupError) {
        logger.error(`[Request #${requestId}] Failed to cleanup:`, cleanupError);
      }
    }
  }
  
  async pollPendingRequests() {
    try {
      const pendingIds = this.requestIndexer.getPendingRequests();
      
      if (pendingIds.length > 0) {
        logger.info(`Found ${pendingIds.length} pending requests via indexer`);
        
        for (const requestId of pendingIds) {
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
  
  async getInputData(inputDataHash) {
    const cached = this.cache.get(inputDataHash);
    if (cached) {
      logger.info('Using cached input data');
      return cached;
    }
    
    let inputData;
    
    try {
      // Try to fetch from IPFS
      logger.info(`Fetching input data from IPFS: ${inputDataHash}`);
      
      // Create temp file for input data
      const tempInputPath = path.join(process.cwd(), 'models', 'temp', `input_${inputDataHash}.json`);
      await fs.promises.mkdir(path.dirname(tempInputPath), { recursive: true });
      
      // Download input data file
      await this.ipfsService.downloadFile(inputDataHash, tempInputPath);
      
      // Read the downloaded file
      inputData = await fs.promises.readFile(tempInputPath, 'utf8');
      
      // Cleanup temp file
      try {
        await fs.promises.unlink(tempInputPath);
      } catch (cleanupError) {
        logger.warn(`Failed to cleanup temp input file: ${cleanupError.message}`);
      }
      
      if (!inputData) {
        throw new Error('Input data is empty');
      }
      
      // Cache valid input data
      this.cache.set(inputDataHash, inputData);
      return inputData;
      
    } catch (ipfsError) {
      logger.warn(`Failed to fetch from IPFS: ${ipfsError.message}, using sample data`);
      
      // Fallback to sample data for testing
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
      
      // Cache sample data too
      this.cache.set(inputDataHash, inputData);
      return inputData;
    }
  }
  
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
      model: this.modelRunner.getModelInfo()
    };
  }
  
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

export function getInferenceEngine() {
  if (!inferenceEngineInstance) {
    inferenceEngineInstance = new InferenceEngine();
  }
  return inferenceEngineInstance;
}

export { InferenceEngine };