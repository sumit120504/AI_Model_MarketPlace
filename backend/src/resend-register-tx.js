import { ethers } from 'ethers';
import { config } from './config/config.js';
import { getBlockchainService } from './services/blockchainService.js';
import ipfsService from './services/ipfsService.js';
import logger from './utils/logger.js';
import path from 'path';

async function resendRegisterTx(stuckTxHash, priorityGwei = '500', maxFeeGwei = '1000') {
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  // Lookup stuck tx to get nonce
  const stuckTx = await provider.getTransaction(stuckTxHash);
  if (!stuckTx) {
    console.error('Stuck tx not found on RPC. Aborting.');
    process.exit(1);
  }
  const nonce = stuckTx.nonce;
  console.log('Replacing stuck tx with nonce:', nonce);

  // Initialize services
  const blockchain = getBlockchainService();
  await blockchain.initialize();
  await ipfsService.initialize();

  // Upload model to IPFS (or reuse last hash)
  const modelPath = path.join(process.cwd(), 'models', 'downloaded', 'spam_detector.pkl');
  logger.info('Uploading model to IPFS:', modelPath);
  const ipfsHash = await ipfsService.uploadFile(modelPath);
  logger.info('Model uploaded to IPFS with hash:', ipfsHash);

  const modelDetails = {
    name: "Smart Spam Classifier v1",
    description: "Advanced ML model for detecting spam with high accuracy. Uses natural language processing and machine learning to identify spam patterns.",
    category: 0, // TEXT_CLASSIFICATION
    pricePerInference: ethers.utils.parseEther("0.001"), // 0.001 MATIC per inference
    stake: ethers.utils.parseEther("0.01") // 0.01 MATIC stake
  };

  // Populate registration tx
  const unsignedTx = await blockchain.modelRegistry.populateTransaction.registerModel(
    ipfsHash,
    modelDetails.name,
    modelDetails.description,
    modelDetails.category,
    modelDetails.pricePerInference,
    { value: modelDetails.stake }
  );

  // Set high gas fees and use the stuck nonce
  const maxPriorityFeePerGas = ethers.utils.parseUnits(priorityGwei, 'gwei');
  const maxFeePerGas = ethers.utils.parseUnits(maxFeeGwei, 'gwei');
  const tx = {
    ...unsignedTx,
    nonce,
    type: 2,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit: 500000,
    value: modelDetails.stake
  };

  // Send replacement registration tx
  const sent = await wallet.sendTransaction(tx);
  logger.logTransaction(sent.hash, 'Replacement registerModel');
  console.log('Replacement registration tx sent:', sent.hash);
  console.log('Waiting for 1 confirmation...');
  const receipt = await sent.wait(1);
  console.log('Replacement registration tx mined:', receipt.transactionHash);
}

const [,, stuckTxHash, priority, maxFee] = process.argv;
if (!stuckTxHash) {
  console.error('Usage: node src/resend-register-tx.js <stuckTxHash> [priorityGwei] [maxFeeGwei]');
  process.exit(1);
}
resendRegisterTx(stuckTxHash, priority || '500', maxFee || '1000').catch(err => {
  console.error('Error resending registration tx:', err);
  process.exit(1);
});
