"""
Generic model runner for text/image classification compatible with sklearn-like models.
Input is provided via a JSON file with fields:
  - input: string | object
  - modelType: text_classification | image_classification | regression | other
  - modelConfig: optional object
"""

import base64
import json
import math
import os
import pickle
import re
import sys
import tempfile
import traceback
import warnings
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    import cv2
except Exception:
    cv2 = None

try:
    from sklearn.exceptions import InconsistentVersionWarning
except Exception:
    InconsistentVersionWarning = UserWarning

try:
    import onnxruntime as ort
except Exception:
    ort = None


def _safe_print(msg: str) -> None:
    print(msg, flush=True)


def _read_json_if_exists(path: Path) -> Dict[str, Any]:
    try:
        if path.exists() and path.is_file():
            with open(path, "r", encoding="utf-8") as f:
                parsed = json.load(f)
                if isinstance(parsed, dict):
                    return parsed
    except Exception:
        return {}
    return {}


def _find_first_file(base_dir: Path, suffixes: List[str]) -> Optional[Path]:
    for candidate in base_dir.rglob("*"):
        if candidate.is_file() and candidate.suffix.lower() in suffixes:
            return candidate
    return None


def _resolve_artifact(model_path: str) -> Tuple[Path, Dict[str, Any], Optional[str]]:
    path = Path(model_path)
    if not path.exists():
        raise ValueError(f"Model file not found: {model_path}")
    if path.stat().st_size == 0:
        raise ValueError(f"Model file is empty: {model_path}")

    metadata = {}

    # Sidecar metadata next to a direct model file.
    parent = path.parent
    metadata = _read_json_if_exists(parent / "metadata.json")
    if not metadata:
        metadata = _read_json_if_exists(parent / "model_metadata.json")

    # If uploaded artifact is a zip bundle, extract and locate model + metadata.
    if zipfile.is_zipfile(str(path)):
        temp_dir = tempfile.mkdtemp(prefix="ai_marketplace_bundle_")
        with zipfile.ZipFile(path, "r") as zf:
            zf.extractall(temp_dir)

        extracted_root = Path(temp_dir)
        metadata = _read_json_if_exists(extracted_root / "metadata.json")
        if not metadata:
            metadata = _read_json_if_exists(extracted_root / "model_metadata.json")

        model_candidate = _find_first_file(extracted_root, [".onnx", ".pkl", ".pickle"])
        if model_candidate is None:
            raise ValueError("Zip bundle did not contain a supported model file (.onnx/.pkl/.pickle)")

        return model_candidate, metadata, temp_dir

    return path, metadata, None


def load_model(model_path: str) -> Dict[str, Any]:
    resolved_path, metadata, extraction_dir = _resolve_artifact(model_path)
    ext = resolved_path.suffix.lower()

    if ext == ".onnx":
        if ort is None:
            raise RuntimeError("onnxruntime is not installed")

        session = ort.InferenceSession(str(resolved_path), providers=["CPUExecutionProvider"])
        return {
            "kind": "onnx",
            "model": session,
            "metadata": metadata,
            "model_path": str(resolved_path),
            "cleanup_dir": extraction_dir,
        }

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", InconsistentVersionWarning)
        with open(resolved_path, "rb") as f:
            model = pickle.load(f)

    return {
        "kind": "pickle",
        "model": model,
        "metadata": metadata,
        "model_path": str(resolved_path),
        "cleanup_dir": extraction_dir,
    }


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


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits)
    exps = np.exp(shifted)
    denom = np.sum(exps)
    if denom <= 0:
        return np.ones_like(exps) / max(1, exps.shape[0])
    return exps / denom


def _extract_label_list(model_metadata: Dict[str, Any], model_config: Dict[str, Any]) -> List[str]:
    # Common layouts we support:
    # {"labels": [...]}
    # {"config": {"labels": [...]}}
    # {"class_names": [...]} or modelConfig.labels
    candidates = []
    if isinstance(model_config, dict):
        candidates.append(model_config.get("labels"))
    if isinstance(model_metadata, dict):
        candidates.append(model_metadata.get("labels"))
        cfg = model_metadata.get("config")
        if isinstance(cfg, dict):
            candidates.append(cfg.get("labels"))
        candidates.append(model_metadata.get("class_names"))

    for item in candidates:
        if isinstance(item, list) and item:
            return [str(x) for x in item]
    return []


def _read_input_size(model_metadata: Dict[str, Any], model_config: Dict[str, Any]) -> Optional[Tuple[int, int]]:
    # priority: request modelConfig.imageSize -> metadata.input_size -> metadata.config.input_size
    size = None
    if isinstance(model_config, dict):
        size = model_config.get("imageSize")
    if size is None and isinstance(model_metadata, dict):
        size = model_metadata.get("input_size")
        if size is None and isinstance(model_metadata.get("config"), dict):
            size = model_metadata["config"].get("input_size")

    if isinstance(size, str) and "x" in size:
        parts = size.lower().split("x")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            return int(parts[0]), int(parts[1])

    if isinstance(size, (list, tuple)) and len(size) >= 2:
        try:
            return int(size[0]), int(size[1])
        except Exception:
            return None
    return None


