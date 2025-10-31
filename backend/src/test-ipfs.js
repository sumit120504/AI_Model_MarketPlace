import ipfsService from './services/ipfsService.js';
import { config } from './config/config.js';
import logger from './utils/logger.js';

async function testIPFS() {
    try {
        await ipfsService.initialize();
        logger.info('IPFS Service initialized');
        
        // Try to download a registered model file from the marketplace
        const testCID = 'bafkreibry6ktfx23gmb5qgzdsd6cdqwl4stk3oe35qhdgkdnvnhiynjv7a';
        const outputPath = './models/downloaded/spam_detector.pkl';
        
        logger.info('Starting test download...');
        await ipfsService.downloadFile(testCID, outputPath);
        logger.info('Test download completed successfully');
        
    } catch (error) {
        logger.error('Test failed:', error);
    }
}

testIPFS().then(() => {
    logger.info('Test complete');
});