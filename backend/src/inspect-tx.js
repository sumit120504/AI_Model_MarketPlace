import { ethers } from 'ethers';
import { config } from './config/config.js';

async function inspect(txHash) {
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  console.log('Using RPC:', config.rpcUrl);
  console.log('Inspecting TX:', txHash);
  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);
  const latest = await provider.getBlock('latest');
  console.log('Latest block number:', latest.number);
  console.log('Latest baseFeePerGas:', latest.baseFeePerGas ? latest.baseFeePerGas.toString() : 'none');
  console.log('Transaction:', tx);
  console.log('Receipt:', receipt);
}

const hash = process.argv[2];
if (!hash) {
  console.error('Usage: node src/inspect-tx.js <txHash>');
  process.exit(1);
}
inspect(hash).catch(err => { console.error(err); process.exit(1); });