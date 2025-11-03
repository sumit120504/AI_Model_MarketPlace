from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
import pickle
import numpy as np

# Example training data
spam_examples = [
    "CONGRATULATIONS! You've WON! Click here to claim your prize!!!",
    "GET RICH QUICK! Amazing investment opportunity!",
    "FREE MONEY! Limited time offer! Act now!"
]

not_spam_examples = [
    "Hi John, let's meet for coffee tomorrow at 3pm.",
    "Meeting reminder: Team sync at 10am",
    "Your order has been shipped. Tracking: ABC123"
]

# Train the model
X = spam_examples + not_spam_examples
y = [1] * len(spam_examples) + [0] * len(not_spam_examples)

model = Pipeline([
    ('vectorizer', CountVectorizer()),
    ('classifier', MultinomialNB())
])

model.fit(X, y)

# Test the model
test_input = "Hi John, let's meet for coffee tomorrow at 3pm."

# Make prediction
prediction = model.predict([test_input])[0]
probabilities = model.predict_proba([test_input])[0]

print(f"\nTest Results:")
print(f"Input text: {test_input}")
print(f"Prediction: {'SPAM' if prediction == 1 else 'NOT_SPAM'}")
print(f"Probabilities: NOT_SPAM={probabilities[0]:.3f}, SPAM={probabilities[1]:.3f}")

# Format result like we do in run_model.py
result = {
    'label': 'SPAM' if prediction == 1 else 'NOT_SPAM',
    'confidence': float(probabilities[prediction]),
    'probabilities': {
        'NOT_SPAM': float(probabilities[0]),
        'SPAM': float(probabilities[1])
    }
}

print(f"\nFormatted result that should match our API:")
for key, value in result.items():
    print(f"{key}: {value}")