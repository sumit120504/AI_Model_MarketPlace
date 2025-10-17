const { SpamDetector } = require('../models/spamDetector');

/**
 * Test script for Spam Detector model
 */
async function testSpamDetector() {
  console.log('🧪 Testing Spam Detector...\n');
  
  const detector = new SpamDetector();
  await detector.initialize();
  
  // Test cases
  const testEmails = [
    {
      text: "Hi John, let's meet for coffee tomorrow at 3pm. Looking forward to catching up!",
      expectedResult: "NOT_SPAM"
    },
    {
      text: "CONGRATULATIONS! You've WON $1,000,000! Click here NOW to claim your prize!!!",
      expectedResult: "SPAM"
    },
    {
      text: "Meeting reminder: Q4 planning session scheduled for Monday 10am in Conference Room B",
      expectedResult: "NOT_SPAM"
    },
    {
      text: "🎉 FREE MONEY! Limited time offer! Act now and get rich quick! No risk!!!",
      expectedResult: "SPAM"
    },
    {
      text: "Your package has been delivered. Tracking number: 1Z999AA10123456784",
      expectedResult: "NOT_SPAM"
    },
    {
      text: "Buy now! Special discount! Click here! Hurry before it's too late!!!",
      expectedResult: "SPAM"
    },
    {
      text: "Dear valued customer, your account requires verification. Please login at example.com",
      expectedResult: "SPAM"
    },
    {
      text: "Can you review the attached document before our meeting? Thanks!",
      expectedResult: "NOT_SPAM"
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  console.log('Running test cases...\n');
  console.log('═'.repeat(80));
  
  for (let i = 0; i < testEmails.length; i++) {
    const testCase = testEmails[i];
    const result = await detector.detectSpam(testCase.text);
    
    const isCorrect = result.result === testCase.expectedResult;
    const status = isCorrect ? '✅ PASS' : '❌ FAIL';
    
    if (isCorrect) passed++;
    else failed++;
    
    console.log(`\nTest ${i + 1}: ${status}`);
    console.log(`Text: "${testCase.text.substring(0, 60)}${testCase.text.length > 60 ? '...' : ''}"`);
    console.log(`Expected: ${testCase.expectedResult}`);
    console.log(`Got: ${result.result} (confidence: ${result.confidence})`);
    console.log(`Details:`, result.details);
    console.log('─'.repeat(80));
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 Test Summary:');
  console.log(`   Total: ${testEmails.length}`);
  console.log(`   Passed: ${passed} ✅`);
  console.log(`   Failed: ${failed} ❌`);
  console.log(`   Success Rate: ${((passed / testEmails.length) * 100).toFixed(2)}%`);
  console.log('\n' + '═'.repeat(80));
  
  // Model info
  console.log('\n📋 Model Information:');
  const modelInfo = detector.getModelInfo();
  console.log(JSON.stringify(modelInfo, null, 2));
  
  console.log('\n✅ Testing complete!\n');
}

// Run tests
testSpamDetector().catch(console.error);