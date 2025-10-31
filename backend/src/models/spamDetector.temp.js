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
  setModelPath(modelPath) {
    this.modelPath = modelPath;
    logger.info(`Model path set to: ${modelPath}`);
  }
  
  /**
   * Detect if email is spam using the ML model
   * @param {string} emailText - Email content to analyze
   * @returns {Promise<Object>} - { isSpam: boolean, confidence: number, result: string, success: boolean }
   * @throws {Error} If model fails to run or produce valid results
   */
  async detectSpam(emailText) {
    if (!this.isReady) {
      await this.initialize();
    }
    
    if (!this.modelPath) {
      throw new Error('Model path not set. Call setModelPath() with downloaded model path first.');
    }
    
    try {
      logger.info('Running spam detection with ML model...');
      
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
            const result = JSON.parse(output[output.length - 1]);
            resolve(result);
          } catch (parseError) {
            logger.error('Failed to parse model output:', output);
            reject(new Error('Failed to parse model output: ' + parseError.message));
          }
        });
      });

      if (!results.success) {
        logger.error('Model execution failed:', results.error);
        throw new Error(results.error || 'Model execution failed');
      }

      logger.info(`Detection complete: ${results.result} (confidence: ${results.confidence})`);
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
   * Get model info
   */
  getModelInfo() {
    return {
      name: 'Spam Detector ML',
      version: '2.0.0',
      type: 'TEXT_CLASSIFICATION',
      isReady: this.isReady,
      modelPath: this.modelPath,
      backend: 'scikit-learn'
    };
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