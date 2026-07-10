"""Image comparison for stove state detection.

The detector never tries to understand what a stove looks like. It answers two
simpler questions:

1. "Does the current frame look like any known picture of this stove while
   OFF?" The baseline captured during setup is the first known-off image;
   every "you're incorrect" report and every oven-model reference photo adds
   more. A matching frame is OFF.

2. For frames that match nothing: "is there glow?" Actual stove use shows up
   as a localized brightness jump with warm flame/burner color. Glow means
   ON. No glow — a cold pot parked on a burner, a cutting board left on the
   cooktop — is merely CHANGED: worth tracking, not worth an alarm.

All comparison happens on small, blurred, brightness-normalized versions of
the frames so that JPEG noise, slight camera shake, and gradual lighting
drift don't trip the detector.
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

# Glow detection: a pixel is "glowing" when it's this much brighter than the
# same pixel in the best-matching off reference (on the normalized scale) AND
# warm-colored (red channel exceeds blue). Flames, glowing coils, and heating
# elements pass both; pots, pans, and daylight shifts don't.
GLOW_LUM_DELTA = 0.18
GLOW_WARM_MIN = 0.10
GLOW_MIN_FRACTION = 0.003


@dataclass
class Frame:
    """A preprocessed camera frame."""

    gray: np.ndarray  # brightness-normalized luminance, [-1, 1]-ish
    warm: np.ndarray  # red minus blue channel, [-1, 1]


def preprocess(image_bytes: bytes) -> Frame:
    """Decode to small normalized luminance + warmth arrays."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB").resize(COMPARE_SIZE, Image.BILINEAR)
    img = img.filter(ImageFilter.GaussianBlur(BLUR_RADIUS))
    rgb = np.asarray(img, dtype=np.float32) / 255.0
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    # Normalize global brightness so a room light turning on doesn't read as
    # stove activity; local changes (a flame, a pot) survive normalization.
    gray = lum - float(lum.mean())
    warm = rgb[..., 0] - rgb[..., 2]
    return Frame(gray=gray, warm=warm)


def changed_fraction(a: Frame, b: Frame) -> float:
    """Fraction of pixels that meaningfully differ between two frames."""
    delta = np.abs(a.gray - b.gray)
    return float((delta > PIXEL_DELTA).mean())


def glow_fraction(snapshot: Frame, reference: Frame) -> float:
    """Fraction of pixels that got much brighter than the reference AND are
    warm-colored — the visual signature of a flame or glowing burner."""
    glowing = (snapshot.gray - reference.gray > GLOW_LUM_DELTA) & (
        snapshot.warm > GLOW_WARM_MIN
    )
    return float(glowing.mean())


@dataclass
class Classification:
    state: str  # "on" | "off" | "changed"
    score: float  # changed fraction vs. the best-matching off reference
    threshold: float
    glow: float = 0.0  # glowing-pixel fraction vs. the best-matching off ref
    matched_reference: str | None = None  # label of the off ref that matched
    details: dict = field(default_factory=dict)


def classify(
    snapshot: Frame,
    off_references: list[tuple[str, Frame]],
    threshold: float = DEFAULT_CHANGED_FRACTION,
) -> Classification:
    """Compare a frame against every known-off image.

    off_references is a list of (label, preprocessed Frame).
    - Matches a reference within the threshold → OFF.
    - Matches nothing and shows glow → ON.
    - Matches nothing, no glow (e.g. a cold pot parked on a burner) → CHANGED.
    """
    if not off_references:
        raise ValueError("classify() needs at least one off-reference (the baseline)")

    scores = {label: changed_fraction(snapshot, ref) for label, ref in off_references}
    best_label = min(scores, key=scores.get)
    best_score = scores[best_label]
    best_ref = next(ref for label, ref in off_references if label == best_label)

    if best_score <= threshold:
        return Classification(
            state="off",
            score=best_score,
            threshold=threshold,
            matched_reference=best_label,
            details={"scores": scores},
        )

    glow = glow_fraction(snapshot, best_ref)
    return Classification(
        state="on" if glow >= GLOW_MIN_FRACTION else "changed",
        score=best_score,
        threshold=threshold,
        glow=glow,
        matched_reference=None,
        details={"scores": scores},
    )
