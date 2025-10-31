import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config/config.js';
import { getInferenceEngine } from '../services/inferenceEngine.js';
import { getBlockchainService } from '../services/blockchainService.js';
import ipfsService from '../services/ipfsService.js';
import logger from '../utils/logger.js';

class APIServer {
  constructor() {
    this.app = express();
    this.engine = null;
    this.blockchain = null;
    this.ipfsService = null;
  }
  
  /**
   * Initialize API server
   */
  async initialize() {
    this.engine = getInferenceEngine();
    this.blockchain = getBlockchainService();
    this.ipfsService = ipfsService;
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
    
  // File upload middleware (for model uploads)
  this.upload = multer({ dest: path.join(process.cwd(), 'uploads/') });

  // Routes
  this.setupRoutes();
    
    // Error handling
    this.app.use(this.errorHandler);
  }
  
  /**
   * Setup API routes
   */
  setupRoutes() {
    // Model file upload endpoint
    this.app.post('/api/upload-model', this.upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }
        // Ensure IPFS service is initialized
        if (!this.ipfsService.isInitialized) {
          await this.ipfsService.initialize();
        }
        const filePath = req.file.path;
        const ipfsHash = await this.ipfsService.uploadFile(filePath);
        // Remove temp file
        fs.unlink(filePath, () => {});
        res.json({ ipfsHash });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
    
    // Engine status
    this.app.get('/status', async (req, res) => {
      try {
        const status = this.engine.getStatus();
        const balance = await this.blockchain.getBalance();
        const gasPrice = await this.blockchain.getGasPrice();
        
        res.json({
          ...status,
          blockchain: {
            network: config.networkName,
            wallet: config.nodeAddress,
            balance: `${balance} MATIC`,
            gasPrice: `${gasPrice} gwei`
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get pending requests
    this.app.get('/requests/pending', async (req, res) => {
      try {
        const pendingIds = await this.blockchain.getPendingRequests();
        res.json({
          count: pendingIds.length,
          requests: pendingIds
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get specific request details
    this.app.get('/requests/:requestId', async (req, res) => {
      try {
        const { requestId } = req.params;
        const request = await this.blockchain.getRequest(requestId);
        res.json(request);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get model details
    this.app.get('/models/:modelId', async (req, res) => {
      try {
        const { modelId } = req.params;
        const model = await this.blockchain.getModel(modelId);
        res.json(model);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Test spam detection (without blockchain)
    this.app.post('/test/detect', async (req, res) => {
      try {
        const { text } = req.body;
        
        if (!text) {
          return res.status(400).json({ error: 'Text required' });
        }
        
        // Input validation
        if (typeof text !== 'string') {
          return res.status(400).json({ error: 'Text must be a string' });
        }
        
        if (text.length === 0) {
          return res.status(400).json({ error: 'Text cannot be empty' });
        }
        
        if (text.length > 10000) {
          return res.status(400).json({ error: 'Text too long (max 10,000 characters)' });
        }
        
        const spamDetector = this.engine.spamDetector;
        const result = await spamDetector.detectSpam(text);
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get stats
    this.app.get('/stats', (req, res) => {
      const status = this.engine.getStatus();
      res.json(status.stats);
    });
    
    // IPFS endpoints
    this.app.post('/ipfs/upload', async (req, res) => {
      try {
        const { content, filename } = req.body;
        
        if (!content) {
          return res.status(400).json({ error: 'Content required' });
        }
        
        const hash = await this.ipfsService.uploadFile(content, filename || 'file');
        res.json({ hash, gateway: config.ipfsGateway });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/ipfs/:hash', async (req, res) => {
      try {
        const { hash } = req.params;
        
        if (!this.ipfsService.isValidHash(hash)) {
          return res.status(400).json({ error: 'Invalid IPFS hash' });
        }
        
        const content = await this.ipfsService.getFileContent(hash);
        res.json({ content, hash });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/ipfs/:hash/info', async (req, res) => {
      try {
        const { hash } = req.params;
        
        if (!this.ipfsService.isValidHash(hash)) {
          return res.status(400).json({ error: 'Invalid IPFS hash' });
        }
        
        const info = await this.ipfsService.getFileInfo(hash);
        res.json(info);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/ipfs/status', (req, res) => {
      const status = this.ipfsService.getStatus();
      res.json(status);
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }
  
  /**
   * Error handler middleware
   */
  errorHandler(err, req, res, next) {
    logger.error('API Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
  
  /**
   * Start the server
   */
  async start() {
    return new Promise((resolve) => {
      this.app.listen(config.port, config.host, () => {
        logger.info(`✅ API Server running on http://${config.host}:${config.port}`);
        resolve();
      });
    });
  }
}

export { APIServer };