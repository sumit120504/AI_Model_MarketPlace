const { InferenceEngine } = require('../services/inferenceEngine');

// Mock dependencies
jest.mock('../services/blockchainService');
jest.mock('../models/spamDetector');

describe('InferenceEngine', () => {
  let inferenceEngine;
  let mockBlockchain;
  let mockSpamDetector;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock objects
    mockBlockchain = {
      initialize: jest.fn(),
      listenForRequests: jest.fn(),
      getPendingRequests: jest.fn(),
      getRequest: jest.fn(),
      getModel: jest.fn(),
      pickupRequest: jest.fn(),
      submitResult: jest.fn(),
      reportFailure: jest.fn()
    };
    
    mockSpamDetector = {
      initialize: jest.fn(),
      detectSpam: jest.fn(),
      getModelInfo: jest.fn()
    };

    // Mock the getter functions
    const { getBlockchainService } = require('../services/blockchainService');
    const { getSpamDetector } = require('../models/spamDetector');
    
    getBlockchainService.mockReturnValue(mockBlockchain);
    getSpamDetector.mockReturnValue(mockSpamDetector);

    inferenceEngine = new InferenceEngine();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      mockBlockchain.initialize.mockResolvedValue(true);
      mockSpamDetector.initialize.mockResolvedValue(true);

      const result = await inferenceEngine.initialize();

      expect(result).toBe(true);
      expect(mockBlockchain.initialize).toHaveBeenCalled();
      expect(mockSpamDetector.initialize).toHaveBeenCalled();
    });

    it('should handle initialization failure', async () => {
      mockBlockchain.initialize.mockRejectedValue(new Error('Blockchain error'));

      await expect(inferenceEngine.initialize()).rejects.toThrow('Blockchain error');
    });
  });

  describe('handleNewRequest', () => {
    beforeEach(async () => {
      // Initialize engine
      mockBlockchain.initialize.mockResolvedValue(true);
      mockSpamDetector.initialize.mockResolvedValue(true);
      await inferenceEngine.initialize();
    });

    it('should process request successfully', async () => {
      const request = {
        requestId: '1',
        modelId: '1',
        user: '0x123',
        inputDataHash: '0xabc',
        payment: '0.001'
      };

      const requestDetails = {
        requestId: '1',
        modelId: '1',
        user: '0x123',
        inputDataHash: '0xabc',
        payment: '0.001'
      };

      const model = {
        modelId: '1',
        name: 'Test Model',
        description: 'Test Description'
      };

      const result = {
        result: 'NOT_SPAM',
        confidence: 0.95
      };

      mockBlockchain.getRequest.mockResolvedValue(requestDetails);
      mockBlockchain.getModel.mockResolvedValue(model);
      mockBlockchain.pickupRequest.mockResolvedValue({ success: true });
      mockSpamDetector.detectSpam.mockResolvedValue(result);
      mockBlockchain.submitResult.mockResolvedValue({ success: true });

      await inferenceEngine.handleNewRequest(request);

      expect(mockBlockchain.pickupRequest).toHaveBeenCalledWith('1');
      expect(mockBlockchain.getRequest).toHaveBeenCalledWith('1');
      expect(mockBlockchain.getModel).toHaveBeenCalledWith('1');
      expect(mockSpamDetector.detectSpam).toHaveBeenCalled();
      expect(mockBlockchain.submitResult).toHaveBeenCalledWith('1', 'NOT_SPAM');
    });

    it('should handle processing failure', async () => {
      const request = {
        requestId: '1',
        modelId: '1',
        user: '0x123',
        inputDataHash: '0xabc',
        payment: '0.001'
      };

      mockBlockchain.pickupRequest.mockRejectedValue(new Error('Pickup failed'));
      mockBlockchain.reportFailure.mockResolvedValue({ success: true });

      await inferenceEngine.handleNewRequest(request);

      expect(mockBlockchain.reportFailure).toHaveBeenCalledWith('1', 'Pickup failed');
      expect(inferenceEngine.stats.failed).toBe(1);
    });

    it('should not process duplicate requests', async () => {
      const request = {
        requestId: '1',
        modelId: '1',
        user: '0x123',
        inputDataHash: '0xabc',
        payment: '0.001'
      };

      // First call
      mockBlockchain.pickupRequest.mockResolvedValue({ success: true });
      await inferenceEngine.handleNewRequest(request);

      // Second call with same requestId
      await inferenceEngine.handleNewRequest(request);

      // Should only be called once
      expect(mockBlockchain.pickupRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('should return engine status', () => {
      const status = inferenceEngine.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('stats');
      expect(status).toHaveProperty('currentlyProcessing');
      expect(status).toHaveProperty('model');
    });
  });
});
