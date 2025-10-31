const { BlockchainService } = require('../services/blockchainService');
const { ethers } = require('ethers');

// Mock ethers
jest.mock('ethers');

describe('BlockchainService', () => {
  let blockchainService;
  let mockProvider;
  let mockWallet;
  let mockContract;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock objects
    mockProvider = {
      getNetwork: jest.fn(),
      getFeeData: jest.fn(),
      getBalance: jest.fn(),
      getGasPrice: jest.fn()
    };
    
    mockWallet = {
      getAddress: jest.fn(),
      getBalance: jest.fn()
    };
    
    mockContract = {
      authorizedComputeNodes: jest.fn(),
      getPendingRequests: jest.fn(),
      getRequest: jest.fn(),
      pickupRequest: jest.fn(),
      submitResult: jest.fn(),
      reportFailure: jest.fn()
    };

    // Mock ethers constructors
    ethers.providers.JsonRpcProvider.mockReturnValue(mockProvider);
    ethers.Wallet.mockReturnValue(mockWallet);
    ethers.Contract.mockReturnValue(mockContract);
    ethers.utils = {
      parseUnits: jest.fn(),
      formatEther: jest.fn(),
      formatUnits: jest.fn(),
      keccak256: jest.fn(),
      toUtf8Bytes: jest.fn()
    };

    blockchainService = new BlockchainService();
  });

  describe('initialize', () => {
    it('should initialize blockchain connection successfully', async () => {
      // Mock successful initialization
      mockProvider.getNetwork.mockResolvedValue({ name: 'mumbai', chainId: 80001 });
      mockWallet.getBalance.mockResolvedValue(ethers.BigNumber.from('1000000000000000000')); // 1 ETH
      mockContract.authorizedComputeNodes.mockResolvedValue(true);

      const result = await blockchainService.initialize();

      expect(result).toBe(true);
      expect(blockchainService.isConnected).toBe(true);
    });

    it('should handle initialization failure', async () => {
      // Mock initialization failure
      mockProvider.getNetwork.mockRejectedValue(new Error('Network error'));

      await expect(blockchainService.initialize()).rejects.toThrow('Network error');
      expect(blockchainService.isConnected).toBe(false);
    });
  });

  describe('getGasSettings', () => {
    beforeEach(async () => {
      // Initialize service
      mockProvider.getNetwork.mockResolvedValue({ name: 'mumbai', chainId: 80001 });
      mockWallet.getBalance.mockResolvedValue(ethers.BigNumber.from('1000000000000000000'));
      mockContract.authorizedComputeNodes.mockResolvedValue(true);
      await blockchainService.initialize();
    });

    it('should return gas settings with minimum values', async () => {
      const mockFeeData = {
        maxFeePerGas: ethers.BigNumber.from('20000000000'), // 20 gwei
        maxPriorityFeePerGas: ethers.BigNumber.from('2000000000') // 2 gwei
      };
      
      mockProvider.getFeeData.mockResolvedValue(mockFeeData);
      ethers.utils.parseUnits.mockReturnValue(ethers.BigNumber.from('25000000000')); // 25 gwei

      const result = await blockchainService.getGasSettings();

      expect(result).toHaveProperty('maxFeePerGas');
      expect(result).toHaveProperty('maxPriorityFeePerGas');
      expect(result).toHaveProperty('gasLimit');
    });
  });

  describe('getPendingRequests', () => {
    beforeEach(async () => {
      // Initialize service
      mockProvider.getNetwork.mockResolvedValue({ name: 'mumbai', chainId: 80001 });
      mockWallet.getBalance.mockResolvedValue(ethers.BigNumber.from('1000000000000000000'));
      mockContract.authorizedComputeNodes.mockResolvedValue(true);
      await blockchainService.initialize();
    });

    it('should return pending requests', async () => {
      const mockRequests = [1, 2, 3];
      mockContract.getPendingRequests.mockResolvedValue(mockRequests);

      const result = await blockchainService.getPendingRequests();

      expect(result).toEqual(['1', '2', '3']);
      expect(mockContract.getPendingRequests).toHaveBeenCalled();
    });

    it('should return empty array on error', async () => {
      mockContract.getPendingRequests.mockRejectedValue(new Error('Contract error'));

      const result = await blockchainService.getPendingRequests();

      expect(result).toEqual([]);
    });
  });
});
