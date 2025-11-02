import { ethers } from 'ethers';
import logger from './logger.js';

// ✅ Polygon Amoy Network Gas Configuration
const MIN_TIP_CAP = ethers.utils.parseUnits('30', 'gwei');     // min priority fee
const MIN_GAS_PRICE = ethers.utils.parseUnits('35', 'gwei');   // baseline price
const MAX_GAS_PRICE = ethers.utils.parseUnits('300', 'gwei');  // cap upper bound
const BASE_PRIORITY_INCREASE = 1.2; // 20% increase per retry

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

    if (oldTx.type === 2) {
      const newPriority = oldTx.maxPriorityFeePerGas.mul(increase).div(100);
      const newMaxFee = oldTx.maxFeePerGas.mul(increase).div(100);

      const maxPriorityFeePerGas = newPriority.gt(MAX_GAS_PRICE)
        ? MAX_GAS_PRICE
        : newPriority;

      const maxFeePerGas = newMaxFee.gt(MAX_GAS_PRICE)
        ? MAX_GAS_PRICE
        : newMaxFee;

      logger.debug('Polygon EIP-1559 Replacement:', {
        oldPriority: ethers.utils.formatUnits(oldTx.maxPriorityFeePerGas, 'gwei'),
        newPriority: ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei'),
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

    // Legacy type
    const newGasPrice = oldTx.gasPrice.mul(increase).div(100);
    const gasPrice = newGasPrice.gt(MAX_GAS_PRICE)
      ? MAX_GAS_PRICE
      : newGasPrice;

    logger.debug('Polygon Legacy Replacement:', {
      oldGas: ethers.utils.formatUnits(oldTx.gasPrice, 'gwei'),
      newGas: ethers.utils.formatUnits(gasPrice, 'gwei'),
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
