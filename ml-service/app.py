"""
app.py - small Flask microservice that wraps the trained pancreas-scan model.
Loads everything ONCE at startup, then exposes POST /predict.
Run with: python app.py
Runs on http://localhost:5001 by default.
"""

import os
import tempfile
import json

import numpy as np
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS

import tensorflow as tf
from tensorflow.keras.applications import DenseNet121
from tensorflow.keras.applications.densenet import preprocess_input as densenet_preprocess

from utils import (
    preprocess_image,
    detect_harris_corners,
    build_graph_from_corners,
    extract_graph_stats,
    prepare_for_cnn,
    is_likely_ct_scan,
    is_abdominal_ct,
    GRAPH_STAT_KEYS,
)

app = Flask(__name__)
CORS(app)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
model_state = {
    "densenet_base": None,
    "svm_model": None,
    "scaler": None,
    "woa_mask": None,
    "outlier_detector": None,
    "abdominal_threshold": None,
}


def load_models():
    if model_state["densenet_base"] is not None:
        return

    print("Loading DenseNet121 CNN backbone...")
    model_state["densenet_base"] = DenseNet121(
        weights="imagenet", include_top=False, pooling="avg", input_shape=(224, 224, 3)
    )

    print("Loading trained SVM model, scaler, and WOA feature mask...")
    model_state["svm_model"] = joblib.load(os.path.join(MODEL_DIR, "final_model.pkl"))
    model_state["scaler"] = joblib.load(os.path.join(MODEL_DIR, "final_scaler.pkl"))
    model_state["woa_mask"] = np.load(os.path.join(MODEL_DIR, "final_woa_mask.npy"))

    print("Loading CT-scan validation (outlier detector)...")
    model_state["outlier_detector"] = joblib.load(os.path.join(MODEL_DIR, "outlier_detector.pkl"))
    with open(os.path.join(MODEL_DIR, "abdominal_threshold.json")) as f:
        model_state["abdominal_threshold"] = json.load(f)["threshold"]

    print("ML service ready.")


def run_pipeline(img_path):
    load_models()
    densenet_base = model_state["densenet_base"]
    svm_model = model_state["svm_model"]
    scaler = model_state["scaler"]
    woa_mask = model_state["woa_mask"]
    outlier_detector = model_state["outlier_detector"]
    abdominal_threshold = model_state["abdominal_threshold"]

    is_valid, message = is_likely_ct_scan(img_path)
    if not is_valid:
        raise ValueError("This doesn't look like a proper abdominal CT scan. Please upload a valid abdominal CT scan.")

    img = preprocess_image(img_path)

    is_abdominal, score = is_abdominal_ct(img, densenet_base, densenet_preprocess, outlier_detector, abdominal_threshold)
    if not is_abdominal:
        raise ValueError("This doesn't look like a proper abdominal CT scan. Please upload a valid abdominal CT scan.")

    corners = detect_harris_corners(img, top_n=2500)
    graph = build_graph_from_corners(corners, k=5)
    stats = extract_graph_stats(graph)
    graph_feat = np.array([[stats[k] for k in GRAPH_STAT_KEYS]])

    img_batch = np.expand_dims(img, axis=0)
    cnn_input = prepare_for_cnn(img_batch, densenet_preprocess)
    cnn_feat = densenet_base.predict(cnn_input, verbose=0)

    combined = np.concatenate([cnn_feat, graph_feat], axis=1)
    scaled = scaler.transform(combined)
    selected = scaled[:, np.where(woa_mask == 1)[0]]

    prediction = int(svm_model.predict(selected)[0])
    proba = svm_model.predict_proba(selected)[0]

    return prediction, proba


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded under field name 'image'"}), 400

    file = request.files["image"]

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        prediction, proba = run_pipeline(tmp_path)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.remove(tmp_path)

    label = "positive" if prediction == 1 else "negative"

    return jsonify({
        "prediction": label,
        "tumor_probability": float(proba[1]),
        "no_tumor_probability": float(proba[0]),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)), debug=True)