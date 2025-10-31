import pickle
import numpy as np

class SimpleSpamClassifier:
    def __init__(self):
        self.spam_keywords = ['viagra', 'lottery', 'winner', 'free', 'money']
        
    def predict(self, text):
        # Simple keyword-based prediction for testing
        text = text.lower()
        spam_score = sum(1 for keyword in self.spam_keywords if keyword in text)
        return 1 if spam_score >= 2 else 0
    
    def predict_proba(self, text):
        text = text.lower()
        spam_score = sum(1 for keyword in self.spam_keywords if keyword in text)
        prob_spam = min(1.0, spam_score / len(self.spam_keywords))
        return np.array([[1 - prob_spam, prob_spam]])

# Create and save test model
model = SimpleSpamClassifier()
with open('test_model.pkl', 'wb') as f:
    pickle.dump(model, f)