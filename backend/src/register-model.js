import { getBlockchainService } from './services/blockchainService.js';
import ipfsService from './services/ipfsService.js';
import logger from './utils/logger.js';
import { ethers } from 'ethers';
import path from 'path';

async function registerSpamModel() {
    try {
        // Initialize services
        const blockchain = getBlockchainService();
        await blockchain.initialize();
        await ipfsService.initialize();

        // Upload model to IPFS
        const modelPath = path.join(process.cwd(), 'models', 'downloaded', '2.pkl');
        logger.info('Uploading model to IPFS:', modelPath);
        const ipfsHash = await ipfsService.uploadFile(modelPath);
        logger.info('Model uploaded to IPFS with hash:', ipfsHash);

        // Get contract addresses from config
        if (!blockchain.modelRegistry) {
            throw new Error('ModelRegistry contract not initialized');
        }

        const modelDetails = {
            name: "Spam Detective",
            description: "Advanced ML model for detecting spam with high accuracy. Uses natural language processing and machine learning to identify spam patterns.",
            category: 0, // TEXT_CLASSIFICATION
            pricePerInference: ethers.utils.parseEther("0.001"), // 0.001 MATIC per inference
            stake: ethers.utils.parseEther("0.01") // 0.01 MATIC stake
        };

        logger.info('Registering model on blockchain with details:', modelDetails);
        
        // First get the populated transaction
        const unsignedTx = await blockchain.modelRegistry.populateTransaction.registerModel(
            ipfsHash,
            modelDetails.name,
            modelDetails.description,
            modelDetails.category,
            modelDetails.pricePerInference,
            { value: modelDetails.stake }
        );

        // Send transaction using executeWithRetry so it will try alternate RPCs and incremental gas
        const receipt = await blockchain.executeWithRetry(async (gasSettings) => {
            // gasSettings will be provided by executeWithRetry and already include gas fields
            const tx = await blockchain.wallet.sendTransaction({
                ...unsignedTx,
                ...gasSettings,
                value: modelDetails.stake
            });

            logger.logTransaction(tx.hash, 'Register model (via executeWithRetry)');

            // Wait for confirmation for this tx on the current provider
            const timeoutMs = 3 * 60 * 1000; // 3 minutes
            const receipt = await blockchain.provider.waitForTransaction(tx.hash, 1, timeoutMs);
            if (!receipt) {
                // Let executeWithRetry catch and try next RPC
                throw new Error(`Timed out waiting for tx ${tx.hash}`);
            }
            return receipt;
        });

        logger.info('Model registered successfully! Transaction:', receipt.txHash);
        logger.info('You can now use this model through the marketplace.');

    } catch (error) {
        logger.error('Failed to register model:', error);
        throw error;
    }
}

// Run registration
registerSpamModel().then(() => {
    logger.info('Registration process complete');
    setTimeout(() => process.exit(0), 1000);
}).catch(error => {
    logger.error('Registration failed:', error);
    setTimeout(() => process.exit(1), 1000);
});