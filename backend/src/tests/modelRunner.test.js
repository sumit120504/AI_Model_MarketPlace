import { jest } from '@jest/globals';
import { ModelRunner } from '../models/modelRunner.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ModelRunner', () => {
  let modelRunner;
  const mockModelPath = path.join(__dirname, 'fixtures', 'test_model.pkl');
  
  beforeAll(async () => {
    // Ensure test fixtures directory exists
    const fixturesDir = path.join(__dirname, 'fixtures');
    await fs.mkdir(fixturesDir, { recursive: true });
  });

  beforeEach(async () => {
    modelRunner = new ModelRunner();
    // Mock Python setup verification
    modelRunner.verifyPythonSetup = jest.fn().mockResolvedValue(true);
    await modelRunner.initialize();
  });

  describe('runInference', () => {
    it('should validate model path before running', async () => {
      await expect(modelRunner.runInference('test input'))
        .rejects
        .toThrow('Model path not set');
    });

    it('should return output in expected schema for text classification', async () => {
      // Set mock model path and info
      await modelRunner.setModelPath(mockModelPath, {
        type: 'text_classification',
        config: {
          labels: ['SPAM', 'NOT_SPAM']
        }
      });

      // Mock Python shell execution
      const mockPythonOutput = JSON.stringify({
        success: true,
        output: {
          label: 'SPAM',
          confidence: 0.92,
          probabilities: {
            'SPAM': 0.92,
            'NOT_SPAM': 0.08
          }
        },
        metadata: {
          model_type: 'text_classification',
          input_shape: null
        }
      });

      // Mock PythonShell
      jest.spyOn(modelRunner, 'runInference').mockImplementation(async () => {
        return JSON.parse(mockPythonOutput);
      });

      const result = await modelRunner.runInference('Test spam email input');

      expect(result).toEqual(expect.objectContaining({
        success: expect.any(Boolean),
        result: expect.any(String),
        confidence: expect.any(Number)
      }));

      // Validate value ranges
      expect(result.success).toBe(true);
      expect(['SPAM', 'NOT_SPAM']).toContain(result.result);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle failed inference gracefully', async () => {
      await modelRunner.setModelPath(mockModelPath, {
        type: 'text_classification'
      });

      // Mock failed Python execution
      const mockError = {
        success: false,
        error: 'Model execution failed',
        traceback: 'Error stack trace'
      };

      jest.spyOn(modelRunner, 'runInference').mockRejectedValue(new Error(mockError.error));

      await expect(modelRunner.runInference('test input'))
        .rejects
        .toThrow('Model execution failed');
    });

    it('should normalize output to standard schema', async () => {
      await modelRunner.setModelPath(mockModelPath, {
        type: 'text_classification'
      });

      // Test various output formats that might come from different model types
      const testCases = [
        {
          pythonOutput: {
            success: true,
            output: { prediction: 1, probabilities: [0.1, 0.9] }
          },
          expected: {
            success: true,
            result: 'NOT_SPAM',
            confidence: 0.9
          }
        },
        {
          pythonOutput: {
            success: true,
            output: { label: 'SPAM', confidence: 0.95 }
          },
          expected: {
            success: true,
            result: 'SPAM',
            confidence: 0.95
          }
        },
        {
          pythonOutput: {
            success: true,
            output: 'SPAM'  // Direct string output
          },
          expected: {
            success: true,
            result: 'SPAM',
            confidence: 1.0  // Default confidence when not provided
          }
        }
      ];

      for (const testCase of testCases) {
        jest.spyOn(modelRunner, 'runInference')
          .mockResolvedValueOnce(testCase.pythonOutput);

        const result = await modelRunner.runInference('test input');
        expect(result).toMatchObject(testCase.expected);
      }
    });
  });

  describe('Batch Processing', () => {
    it('should handle batch inference requests', async () => {
      await modelRunner.setModelPath(mockModelPath, {
        type: 'text_classification'
      });

      const mockResults = [
        { success: true, result: 'SPAM', confidence: 0.9 },
        { success: true, result: 'NOT_SPAM', confidence: 0.85 }
      ];

      jest.spyOn(modelRunner, 'runInference')
        .mockImplementation(async () => mockResults[0])
        .mockImplementationOnce(async () => mockResults[0])
        .mockImplementationOnce(async () => mockResults[1]);

      const inputs = [
        'First test input',
        'Second test input'
      ];

      const results = await modelRunner.batchInference(inputs);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject(mockResults[0]);
      expect(results[1]).toMatchObject(mockResults[1]);
    });

    it('should continue processing batch even if some inferences fail', async () => {
      await modelRunner.setModelPath(mockModelPath, {
        type: 'text_classification'
      });

      jest.spyOn(modelRunner, 'runInference')
        .mockImplementationOnce(async () => ({ success: true, result: 'SPAM', confidence: 0.9 }))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockImplementationOnce(async () => ({ success: true, result: 'NOT_SPAM', confidence: 0.8 }));

      const inputs = ['Input 1', 'Bad Input', 'Input 3'];
      const results = await modelRunner.batchInference(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });
});