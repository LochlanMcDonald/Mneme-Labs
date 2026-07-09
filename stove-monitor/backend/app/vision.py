"""Image comparison for stove state detection.

The detector never tries to understand what a stove looks like. It answers a
simpler question: "does the current frame look like any known picture of this
stove while OFF?" The baseline captured during setup is the first known-off
image; every "you're incorrect" report and every oven-model reference photo
adds more. A frame that matches none of them is treated as the stove being in
use.

All comparison happens on small, blurred, grayscale, brightness-normalized
versions of the frames so that JPEG noise, slight camera shake, and gradual
lighting drift don't trip the detector.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageFilter, ImageOps

# Frames are compared at this size. Small enough to be fast and to wash out
# sensor noise, large enough that a lit burner or a pot still covers many
# pixels.
COMPARE_SIZE = (96, 72)
BLUR_RADIUS = 2.0

# A pixel counts as "changed" when it differs by more than this (0..1 scale).
PIXEL_DELTA = 0.12

# Default fraction of changed pixels above which a frame no longer matches an
# off-reference. Tuned down by user feedback when the detector misses real use.
DEFAULT_CHANGED_FRACTION = 0.02


def preprocess(image_bytes: bytes) -> np.ndarray:
    """Decode to a small normalized grayscale array in [0, 1]."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    img = img.convert("L").resize(COMPARE_SIZE, Image.BILINEAR)
    img = img.filter(ImageFilter.GaussianBlur(BLUR_RADIUS))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    # Normalize global brightness so a room light turning on doesn't read as
    # stove activity; local changes (a flame, a pot) survive normalization.
    arr = arr - float(arr.mean())
    return arr


def changed_fraction(a: np.ndarray, b: np.ndarray) -> float:
    """Fraction of pixels that meaningfully differ between two frames."""
    delta = np.abs(a - b)
    return float((delta > PIXEL_DELTA).mean())


@dataclass
class Classification:
    state: str  # "on" | "off"
    score: float  # changed fraction vs. the best-matching off reference
    threshold: float
    matched_reference: str | None = None  # label of the off ref that matched
    details: dict = field(default_factory=dict)


def classify(
    snapshot: np.ndarray,
    off_references: list[tuple[str, np.ndarray]],
    threshold: float = DEFAULT_CHANGED_FRACTION,
) -> Classification:
    """Compare a frame against every known-off image.

    off_references is a list of (label, preprocessed array). The frame is OFF
    if it matches at least one reference within the threshold; otherwise ON.
    """
    if not off_references:
        raise ValueError("classify() needs at least one off-reference (the baseline)")

    scores = {label: changed_fraction(snapshot, ref) for label, ref in off_references}
    best_label = min(scores, key=scores.get)
    best_score = scores[best_label]

    if best_score <= threshold:
        return Classification(
            state="off",
            score=best_score,
            threshold=threshold,
            matched_reference=best_label,
            details={"scores": scores},
        )
    return Classification(
        state="on",
        score=best_score,
        threshold=threshold,
        matched_reference=None,
        details={"scores": scores},
    )
