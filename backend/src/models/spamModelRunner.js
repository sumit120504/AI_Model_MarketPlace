import { PythonShell } from 'python-shell';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Specialized Model Runner for Spam Detection model
 */
class SpamModelRunner {
  constructor() {
    this.isReady = false;
    this.modelPath = null;
    this.pythonScript = path.join(__dirname, 'run_model.py');
    
    // Use absolute path to Python executable
    const projectRoot = path.resolve(process.cwd(), '..');
    this.pythonPath = process.env.PYTHON_PATH || path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
    this.pythonPath = this.pythonPath.replace(/\//g, '\\');
    
    logger.info('Spam Model Runner initialized');
  }

  /**
   * Initialize the runner
   */
  async initialize() {
    try {
      if (!this.pythonPath) {
        throw new Error('Python path is not set');
      }

      await fs.access(this.pythonPath);
      this.isReady = true;
      logger.info('✅ Spam Model Runner ready');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Spam Model Runner:', error);
      throw error;
    }
  }

  /**
   * Set the model path
   */
  async setModelPath(modelPath) {
    try {
      await fs.access(modelPath);
      this.modelPath = modelPath;
      logger.info(`Model path set to: ${modelPath}`);
    } catch (error) {
      throw new Error(`Model file not found at ${modelPath}`);
    }
  }

  /**
   * Run spam detection inference
   */
  async runInference(inputText) {
    if (!this.isReady) {
      await this.initialize();
    }
    
    if (!this.modelPath) {
      throw new Error('Model path not set');
    }

    if (typeof inputText !== 'string') {
      throw new Error(`Expected string input, got ${typeof inputText}`);
    }
    
    let tempInputFile = null;
    
    try {
      // Create temp input file
      tempInputFile = path.join(process.cwd(), 'models', `temp_input_${Date.now()}.json`);
      
      // Prepare input data
      const inputData = {
        input: inputText,
        modelType: 'text_classification',
        modelConfig: {}
      };
      
      await fs.writeFile(tempInputFile, JSON.stringify(inputData, null, 2));

      // Run Python script
      const result = await this._runPythonScript(this.modelPath, tempInputFile);
      
      // Verify and normalize result
      if (!result.success || !result.output) {
        throw new Error('Invalid model output');
      }

      const { label, confidence, probabilities } = result.output;
      
      if (!label || typeof confidence !== 'number' || !probabilities) {
        throw new Error('Missing required fields in model output');
      }

      // Return normalized result
      return {
        success: true,
        result: label,
        confidence: confidence,
        metadata: {
          probabilities
        }
      };

    } catch (error) {
      logger.error('Inference failed:', error);
      throw new Error(`Inference failed: ${error.message}`);
    } finally {
      // Cleanup temp file
      if (tempInputFile) {
        try {
          await fs.unlink(tempInputFile);
        } catch (err) {
          logger.warn('Failed to cleanup temp file:', err);
        }
      }
    }
  }

  /**
   * Internal method to run Python script
   */
  async _runPythonScript(modelPath, inputPath) {
    return new Promise((resolve, reject) => {
      const options = {
        mode: 'text',
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'],
        scriptPath: __dirname,
        args: [modelPath, inputPath]
      };

      const pyshell = new PythonShell('run_model.py', options);
      let outputJson = null;
      let errorOutput = [];

      pyshell.on('message', (message) => {
        try {
          // Only parse lines that look like JSON
          if (message.trim().startsWith('{')) {
            const parsed = JSON.parse(message);
            if (parsed.success !== undefined) {
              outputJson = parsed;
            }
          }
          logger.debug('Python output:', message);
        } catch (err) {
          // Not JSON, treat as debug output
          logger.debug('Python message:', message);
        }
      });

      pyshell.on('stderr', (err) => {
        errorOutput.push(err);
        logger.error('Python error:', err);
      });

      pyshell.on('error', (err) => {
        reject(new Error(`Python error: ${err.message}`));
      });

      const timeout = setTimeout(() => {
        pyshell.kill();
        reject(new Error('Model execution timed out'));
      }, 30000);

      pyshell.end((err) => {
        clearTimeout(timeout);
        
        if (err) {
          return reject(new Error(`Script error: ${err.message}`));
        }
        
        if (!outputJson) {
          return reject(new Error('No valid output from model'));
        }
        
        if (!outputJson.success) {
          return reject(new Error(outputJson.error || 'Model execution failed'));
        }
        
        resolve(outputJson);
      });
    });
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      type: 'spam_detection',
      isReady: this.isReady,
      modelPath: this.modelPath
    };
  }
}

// Singleton instance
let spamModelRunnerInstance = null;

export function getSpamModelRunner() {
  if (!spamModelRunnerInstance) {
    spamModelRunnerInstance = new SpamModelRunner();
  }
  return spamModelRunnerInstance;
}

export { SpamModelRunner };