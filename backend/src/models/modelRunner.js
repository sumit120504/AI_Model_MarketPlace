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
      
      // Verify Python environment is ready
      if (!await this.verifyPythonSetup()) {
        throw new Error('Python environment is not properly configured');
      }

      const options = {
        mode: 'text',
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'], // unbuffered output
        scriptPath: __dirname
      };

      let tempInputFile = null;
      try {
        // Create temp input file with unique name to avoid conflicts
        tempInputFile = path.join(process.cwd(), 'models', `temp_input_${Date.now()}.json`);
        
        // Prepare model input configuration
        const modelConfig = {
          input: inputData,
          modelType: this.modelInfo?.type || 'text_classification',
          modelConfig: this.modelInfo?.config || {}
        };
        
        await fs.writeFile(tempInputFile, JSON.stringify(modelConfig, null, 2));
        options.args = [this.modelPath, tempInputFile];
        
        logger.info('Running model with options:', {
          modelPath: this.modelPath,
          modelType: modelConfig.modelType,
          pythonPath: this.pythonPath
        });

    const results = await new Promise((resolve, reject) => {
      // Create Python shell with error handling
      const pyshell = new PythonShell('run_model.py', options);
      let modelOutput = [];
      let errorOutput = [];          pyshell.on('message', (message) => {
            try {
              // Try to parse as JSON first (it could be the final result)
              const parsed = JSON.parse(message);
              if (parsed.success !== undefined) {
                // This is our final result object
                resolve(parsed);
              } else {
                // It's a progress/debug message
                modelOutput.push(message);
                logger.debug('Model output:', message);
              }
            } catch {
              // Not JSON, treat as debug output
              modelOutput.push(message);
              logger.debug('Model debug:', message);
            }
          });

          pyshell.on('stderr', (err) => {
            errorOutput.push(err);
            logger.error('Model stderr:', err);
          });

          pyshell.on('error', (err) => {
            logger.error('Python shell error:', err);
            reject(new Error(`Model execution failed: ${err.message}\nDebug output: ${modelOutput.join('\n')}\nError output: ${errorOutput.join('\n')}`));
          });

          pyshell.on('close', () => {
            if (modelOutput.length === 0) {
              reject(new Error('No output received from model'));
            }
          });

          // Set timeout for model execution
          const timeout = setTimeout(() => {
            pyshell.kill();
            reject(new Error('Model execution timed out after 30 seconds'));
          }, 30000);

          pyshell.end((err) => {
            clearTimeout(timeout);
            if (err) {
              logger.error('Python script error:', err);
              reject(new Error(`Model execution failed: ${err.message}\nDebug output: ${modelOutput.join('\n')}\nError output: ${errorOutput.join('\n')}`));
            }
          });
        });

        return results;

      } catch (error) {
        logger.error('Model execution error:', error);
        throw new Error(`Model execution failed: ${error.message}`);
      } finally {
        // Cleanup temp input file
        if (tempInputFile) {
          try {
            await fs.unlink(tempInputFile);
          } catch (cleanupError) {
            logger.warn('Failed to cleanup temp input file:', cleanupError);
          }
        }
      }

      if (!results.success) {
        const errorMessage = results.error || 'Model execution failed';
        logger.error('Model execution failed:', errorMessage);
        throw new Error(errorMessage);
      }

      // Process results
      let processedResults = {
        success: true,
        result: null,
        confidence: null
      };

      if (results.output && results.output.prediction !== undefined) {
        processedResults.result = Boolean(results.output.prediction);  // Convert to boolean for spam detection
        
        if (results.output.probabilities) {
          // Get confidence from probability of the predicted class
          processedResults.confidence = results.output.probabilities[results.output.prediction];
        }
      }

      // Log success
      logger.info('Inference complete:', processedResults);
      
      if (results.metadata) {
        logger.debug('Inference metadata:', results.metadata);
      }

      return processedResults;
      
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