import { PythonShell } from 'python-shell';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generic AI Model Runner for handling any model type from IPFS
 */
class ModelRunner {
  constructor() {
    this.isReady = false;
    this.modelPath = null;
    this.modelInfo = null;
    this.pythonScript = path.join(__dirname, 'run_model.py');
    
    // Use absolute path to Python executable
    const projectRoot = path.resolve(process.cwd(), '..');
    this.pythonPath = process.env.PYTHON_PATH || path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
    
    // Convert to proper Windows path format
    this.pythonPath = this.pythonPath.replace(/\//g, '\\');

    // Set PYTHONPATH to include the virtualenv site-packages
    process.env.PYTHONPATH = path.join(projectRoot, '.venv', 'Lib', 'site-packages');
    
    logger.info('Model Runner initialized with Python path:', this.pythonPath);
    logger.info('PYTHONPATH set to:', process.env.PYTHONPATH);
  }

  /**
   * Initialize the model runner
   */
  async initialize() {
    try {
      // Verify Python environment
      await this.verifyPythonSetup();
      this.isReady = true;
      logger.info('✅ Model Runner ready');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Model Runner:', error);
      throw error;
    }
  }

  /**
   * Verify Python setup and dependencies
   */
  async verifyPythonSetup() {
    if (!this.pythonPath) {
      throw new Error('Python path is not set');
    }

    try {
      // First verify Python path exists
      logger.info('Checking Python executable at:', this.pythonPath);
      await fs.access(this.pythonPath);
    } catch (error) {
      logger.error('Python path access error:', error);
      throw new Error(`Python executable not found at ${this.pythonPath}. Please check your Python environment setup.`);
    }

    // Test Python version first
    return new Promise((resolve, reject) => {
      try {
        logger.info('Verifying Python version at path:', this.pythonPath);
        const versionCheck = new PythonShell('-c', {
          pythonPath: this.pythonPath,
          mode: 'text',
          args: ['import sys; print(sys.version)']
        });

        versionCheck.on('message', (message) => {
          logger.info('Python version:', message);
        });

        versionCheck.on('error', (err) => {
          logger.error('Python shell error:', err);
        });

        versionCheck.end((err) => {
          if (err) {
            logger.error('Python version check failed:', err);
            reject(new Error(`Failed to execute Python: ${err.message}`));
            return;
          }

          // Verify import_check.py exists
          const importCheckPath = path.join(__dirname, 'import_check.py');
          fs.access(importCheckPath)
            .then(() => {
              // Now check dependencies
              logger.info('Checking Python dependencies...');
              logger.info('Using import_check.py at:', importCheckPath);
              
              const dependencyCheck = new PythonShell('import_check.py', {
                pythonPath: this.pythonPath,
                scriptPath: __dirname,
                mode: 'text',
                pythonOptions: ['-W ignore']  // Ignore warnings like TensorFlow's oneDNN messages
              });

              let output = [];

              dependencyCheck.on('message', (message) => {
                output.push(message);
                logger.info('Python dependency check:', message);
              });

              dependencyCheck.on('error', (err) => {
                logger.error('Python dependency check error:', err);
              });

              dependencyCheck.end((err) => {
                if (err) {
                  logger.error('Python dependency check failed:', err);
                  output.forEach(line => logger.error('Python check output:', line));
                  reject(new Error(`Python environment verification failed: ${err.message}\nOutput: ${output.join('\n')}`));
                } else {
                  output.forEach(line => logger.info('Python check:', line));
                  logger.info('✅ Python environment verified successfully');
                  resolve(true);
                }
              });
            })
            .catch((err) => {
              logger.error('import_check.py not found:', err);
              reject(new Error(`import_check.py not found at ${importCheckPath}`));
            });
        });
      } catch (err) {
        logger.error('Unexpected error during Python verification:', err);
        reject(err);
      }
    });
  }

  /**
   * Set the path to the downloaded model file and load model info
   */
  async setModelPath(modelPath, modelInfo) {
    this.modelPath = modelPath;
    this.modelInfo = modelInfo;
    logger.info(`Model path set to: ${modelPath}`);
    
    // Verify model file exists
    try {
      await fs.access(modelPath);
    } catch (error) {
      throw new Error(`Model file not found at ${modelPath}`);
    }
  }

  /**
   * Run inference using the loaded model
   * @param {*} inputData - Input data in format expected by model
   * @returns {Promise<Object>} - Model output with metadata
   */
  async runInference(inputData) {
    if (!this.isReady) {
      await this.initialize();
    }
    
    if (!this.modelPath) {
      throw new Error('Model path not set. Call setModelPath() with downloaded model path first.');
    }
    
    try {
      logger.info('Running model inference...');
      
      const options = {
        mode: 'text',
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'], // unbuffered output
        scriptPath: __dirname,
        args: [
          this.modelPath,
          JSON.stringify({
            input: inputData,
            modelType: this.modelInfo?.type || 'unknown',
            modelConfig: this.modelInfo?.config || {}
          })
        ]
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

      // Log success
      logger.info(`Inference complete: ${JSON.stringify(results.output)}`);
      
      if (results.metadata) {
        logger.debug('Inference metadata:', results.metadata);
      }

      return results;
      
    } catch (error) {
      logger.error('Model inference failed:', error);
      throw error;
    }
  }

  /**
   * Run batch inference
   * @param {Array} inputs - Array of input data
   * @returns {Promise<Array>} - Array of results
   */
  async batchInference(inputs) {
    const results = [];
    let failedCount = 0;
    
    for (const input of inputs) {
      try {
        const result = await this.runInference(input);
        results.push(result);
      } catch (error) {
        failedCount++;
        results.push({
          success: false,
          error: error.message,
          output: null
        });
      }
    }
    
    logger.info(`Batch inference complete: ${results.length - failedCount} successful, ${failedCount} failed`);
    return results;
  }

  /**
   * Get model info including metadata
   */
  getModelInfo() {
    return {
      ...this.modelInfo,
      isReady: this.isReady,
      modelPath: this.modelPath
    };
  }
}

// Singleton instance
let modelRunnerInstance = null;

function getModelRunner() {
  if (!modelRunnerInstance) {
    modelRunnerInstance = new ModelRunner();
  }
  return modelRunnerInstance;
}

export { ModelRunner, getModelRunner };