def _prepare_onnx_image_input(
    raw_input: Any,
    input_shape: List[Any],
    model_metadata: Dict[str, Any],
    model_config: Dict[str, Any],
) -> np.ndarray:
    image = normalize_input(raw_input, "image_classification", {"flatten": False})

    # normalize_input returns N,H,W,C for image branch when flatten=False.
    if isinstance(image, np.ndarray) and image.ndim == 4:
        image = image[0]

    if not isinstance(image, np.ndarray):
        raise ValueError("Image preprocessing failed: expected numpy array")

    target = _read_input_size(model_metadata, model_config)
    if target and cv2 is not None:
        image = cv2.resize(image, (int(target[0]), int(target[1])))

    # Infer channel ordering from ONNX input shape if possible.
    # Typical expected input shape: [N, C, H, W] or [N, H, W, C].
    channels_first = True
    if len(input_shape) >= 4:
        # Prefer NHWC only when shape clearly indicates channel in last dim.
        last_dim = input_shape[-1]
        if isinstance(last_dim, int) and last_dim in (1, 3):
            channels_first = False

    arr = image.astype(np.float32)
    if np.max(arr) > 1.0:
        arr = arr / 255.0

    if arr.ndim == 2:
        arr = np.expand_dims(arr, axis=-1)

    if channels_first:
        if arr.ndim == 3:
            arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, axis=0)
    else:
        arr = np.expand_dims(arr, axis=0)

    return arr.astype(np.float32)


def _run_onnx_inference(
    session: Any,
    raw_input: Any,
    model_metadata: Dict[str, Any],
    model_config: Dict[str, Any],
) -> Dict[str, Any]:
    if ort is None:
        raise RuntimeError("onnxruntime is not installed")

    inputs = session.get_inputs()
    if not inputs:
        raise RuntimeError("ONNX model has no input tensors")

    input_meta = inputs[0]
    tensor = _prepare_onnx_image_input(raw_input, list(input_meta.shape), model_metadata, model_config)
    outputs = session.run(None, {input_meta.name: tensor})
    if not outputs:
        raise RuntimeError("ONNX model returned no outputs")

    raw = np.asarray(outputs[0])
    if raw.ndim == 0:
        raw = raw.reshape(1)
    if raw.ndim > 1:
        raw = raw[0]

    logits = raw.astype(float)

    # If output already looks like probabilities, keep it; otherwise softmax.
    if np.all(logits >= 0.0) and np.all(logits <= 1.0) and math.isclose(float(np.sum(logits)), 1.0, rel_tol=1e-3, abs_tol=1e-3):
        probs = logits
    else:
        probs = _softmax(logits)

    pred_idx = int(np.argmax(probs))
    labels = _extract_label_list(model_metadata, model_config)
    label = labels[pred_idx] if pred_idx < len(labels) else str(pred_idx)

    prob_map: Dict[str, float] = {}
    for idx, prob in enumerate(probs):
        key = labels[idx] if idx < len(labels) else str(idx)
        prob_map[str(key)] = float(prob)

    return {
        "label": str(label),
        "confidence": float(probs[pred_idx]),
        "probabilities": prob_map,
        "metadata": {
            "runtime": "onnxruntime",
            "input_tensor": input_meta.name,
            "model_path": model_metadata.get("model_path") if isinstance(model_metadata, dict) else None,
        },
    }


def run_inference(
    loaded_model: Dict[str, Any],
    raw_input: Any,
    normalized_input: Any,
    model_config: Dict[str, Any],
) -> Dict[str, Any]:
    output: Dict[str, Any] = {
        "label": "UNKNOWN",
        "confidence": 1.0,
        "probabilities": {},
    }

    runtime = loaded_model.get("kind")
    model = loaded_model.get("model")
    metadata = loaded_model.get("metadata") or {}

    if runtime == "onnx":
        return _run_onnx_inference(model, raw_input, metadata, model_config)

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
        result = run_inference(model, raw_input, normalized_input, model_config)

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
    finally:
        # Clean up extracted zip bundle files, if any.
        try:
            cleanup_dir = None
            if "model" in locals() and isinstance(model, dict):
                cleanup_dir = model.get("cleanup_dir")
            if cleanup_dir and os.path.isdir(cleanup_dir):
                for root, dirs, files in os.walk(cleanup_dir, topdown=False):
                    for name in files:
                        try:
                            os.remove(os.path.join(root, name))
                        except Exception:
                            pass
                    for name in dirs:
                        try:
                            os.rmdir(os.path.join(root, name))
                        except Exception:
                            pass
                try:
                    os.rmdir(cleanup_dir)
                except Exception:
                    pass
        except Exception:
            pass


if __name__ == "__main__":
    main()
