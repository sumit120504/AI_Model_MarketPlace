import pickle
import numpy as np

# Load the model
model_path = './models/downloaded/spam_detector.pkl'
with open(model_path, 'rb') as f:
    model = pickle.load(f)

# Test input
test_input = "Hi John, let's meet for coffee tomorrow at 3pm."

# Make prediction
prediction = model.predict([test_input])[0]
probabilities = model.predict_proba([test_input])[0]

print(f"Input text: {test_input}")
print(f"Raw prediction: {prediction}")
print(f"Raw probabilities: {probabilities}")

# Format result
result = {
    'label': 'SPAM' if prediction == 1 else 'NOT_SPAM',
    'confidence': float(probabilities[prediction]),
    'probabilities': {
        'NOT_SPAM': float(probabilities[0]),
        'SPAM': float(probabilities[1])
    }
}

print(f"\nFormatted result:")
print(result)