

import numpy as np
# pyrefly: ignore [missing-import]
import cv2
import networkx as nx
from sklearn.neighbors import NearestNeighbors

TARGET_SIZE = (224, 224)
GRAPH_STAT_KEYS = ['num_nodes', 'num_edges', 'avg_degree', 'density']


def preprocess_image(img_path, target_size=TARGET_SIZE):
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Failed to read image: {img_path}")
    img = cv2.resize(img, target_size)
    img = cv2.GaussianBlur(img, (5, 5), 0)
    img = cv2.equalizeHist(img)
    return img


def detect_harris_corners(img, block_size=2, ksize=3, k=0.04, top_n=2500):
    img_float = np.float32(img)
    harris_response = cv2.cornerHarris(img_float, block_size, ksize, k)
    flat_response = harris_response.flatten()
    n_available = (flat_response > 0).sum()
    n_to_take = min(top_n, n_available)
    top_indices = np.argpartition(flat_response, -n_to_take)[-n_to_take:]
    ys, xs = np.unravel_index(top_indices, harris_response.shape)
    corner_coords = np.column_stack([xs, ys])
    return corner_coords


def build_graph_from_corners(corners, k=5):
    G = nx.Graph()
    n_points = len(corners)
    if n_points < 2:
        for i in range(n_points):
            G.add_node(i, pos=tuple(corners[i]))
        return G
    k_actual = min(k, n_points - 1)
    nbrs = NearestNeighbors(n_neighbors=k_actual + 1).fit(corners)
    distances, indices = nbrs.kneighbors(corners)
    for i in range(n_points):
        G.add_node(i, pos=tuple(corners[i]))
        for j_idx in range(1, k_actual + 1):
            j = indices[i][j_idx]
            dist = distances[i][j_idx]
            G.add_edge(i, j, weight=dist)
    return G


def extract_graph_stats(G):
    if G.number_of_nodes() == 0:
        return {'num_nodes': 0, 'num_edges': 0, 'avg_degree': 0, 'density': 0}
    num_nodes = G.number_of_nodes()
    num_edges = G.number_of_edges()
    avg_degree = (2 * num_edges) / num_nodes if num_nodes > 0 else 0
    density = nx.density(G)
    return {'num_nodes': num_nodes, 'num_edges': num_edges, 'avg_degree': avg_degree, 'density': density}


def prepare_for_cnn(X_gray, preprocess_fn):
    X_rgb = np.repeat(X_gray[..., np.newaxis], 3, axis=-1)
    X_rgb = X_rgb.astype('float32')
    X_preprocessed = preprocess_fn(X_rgb)
    return X_preprocessed


def is_likely_ct_scan(img_path):
    img_color = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
    if img_color is None:
        return False, "Could not read this file as an image."
    reasons = []
    if img_color.ndim == 3 and img_color.shape[-1] >= 3:
        b = img_color[..., 0].astype(int)
        g = img_color[..., 1].astype(int)
        r = img_color[..., 2].astype(int)
        color_diff = np.mean(np.abs(b - g)) + np.mean(np.abs(g - r)) + np.mean(np.abs(b - r))
        if color_diff > 45:
            reasons.append("image has high color variance")

        # A real (grayscale) CT scan has virtually no colored pixels anywhere.
        # A photo can average out low color-diff if most of the frame is neutral
        # (walls/ceiling/floor) while small regions (signage, plants, skin) are
        # strongly colored, so also check the per-pixel colorful fraction.
        per_pixel_diff = np.abs(b - g) + np.abs(g - r) + np.abs(b - r)
        colorful_ratio = (per_pixel_diff > 40).sum() / per_pixel_diff.size
        if colorful_ratio > 0.02:
            reasons.append("image contains colored regions inconsistent with a grayscale CT scan")

        gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_color
    h, w = gray.shape[:2]
    if max(h, w) / min(h, w) > 2.2:
        reasons.append("aspect ratio too skewed")
    resized = cv2.resize(gray, (224, 224))
    
    black_ratio = (resized < 30).sum() / resized.size
    if black_ratio < 0.01:
        reasons.append("not enough background contrast")
    center_mean = resized[60:164, 60:164].mean()
    if center_mean < 5:
        reasons.append("center is empty/black")
    is_valid = len(reasons) == 0
    message = "Valid CT scan." if is_valid else "This doesn't look like a proper abdominal CT scan. Please upload a valid abdominal CT scan."
    return is_valid, message


def is_abdominal_ct(img, cnn_model, cnn_preprocess_fn, detector, threshold):
    img_batch = np.expand_dims(img, 0)
    cnn_input = prepare_for_cnn(img_batch, cnn_preprocess_fn)
    feat = cnn_model.predict(cnn_input, verbose=0)
    score = detector.decision_function(feat)[0]
    # Allow reasonable margin to avoid rejecting valid abdominal scans
    return score >= (threshold - 1.5), score
