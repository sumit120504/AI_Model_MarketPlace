import { getBlockchainService } from './services/blockchainService.js';
import { getInferenceEngine } from './services/inferenceEngine.js';
import ipfsService from './services/ipfsService.js';
import logger from './utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

async function testInference() {
    try {
        // Initialize services
        const blockchain = getBlockchainService();
        await blockchain.initialize();

        const inferenceEngine = getInferenceEngine();
        await inferenceEngine.initialize();

        // Start the inference engine
        await inferenceEngine.start();

        // Get active models
        logger.info('Fetching active models...');
        const models = await blockchain.getActiveModels();
        if (!models || models.length === 0) {
            throw new Error('No active models found in the marketplace');
        }

        // Use the spam detector model
        const model = models.find(m => m.name.toLowerCase().includes('spam'));
        if (!model) {
            throw new Error('Spam detector model not found in marketplace');
        }
        logger.info(`Using model: ${model.name} (ID: ${model.modelId})`);

        // Create test inference requests
        const testCases = [
            {
                text: "CONGRATULATIONS! You've WON $1,000,000! Click here NOW to claim your prize!!!",
                expected: "spam"
            },
            {
                text: "Hi John, let's meet for coffee tomorrow at 3pm. Looking forward to catching up!",
                expected: "not_spam"
            }
        ];

        for (const testCase of testCases) {
            logger.info(`\nTesting with ${testCase.expected} example:`, testCase.text);

            // Upload input to IPFS (simulating website behavior)
            const tempInputPath = path.join(process.cwd(), 'models', 'temp_input.json');
            await fs.writeFile(tempInputPath, JSON.stringify({ text: testCase.text }));
            const inputHash = await ipfsService.uploadFile(tempInputPath);
            await fs.unlink(tempInputPath); // Clean up

            // Create inference request
            const requestId = Date.now().toString();
            const request = {
                requestId,
                modelId: model.modelId,
                user: blockchain.wallet.address,
                inputDataHash: inputHash,
                payment: model.pricePerInference
            };        logger.info('Running inference on spam test input...');
        const result = await modelRunner.runInference(spamEmail);

        if (result && result.success) {
            logger.info('Spam test result:', {
                isSpam: result.result,
                confidence: result.confidence
            });
        } else {
            throw new Error('Inference failed: ' + (result?.error || 'Unknown error'));
        }

        // Test with a non-spam email
        const normalEmail = "Hi John, let's meet for coffee tomorrow at 3pm. Looking forward to catching up!";
        logger.info('\nTesting with normal email:', normalEmail);
        const result2 = await modelRunner.runInference(normalEmail);

        if (result2 && result2.success) {
            logger.info('Normal email test result:', {
                isSpam: result2.result,
                confidence: result2.confidence
            });
        } else {
            throw new Error('Inference failed: ' + (result2?.error || 'Unknown error'));
        }

        logger.info('✅ All tests completed successfully');

    } catch (error) {
        logger.error('Test failed:', error);
        throw error;
    }
}

// Run the test with proper cleanup
testInference().then(() => {
    logger.info('Test complete');
    setTimeout(() => process.exit(0), 1000); // Give logger time to flush
}).catch(error => {
    logger.error('Test failed:', error);
    setTimeout(() => process.exit(1), 1000);
});