import pickle

# Load the trained model
with open('./models/downloaded/spam_detector.pkl', 'rb') as f:
    model = pickle.load(f)

# Example new messages to test
new_messages = [
    "Congratulations! You have won a free iPhone!",
    "Let's schedule a call tomorrow to discuss the project."
]

# Make predictions
predictions = model.predict(new_messages)

# Show results
for msg, pred in zip(new_messages, predictions):
    label = "SPAM" if pred == 1 else "NOT SPAM"
    print(f"Message: {msg}\nPrediction: {label}\n")
