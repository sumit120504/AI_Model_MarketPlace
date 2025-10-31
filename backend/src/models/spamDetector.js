import { PythonShell } from 'python-shell';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Spam Detector using ML model from IPFS
 */
class SpamDetector {
  constructor() {
    this.isReady = false;
    this.modelPath = null;
    this.pythonScript = path.join(__dirname, 'run_model.py');
    this.pythonPath = 'C:/Projects/AI_Model_MarketPlace/.venv/Scripts/python.exe';
    logger.info('Spam Detector initialized');
  }
  
  /**
   * Initialize the model by verifying Python environment and dependencies
   */
  async initialize() {
    try {
      // Verify Python script exists
      await fs.access(this.pythonScript);
      
      // Verify Python dependencies
      const options = {
        mode: 'text',
        pythonPath: this.pythonPath,
        pythonOptions: ['-u']
      };
      
      await new Promise((resolve, reject) => {
        PythonShell.runString(
          'import sys; import pickle; import sklearn; import numpy; print("OK")', 
          options, 
          (err, output) => {
            if (err) reject(new Error('Python dependencies missing: ' + err.message));
            if (output && output[0] === 'OK') resolve();
            else reject(new Error('Python environment check failed'));
          }
        );
      });

      this.isReady = true;
      logger.info('✅ Spam Detector ready');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Spam Detector:', error);
      throw error;
    }
  }
  
  /**
   * Set the path to the downloaded model file
   */
  async setModelPath(modelPath) {
    // Validate model file exists
    try {
      await fs.access(modelPath);
      
      // Test load the model to validate it
      const options = {
        mode: 'text',
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'],
        scriptPath: path.dirname(this.pythonScript),
        args: [modelPath, '--metadata-only']
      };

      const result = await new Promise((resolve, reject) => {
        PythonShell.run('run_model.py', options, (err, output) => {
          if (err) reject(new Error(`Invalid model file: ${err.message}`));
          try {
            const metadata = JSON.parse(output[output.length - 1]);
            if (!metadata.success) {
              reject(new Error(metadata.error || 'Invalid model format'));
            }
            resolve(metadata);
          } catch (e) {
            reject(new Error(`Failed to validate model: ${e.message}`));
          }
        });
      });
      
      this.modelPath = modelPath;
      logger.info(`Model path set and validated: ${modelPath}`);
      return result;
      
    } catch (error) {
      logger.error(`Failed to set model path: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Detect if email is spam using the ML model
   * @param {string} emailText - Email content to analyze
   * @returns {Promise<Object>} - { isSpam: boolean, confidence: number, result: string, success: boolean, details: Object }
   * @throws {Error} If model fails to run or produce valid results
   */
  async detectSpam(emailText) {
    if (!this.isReady) {
      await this.initialize();
    }
    
    if (!this.modelPath) {
      throw new Error('Model path not set. Call setModelPath() with downloaded model path first.');
    }
    
    // Input validation
    if (!emailText || typeof emailText !== 'string' || !emailText.trim()) {
      throw new Error('Invalid input: email text must be a non-empty string');
    }
    
    try {
      logger.info('Running spam detection with ML model...');
      logger.debug(`Input text length: ${emailText.length} characters`);
      
      const options = {
        mode: 'text',
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'], // unbuffered output
        scriptPath: __dirname,
        args: [this.modelPath, emailText]
      };

      const results = await new Promise((resolve, reject) => {
        PythonShell.run('run_model.py', options, (err, output) => {
          if (err) {
            logger.error('Model execution error:', err);
            reject(err);
            return;
          }
          
          try {
            // Get last line of output (in case there are debug/info messages)
            const lastLine = output[output.length - 1];
            const result = JSON.parse(lastLine);
            
            // Log any debug messages from model
            if (output.length > 1) {
              output.slice(0, -1).forEach(line => logger.debug('Model output:', line));
            }
            
            resolve(result);
          } catch (parseError) {
            logger.error('Failed to parse model output:', output);
            reject(new Error('Failed to parse model output: ' + parseError.message));
          }
        });
      });

      if (!results.success) {
        const errorMessage = results.error || 'Model execution failed';
        logger.error('Model execution failed:', errorMessage);
        throw new Error(errorMessage);
      }

      // Log detailed results
      logger.info(`Detection complete: ${results.result} (confidence: ${results.confidence})`);
      if (results.details) {
        logger.debug('Detection details:', {
          spamConfidence: results.details.spam_confidence,
          notSpamConfidence: results.details.not_spam_confidence,
          inputLength: results.details.input_length,
          modelMetadata: results.details.model_metadata
        });
      }

      return results;
      
    } catch (error) {
      logger.error('Spam detection failed:', error);
      throw error;
    }
  }
  
  /**
   * Batch inference for multiple emails
   * @param {Array<string>} emails - Array of email texts
   * @returns {Promise<Array<Object>>} - Array of results
   */
  async batchDetect(emails) {
    const results = [];
    let failedCount = 0;
    
    for (const email of emails) {
      try {
        const result = await this.detectSpam(email);
        results.push(result);
      } catch (error) {
        failedCount++;
        results.push({
          success: false,
          error: error.message,
          result: 'ERROR',
          confidence: 0
        });
      }
    }
    
    logger.info(`Batch detection complete: ${results.length - failedCount} successful, ${failedCount} failed`);
    return results;
  }
  
  /**
   * Get model info including metadata from the loaded model
   */
  async getModelInfo() {
    try {
      // If model is loaded, get its metadata
      if (this.isReady && this.modelPath) {
        const options = {
          mode: 'text',
          pythonPath: this.pythonPath,
          pythonOptions: ['-u'],
          scriptPath: __dirname,
          args: [this.modelPath, '--metadata-only']
        };

        const metadata = await new Promise((resolve, reject) => {
          PythonShell.run('run_model.py', options, (err, output) => {
            if (err) {
              logger.warn('Failed to get model metadata:', err);
              resolve({});
              return;
            }
            try {
              const result = JSON.parse(output[output.length - 1]);
              resolve(result.details?.model_metadata || {});
            } catch (e) {
              logger.warn('Failed to parse model metadata:', e);
              resolve({});
            }
          });
        });

        return {
          name: metadata.model_name || 'Spam Detector ML',
          version: metadata.model_version || '2.0.0',
          type: 'TEXT_CLASSIFICATION',
          isReady: this.isReady,
          modelPath: this.modelPath,
          backend: 'scikit-learn',
          metadata: {
            ...metadata,
            lastLoaded: new Date().toISOString(),
            pythonPath: this.pythonPath,
            scriptPath: this.pythonScript
          }
        };
      }

      // Return basic info if model not loaded
      return {
        name: 'Spam Detector ML',
        version: '2.0.0',
        type: 'TEXT_CLASSIFICATION',
        isReady: this.isReady,
        modelPath: this.modelPath,
        backend: 'scikit-learn'
      };
    } catch (error) {
      logger.error('Error getting model info:', error);
      return {
        name: 'Spam Detector ML',
        version: '2.0.0',
        type: 'TEXT_CLASSIFICATION',
        isReady: this.isReady,
        error: error.message
      };
    }
  }
}

// Singleton instance
let detectorInstance = null;

function getSpamDetector() {
  if (!detectorInstance) {
    detectorInstance = new SpamDetector();
  }
  return detectorInstance;
}

export { SpamDetector, getSpamDetector };