import { config, validateConfig } from './config/config.js';
import { getInferenceEngine } from './services/inferenceEngine.js';
import { APIServer } from './api/server.js';
import logger from './utils/logger.js';

/**
 * Main entry point for the Compute Node
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     Decentralized AI Marketplace - Compute Node          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  try {
    // Validate configuration
    logger.info('Validating configuration...');
    validateConfig();
    
    // Initialize Inference Engine
    logger.info('Initializing Inference Engine...');
    const engine = getInferenceEngine();
    await engine.initialize();
    
    // Initialize and start API server
    logger.info('Starting API Server...');
    const apiServer = new APIServer();
    await apiServer.initialize();
    await apiServer.start();
    
    // Start processing requests
    logger.info('Starting request processing...');
    await engine.start();
    
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ✅ Compute Node is LIVE and READY!                   ║
║                                                           ║
║     Network: ${config.networkName.padEnd(43)} ║
║     Node Address: ${(config.nodeAddress || '').substring(0, 20) || 'Not set'}...              ║
║     API Server: http://${config.host}:${config.port.toString().padEnd(28)} ║
║                                                           ║
║     Monitoring blockchain for inference requests...      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
    
    logger.info('🚀 Compute Node running successfully!');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\n\n📛 Received SIGINT, shutting down gracefully...');
      await engine.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('\n\n📛 Received SIGTERM, shutting down gracefully...');
      await engine.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('❌ Fatal error during startup:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main();