import { ethers } from 'ethers';
import { config } from './config/config.js';

async function replaceTx(txHash, priorityGwei = '200', maxFeeGwei = '400') {
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  console.log('Using RPC:', config.rpcUrl);
  console.log('Looking up tx:', txHash);
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    console.error('Transaction not found on RPC. Provide nonce instead or check RPC URL.');
    process.exit(1);
  }

  console.log('Found tx. nonce=', tx.nonce, 'from=', tx.from);

  // Build replacement transaction: send 0 value to self with same nonce and higher fees
  const maxPriorityFeePerGas = ethers.utils.parseUnits(String(priorityGwei), 'gwei');
  const maxFeePerGas = ethers.utils.parseUnits(String(maxFeeGwei), 'gwei');

  const replaceTx = {
    to: wallet.address,
    value: ethers.BigNumber.from(0),
    nonce: tx.nonce,
    gasLimit: tx.gasLimit || ethers.BigNumber.from(500000),
    type: 2,
    maxPriorityFeePerGas,
    maxFeePerGas
  };

  console.log('Sending replacement tx with priority (gwei):', priorityGwei, 'maxFee (gwei):', maxFeeGwei);
  const sent = await wallet.sendTransaction(replaceTx);
  console.log('Replacement tx sent:', sent.hash);
  console.log('Waiting for 1 confirmation...');
  const receipt = await sent.wait(1);
  console.log('Replacement tx mined:', receipt.transactionHash);
}

const [,, txHash, priority, maxFee] = process.argv;
if (!txHash) {
  console.error('Usage: node src/replace-tx.js <txHash> [priorityGwei] [maxFeeGwei]');
  process.exit(1);
}

replaceTx(txHash, priority || '200', maxFee || '400').catch(err => {
  console.error('Error replacing tx:', err);
  process.exit(1);
});
