from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
import joblib
import os

# Example training data
spam_examples = [
    "CONGRATULATIONS! You've WON! Click here to claim your prize!!!",
    "GET RICH QUICK! Amazing investment opportunity!",
    "FREE MONEY! Limited time offer! Act now!",
    "You've won $1,000,000 in the lottery!",
    "URGENT: Your account needs verification",
    "Buy now! Special discount! Limited time!!!",
    "Make money fast! Work from home!",
    "100% Free credit card! Apply now!"
]

not_spam_examples = [
    "Hi John, let's meet for coffee tomorrow at 3pm.",
    "Meeting reminder: Team sync at 10am",
    "Your order has been shipped. Tracking: ABC123",
    "Thanks for your email. I'll get back to you soon.",
    "Project update: milestone 1 completed",
    "Please review the attached document",
    "Looking forward to seeing you tomorrow",
    "Your package has been delivered"
]

# Combine examples and create labels
X = spam_examples + not_spam_examples
y = [1] * len(spam_examples) + [0] * len(not_spam_examples)  # 1 for spam, 0 for not spam

# Create and train the model
model = Pipeline([
    ('vectorizer', CountVectorizer()),
    ('classifier', MultinomialNB())
])

model.fit(X, y)

# Create models/downloaded directory if it doesn't exist
os.makedirs('./models/downloaded', exist_ok=True)

# Save the model using pickle protocol 3 for better compatibility
import pickle
with open('./models/downloaded/spam_detector.pkl', 'wb') as f:
    pickle.dump(model, f, protocol=3)
print("Model saved successfully!")