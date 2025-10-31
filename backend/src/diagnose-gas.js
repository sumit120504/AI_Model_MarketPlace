import { ethers } from 'ethers';
import { config } from './config/config.js';
import logger from './utils/logger.js';

async function diagnoseGasIssue() {
  try {
    // Connect to provider
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);
    
    // Create transaction with exact gas values and very high gas price for testing
    const tx = {
      to: config.modelRegistryAddress,
      value: ethers.utils.parseEther('0.1'),
      type: 2,
      chainId: config.chainId,
      nonce: await wallet.getTransactionCount(),
      gasLimit: config.gasLimit,
      maxFeePerGas: ethers.utils.parseUnits('200', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
      data: '0x'
    };
    
    // Log transaction parameters
    console.log('Transaction Parameters:');
    console.log('maxFeePerGas:', ethers.utils.formatUnits(tx.maxFeePerGas, 'gwei'), 'gwei');
    console.log('maxPriorityFeePerGas:', ethers.utils.formatUnits(tx.maxPriorityFeePerGas, 'gwei'), 'gwei');
    
    // Sign transaction
    const signedTx = await wallet.signTransaction(tx);
    console.log('Signed Transaction:', signedTx);
    
    // Send raw transaction
    const sentTx = await provider.send('eth_sendRawTransaction', [signedTx]);
    console.log('Transaction sent:', sentTx);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.error) {
      console.error('RPC Error:', error.error);
    }
  }
}

diagnoseGasIssue().catch(console.error);