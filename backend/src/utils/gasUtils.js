import { ethers } from 'ethers';
import logger from './logger.js';

// Network-specific settings
const MIN_TIP_CAP = ethers.utils.parseUnits('25', 'gwei'); // 25 Gwei base tip
const MIN_GAS_PRICE = ethers.utils.parseUnits('40', 'gwei'); // 40 Gwei minimum
const MAX_GAS_PRICE = ethers.utils.parseUnits('500', 'gwei'); // 500 Gwei maximum
const BASE_PRIORITY_INCREASE = 1.2; // 20% increase per attempt

/**
 * Get gas settings compatible with Polygon Amoy
 */
export async function getGasSettings(provider, attempt = 0) {
  try {
    const [block, feeData] = await Promise.all([
      provider.getBlock('latest'),
      provider.getFeeData()
    ]);

    const priorityMultiplier = Math.pow(BASE_PRIORITY_INCREASE, attempt);

    // Polygon supports EIP-1559
    if (block.baseFeePerGas) {
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || MIN_TIP_CAP;
      
      // Increase priority fee based on attempt number
      if (attempt > 0) {
        maxPriorityFeePerGas = maxPriorityFeePerGas
          .mul(Math.floor(priorityMultiplier * 100))
          .div(100);
      }

      // Cap it
      maxPriorityFeePerGas = maxPriorityFeePerGas.gt(MAX_GAS_PRICE)
        ? MAX_GAS_PRICE
        : maxPriorityFeePerGas;

      // BaseFee * 1.5 + priorityFee
      const maxFeePerGas = block.baseFeePerGas.mul(3).div(2).add(maxPriorityFeePerGas);

      logger.debug('Polygon (EIP-1559) Gas Settings:', {
        attempt,
        baseFee: ethers.utils.formatUnits(block.baseFeePerGas, 'gwei'),
        maxPriorityFee: ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei'),
        maxFee: ethers.utils.formatUnits(maxFeePerGas, 'gwei'),
      });

      return {
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      };
    }

    // Fallback for legacy
    let gasPrice = feeData.gasPrice || MIN_GAS_PRICE;
    
    // Increase gas price based on attempt number
    if (attempt > 0) {
      gasPrice = gasPrice.mul(Math.floor(priorityMultiplier * 100)).div(100);
    }

    gasPrice = gasPrice.gt(MAX_GAS_PRICE) ? MAX_GAS_PRICE : gasPrice;

    logger.debug('Polygon Legacy Gas Settings:', {
      attempt,
      gasPrice: ethers.utils.formatUnits(gasPrice, 'gwei'),
    });

    return { type: 0, gasPrice };

  } catch (error) {
    logger.error('Gas settings fetch failed:', error);

    const fallbackGas = MIN_GAS_PRICE.mul(attempt + 1);
    return {
      type: 0,
      gasPrice: fallbackGas.gt(MAX_GAS_PRICE) ? MAX_GAS_PRICE : fallbackGas,
    };
  }
}

/**
 * Get replacement transaction gas settings (resubmit logic)
 */
export async function getReplacementGasSettings(provider, oldTx) {
  try {
    const increase = ethers.BigNumber.from(120); // 20% bump
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
        newMaxFee: ethers.utils.formatUnits(maxFeePerGas, 'gwei'),
      });

      return {
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce: oldTx.nonce,
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

    return { type: 0, gasPrice, nonce: oldTx.nonce };

  } catch (err) {
    logger.error('Replacement gas setting error:', err);

    const doubled = oldTx.gasPrice.mul(2);
    return {
      type: oldTx.type || 0,
      gasPrice: doubled.gt(MAX_GAS_PRICE) ? MAX_GAS_PRICE : doubled,
      nonce: oldTx.nonce,
    };
  }
}

/**
 * Check if gas price is reasonable for Polygon
 */
export function isGasPriceReasonable(gasPrice) {
  return gasPrice.lte(MAX_GAS_PRICE) && gasPrice.gte(MIN_GAS_PRICE);
}
