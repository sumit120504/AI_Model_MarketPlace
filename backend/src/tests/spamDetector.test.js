const { SpamDetector } = require('../models/spamDetector');

describe('SpamDetector', () => {
  let spamDetector;

  beforeEach(() => {
    spamDetector = new SpamDetector();
  });

  describe('detectSpam', () => {
    it('should detect obvious spam emails', async () => {
      const spamEmail = "CONGRATULATIONS! You've WON $1,000,000! Click here NOW to claim your prize!!!";
      
      const result = await spamDetector.detectSpam(spamEmail);
      
      expect(result.isSpam).toBe(true);
      expect(result.result).toBe('SPAM');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect legitimate emails as not spam', async () => {
      const legitimateEmail = "Hi John, let's meet for coffee tomorrow at 3pm. Looking forward to catching up!";
      
      const result = await spamDetector.detectSpam(legitimateEmail);
      
      expect(result.isSpam).toBe(false);
      expect(result.result).toBe('NOT_SPAM');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle empty input', async () => {
      const result = await spamDetector.detectSpam('');
      
      expect(result).toHaveProperty('isSpam');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('result');
    });

    it('should detect emails with excessive punctuation as spam', async () => {
      const spamEmail = "Buy now!!! Special offer!!! Don't miss out!!!";
      
      const result = await spamDetector.detectSpam(spamEmail);
      
      expect(result.isSpam).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect emails with all caps as spam', async () => {
      const spamEmail = "FREE MONEY GUARANTEED WINNER";
      
      const result = await spamDetector.detectSpam(spamEmail);
      
      expect(result.isSpam).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return detailed analysis', async () => {
      const email = "CONGRATULATIONS! You've WON $1,000,000!";
      
      const result = await spamDetector.detectSpam(email);
      
      expect(result).toHaveProperty('details');
      expect(result.details).toHaveProperty('spamScore');
      expect(result.details).toHaveProperty('keywordMatches');
      expect(result.details).toHaveProperty('textLength');
      expect(result.details).toHaveProperty('wordCount');
    });
  });

  describe('batchDetect', () => {
    it('should process multiple emails', async () => {
      const emails = [
        "Hi John, let's meet for coffee",
        "CONGRATULATIONS! You've WON $1,000,000!"
      ];
      
      const results = await spamDetector.batchDetect(emails);
      
      expect(results).toHaveLength(2);
      expect(results[0].isSpam).toBe(false);
      expect(results[1].isSpam).toBe(true);
    });
  });

  describe('getModelInfo', () => {
    it('should return model information', () => {
      const info = spamDetector.getModelInfo();
      
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('type');
      expect(info).toHaveProperty('isReady');
      expect(info).toHaveProperty('keywordCount');
      expect(info).toHaveProperty('patternCount');
    });
  });
});

