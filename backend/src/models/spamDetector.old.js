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
  
  /**
   * Initialize the model (placeholder for loading trained model)
   */
  async initialize() {
    try {
      // In production, load trained model here
      // For MVP, we're using rule-based detection
      this.isReady = true;
      logger.info('✅ Spam Detector ready');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Spam Detector:', error);
      throw error;
    }
  }
  
  /**
   * Detect if email is spam
   * @param {string} emailText - Email content to analyze
   * @returns {Object} - { isSpam: boolean, confidence: number, result: string }
   */
  async detectSpam(emailText) {
    if (!this.isReady) {
      await this.initialize();
    }
    
    try {
      logger.info('Running spam detection...');
      
      // Preprocess text
      const text = emailText.toLowerCase().trim();
      const tokens = this.tokenizer.tokenize(text);
      
      let spamScore = 0;
      const maxScore = 100;
      
      // Check for spam keywords
      const keywordMatches = this.spamKeywords.filter(keyword => 
        text.includes(keyword.toLowerCase())
      );
      spamScore += keywordMatches.length * 10;
      
      // Check for spam patterns
      this.spamPatterns.forEach(pattern => {
        const matches = emailText.match(pattern);
        if (matches) {
          spamScore += matches.length * 5;
        }
      });
      
      // Check for excessive punctuation
      const exclamationCount = (emailText.match(/!/g) || []).length;
      const questionCount = (emailText.match(/\?/g) || []).length;
      if (exclamationCount > 2 || questionCount > 2) {
        spamScore += 15;
      }
      
      // Check for all caps words
      const capsWords = emailText.match(/\b[A-Z]{3,}\b/g);
      if (capsWords && capsWords.length > 0) {
        spamScore += capsWords.length * 10;
      }
      
      // Check for URLs
      const urlCount = (emailText.match(/https?:\/\//g) || []).length;
      if (urlCount > 2) {
        spamScore += urlCount * 8;
      }
      
      // Calculate confidence (normalize to 0-1)
      const confidence = Math.min(spamScore / maxScore, 1);
      const isSpam = confidence > 0.5;
      
      const result = {
        isSpam,
        confidence: parseFloat(confidence.toFixed(4)),
        result: isSpam ? 'SPAM' : 'NOT_SPAM',
        details: {
          spamScore,
          keywordMatches: keywordMatches.length,
          textLength: emailText.length,
          wordCount: tokens.length
        }
      };
      
      logger.info(`Detection complete: ${result.result} (confidence: ${result.confidence})`);
      
      return result;
      
    } catch (error) {
      logger.error('Spam detection failed:', error);
      throw error;
    }
  }
  
  /**
   * Batch inference for multiple emails
   * @param {Array<string>} emails - Array of email texts
   * @returns {Array<Object>} - Array of results
   */
  async batchDetect(emails) {
    const results = [];
    
    for (const email of emails) {
      const result = await this.detectSpam(email);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Get model info
   */
  getModelInfo() {
    return {
      name: 'Spam Detector Pro',
      version: '1.0.0',
      type: 'TEXT_CLASSIFICATION',
      isReady: this.isReady,
      keywordCount: this.spamKeywords.length,
      patternCount: this.spamPatterns.length
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