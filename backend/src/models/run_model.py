"""
Generic model runner for text/image classification compatible with sklearn-like models.
Input is provided via a JSON file with fields:
  - input: string | object
  - modelType: text_classification | image_classification | regression | other
  - modelConfig: optional object
"""

import base64
import json
import pickle
import re
import sys
import traceback
import warnings
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np

try:
    import cv2
except Exception:
    cv2 = None

try:
    from sklearn.exceptions import InconsistentVersionWarning
except Exception:
    InconsistentVersionWarning = UserWarning


def _safe_print(msg: str) -> None:
    print(msg, flush=True)


def load_model(model_path: str) -> Any:
    path = Path(model_path)
    if not path.exists():
        raise ValueError(f"Model file not found: {model_path}")
    if path.stat().st_size == 0:
        raise ValueError(f"Model file is empty: {model_path}")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", InconsistentVersionWarning)
        with open(model_path, "rb") as f:
            model = pickle.load(f)

    return model


def _read_image_from_path(path_str: str) -> np.ndarray:
    if cv2 is None:
        raise RuntimeError("opencv-python is not installed")
    image = cv2.imread(path_str, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Failed to read image from path: {path_str}")
    return image


def _read_image_from_base64(data: str) -> np.ndarray:
    if cv2 is None:
        raise RuntimeError("opencv-python is not installed")

    # Supports data URI and plain base64
    payload = data
    match = re.match(r"^data:image/[^;]+;base64,(.+)$", data)
    if match:
        payload = match.group(1)

    binary = base64.b64decode(payload)
    arr = np.frombuffer(binary, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode base64 image")
    return image


def normalize_input(raw_input: Any, model_type: str, model_config: Dict[str, Any]) -> Any:
    model_type = (model_type or "").lower()

    if "image" in model_type:
        if isinstance(raw_input, dict):
            candidate = raw_input.get("image") or raw_input.get("path") or raw_input.get("data")
        else:
            candidate = raw_input

        if not isinstance(candidate, str) or not candidate.strip():
            raise ValueError("Image classification expects input as image path/base64 string")

        candidate = candidate.strip()

        if candidate.startswith("data:image") or len(candidate) > 512:
            image = _read_image_from_base64(candidate)
        elif Path(candidate).exists():
            image = _read_image_from_path(candidate)
        else:
            # If path does not exist, try decoding as base64 anyway.
            image = _read_image_from_base64(candidate)

        target_size = model_config.get("imageSize") if isinstance(model_config, dict) else None
        if isinstance(target_size, (list, tuple)) and len(target_size) == 2 and cv2 is not None:
            image = cv2.resize(image, (int(target_size[0]), int(target_size[1])))

        # Flatten for sklearn-style classifiers unless caller explicitly wants raw tensor-like array.
        as_flat = model_config.get("flatten", True) if isinstance(model_config, dict) else True
        if as_flat:
            return image.reshape(1, -1)
        return np.expand_dims(image, axis=0)

    if "text" in model_type:
        if isinstance(raw_input, dict):
            raw_input = raw_input.get("text") or raw_input.get("input") or ""
        if not isinstance(raw_input, str):
            raise ValueError(f"Text classification expects string input, got {type(raw_input)}")
        return raw_input

    # Generic fallback
    return raw_input


def _label_from_prediction(pred: Any) -> str:
    if isinstance(pred, (np.integer, int)):
        return str(int(pred))
    if isinstance(pred, float):
        return str(pred)
    return str(pred)


def run_inference(model: Any, normalized_input: Any) -> Dict[str, Any]:
    output: Dict[str, Any] = {
        "label": "UNKNOWN",
        "confidence": 1.0,
        "probabilities": {},
    }

    # Support serialized bundle format: {'vectorizer': ..., 'model': ...}
    if isinstance(model, dict) and "model" in model:
        estimator = model.get("model")
        vectorizer = model.get("vectorizer")

        features = normalized_input
        if isinstance(normalized_input, str) and vectorizer is not None and hasattr(vectorizer, "transform"):
            features = vectorizer.transform([normalized_input])

        if estimator is None or not hasattr(estimator, "predict"):
            raise RuntimeError("Serialized model dict is missing a valid estimator under key 'model'")

        pred = estimator.predict(features)[0]
        output["label"] = _label_from_prediction(pred)

        if hasattr(estimator, "predict_proba"):
            probs = np.asarray(estimator.predict_proba(features)[0], dtype=float)
            classes = getattr(estimator, "classes_", None)
            if classes is not None and len(classes) == len(probs):
                output["probabilities"] = {str(classes[i]): float(probs[i]) for i in range(len(probs))}
                try:
                    pred_index = list(classes).index(pred)
                    output["confidence"] = float(probs[pred_index])
                except Exception:
                    output["confidence"] = float(np.max(probs))
            else:
                output["probabilities"] = {str(i): float(probs[i]) for i in range(len(probs))}
                output["confidence"] = float(np.max(probs))

        if output["label"] in {"1", "SPAM", "spam"}:
            output["label"] = "SPAM"
        elif output["label"] in {"0", "HAM", "NOT_SPAM", "ham", "not_spam"}:
            output["label"] = "NOT_SPAM"

        return output

    # sklearn-like path
    if hasattr(model, "predict"):
        pred = model.predict([normalized_input])[0] if isinstance(normalized_input, str) else model.predict(normalized_input)[0]
        output["label"] = _label_from_prediction(pred)

        if hasattr(model, "predict_proba"):
            probs = model.predict_proba([normalized_input])[0] if isinstance(normalized_input, str) else model.predict_proba(normalized_input)[0]
            probs = np.asarray(probs, dtype=float)

            classes = getattr(model, "classes_", None)
            if classes is not None and len(classes) == len(probs):
                output["probabilities"] = {str(classes[i]): float(probs[i]) for i in range(len(probs))}
            else:
                output["probabilities"] = {str(i): float(probs[i]) for i in range(len(probs))}

            # Choose confidence by predicted class index when possible
            if classes is not None:
                try:
                    pred_index = list(classes).index(pred)
                    output["confidence"] = float(probs[pred_index])
                except Exception:
                    output["confidence"] = float(np.max(probs))
            else:
                output["confidence"] = float(np.max(probs))

        # Backward-compatible mapping for common binary spam labels
        if output["label"] in {"1", "SPAM", "spam"}:
            output["label"] = "SPAM"
        elif output["label"] in {"0", "HAM", "NOT_SPAM", "ham", "not_spam"}:
            output["label"] = "NOT_SPAM"

        return output

    raise RuntimeError("Loaded model does not expose a supported inference API (predict/predict_proba)")


def main() -> None:
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected args: <model_path> <input_json_path>")

        model_path = sys.argv[1]
        input_json_path = sys.argv[2]

        with open(input_json_path, "r", encoding="utf-8") as f:
            payload = json.load(f)

        raw_input = payload.get("input")
        model_type = payload.get("modelType", "text_classification")
        model_config = payload.get("modelConfig", {}) or {}

        model = load_model(model_path)
        normalized_input = normalize_input(raw_input, model_type, model_config)
        result = run_inference(model, normalized_input)

        _safe_print(json.dumps({"success": True, "output": result}))

    except Exception as exc:
        _safe_print(
            json.dumps(
                {
                    "success": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                }
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
