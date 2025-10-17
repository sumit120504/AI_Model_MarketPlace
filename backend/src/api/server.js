const express = require('express');
const cors = require('cors');
const { config } = require('../config/config');
const { getInferenceEngine } = require('../services/inferenceEngine');
const { getBlockchainService } = require('../services/blockchainService');
const logger = require('../utils/logger');

class APIServer {
  constructor() {
    this.app = express();
    this.engine = null;
    this.blockchain = null;
  }
  
  /**
   * Initialize API server
   */
  async initialize() {
    this.engine = getInferenceEngine();
    this.blockchain = getBlockchainService();
    
    // Middleware
    this.app.use(cors());
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
    
    // Routes
    this.setupRoutes();
    
    // Error handling
    this.app.use(this.errorHandler);
  }
  
  /**
   * Setup API routes
   */
  setupRoutes() {
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

module.exports = { APIServer };