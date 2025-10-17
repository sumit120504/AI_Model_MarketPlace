const natural = require('natural');
const logger = require('../utils/logger');

/**
 * Simple Spam Detector using NLP
 * For MVP, we use a rule-based system with keyword matching
 * In production, this would be replaced with a trained ML model
 */
class SpamDetector {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.classifier = null;
    this.isReady = false;
    
    // Spam indicators
    this.spamKeywords = [
      'winner', 'free', 'prize', 'congratulations', 'claim',
      'limited time', 'offer', 'buy now', 'click here', 'urgent',
      'act now', '$$$', 'money', 'cash', 'guaranteed',
      'no cost', 'risk free', 'special promotion', 'discount'
    ];
    
    // Spam patterns (regex)
    this.spamPatterns = [
      /\$+\d+/g,                    // Money symbols
      /!!+/g,                        // Multiple exclamation marks
      /FREE/g,                       // All caps FREE
      /WIN(NER)?/gi,                 // WIN/WINNER
      /click\s+here/gi,              // Click here
      /\d{3}[-.]?\d{3}[-.]?\d{4}/g, // Phone numbers
    ];
    
    logger.info('Spam Detector initialized');
  }
  
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

module.exports = { SpamDetector, getSpamDetector };