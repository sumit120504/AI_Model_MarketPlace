import { ethers } from 'ethers';
import logger from './logger.js';

// Network-specific settings
const MIN_TIP_CAP = ethers.utils.parseUnits('25', 'gwei'); // 25 Gwei base tip
const MIN_GAS_PRICE = ethers.utils.parseUnits('40', 'gwei'); // 40 Gwei minimum
const MAX_GAS_PRICE = ethers.utils.parseUnits('500', 'gwei'); // 500 Gwei maximum
const BASE_PRIORITY_INCREASE = 1.2; // 20% increase per attempt

/**
 * Get network-appropriate gas settings for a transaction
 * @param {ethers.providers.Provider} provider - Ethers provider instance
 * @param {number} attempt - Retry attempt number (0-based)
 * @returns {Promise<object>} Gas settings for the transaction
 */
export async function getGasSettings(provider, attempt = 0) {
  try {
    const [block, feeData] = await Promise.all([
      provider.getBlock('latest'),
      provider.getFeeData()
    ]);

    // Calculate priority fee increase based on attempt number
    const priorityMultiplier = Math.pow(BASE_PRIORITY_INCREASE, attempt);
    
    // For EIP-1559 transactions
    if (block.baseFeePerGas) {
      // Start with network's suggested priority fee or our minimum
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || MIN_TIP_CAP;
      
      // Increase priority fee based on attempt number
      if (attempt > 0) {
        maxPriorityFeePerGas = maxPriorityFeePerGas.mul(
          ethers.BigNumber.from(Math.floor(priorityMultiplier * 100))
        ).div(100);
      }
      
      // Cap the max priority fee
      maxPriorityFeePerGas = ethers.BigNumber.from(
        Math.min(maxPriorityFeePerGas.toNumber(), MAX_GAS_PRICE.toNumber())
      );
      
      // Set max fee to double base fee plus priority fee
      const maxFeePerGas = block.baseFeePerGas.mul(2).add(maxPriorityFeePerGas);
      
      logger.debug('EIP-1559 Gas Settings:', {
        attempt,
        baseFee: ethers.utils.formatUnits(block.baseFeePerGas, 'gwei'),
        maxPriorityFee: ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei'),
        maxFee: ethers.utils.formatUnits(maxFeePerGas, 'gwei')
      });
      
      return {
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas
      };
    }
    
    // For legacy transactions
    let gasPrice = feeData.gasPrice || MIN_GAS_PRICE;
    
    // Increase gas price based on attempt number
    if (attempt > 0) {
      gasPrice = gasPrice.mul(
        ethers.BigNumber.from(Math.floor(priorityMultiplier * 100))
      ).div(100);
    }
    
    // Cap the gas price
    gasPrice = ethers.BigNumber.from(
      Math.min(gasPrice.toNumber(), MAX_GAS_PRICE.toNumber())
    );
    
    logger.debug('Legacy Gas Settings:', {
      attempt,
      gasPrice: ethers.utils.formatUnits(gasPrice, 'gwei')
    });
    
    return { type: 0, gasPrice };
    
  } catch (error) {
    logger.error('Failed to get gas settings:', error);
    
    // Fallback to safe legacy settings
    const gasPrice = MIN_GAS_PRICE.mul(attempt + 1);
    return {
      type: 0,
      gasPrice: ethers.BigNumber.from(
        Math.min(gasPrice.toNumber(), MAX_GAS_PRICE.toNumber())
      )
    };
  }
}

/**
 * Calculate gas settings for a replacement transaction
 * @param {ethers.providers.Provider} provider - Ethers provider instance
 * @param {object} oldTx - Original transaction to replace
 * @returns {Promise<object>} Gas settings for replacement tx
 */
export async function getReplacementGasSettings(provider, oldTx) {
  try {
    const block = await provider.getBlock('latest');
    
    // Increase prices by at least 30% for replacement
    const minIncrease = ethers.BigNumber.from('130').div('100');
    
    if (oldTx.type === 2) {
      // EIP-1559 transaction
      const newPriorityFee = oldTx.maxPriorityFeePerGas.mul(minIncrease);
      const newMaxFee = oldTx.maxFeePerGas.mul(minIncrease);
      
      // Cap the fees
      const maxPriorityFeePerGas = ethers.BigNumber.from(
        Math.min(newPriorityFee.toNumber(), MAX_GAS_PRICE.toNumber())
      );
      
      const maxFeePerGas = ethers.BigNumber.from(
        Math.min(newMaxFee.toNumber(), MAX_GAS_PRICE.toNumber())
      );
      
      logger.debug('EIP-1559 Replacement Settings:', {
        oldPriorityFee: ethers.utils.formatUnits(oldTx.maxPriorityFeePerGas, 'gwei'),
        newPriorityFee: ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei'),
        oldMaxFee: ethers.utils.formatUnits(oldTx.maxFeePerGas, 'gwei'),
        newMaxFee: ethers.utils.formatUnits(maxFeePerGas, 'gwei')
      });
      
      return {
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce: oldTx.nonce
      };
    }
    
    // Legacy transaction
    const newGasPrice = oldTx.gasPrice.mul(minIncrease);
    const gasPrice = ethers.BigNumber.from(
      Math.min(newGasPrice.toNumber(), MAX_GAS_PRICE.toNumber())
    );
    
    logger.debug('Legacy Replacement Settings:', {
      oldGasPrice: ethers.utils.formatUnits(oldTx.gasPrice, 'gwei'),
      newGasPrice: ethers.utils.formatUnits(gasPrice, 'gwei')
    });
    
    return {
      type: 0,
      gasPrice,
      nonce: oldTx.nonce
    };
    
  } catch (error) {
    logger.error('Failed to get replacement gas settings:', error);
    
    // Fallback: double the old gas price with cap
    const gasPrice = oldTx.gasPrice.mul(2);
    return {
      type: oldTx.type || 0,
      gasPrice: ethers.BigNumber.from(
        Math.min(gasPrice.toNumber(), MAX_GAS_PRICE.toNumber())
      ),
      nonce: oldTx.nonce
    };
  }
}

/**
 * Check if gas price is reasonable
 * @param {ethers.BigNumber} gasPrice - Gas price to check
 * @returns {boolean} True if gas price is reasonable
 */
export function isGasPriceReasonable(gasPrice) {
  return gasPrice.lte(MAX_GAS_PRICE);
}