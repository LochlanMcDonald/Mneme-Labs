from app import vision
from conftest import make_stove_image


def _refs(*images):
    return [(f"ref{i}", vision.preprocess(img)) for i, img in enumerate(images)]


def test_same_scene_reads_off():
    baseline = make_stove_image(seed=1)
    frame = make_stove_image(seed=2)  # same scene, different noise
    result = vision.classify(vision.preprocess(frame), _refs(baseline))
    assert result.state == "off"
    assert result.matched_reference is not None


def test_lit_burner_reads_on():
    baseline = make_stove_image(seed=1)
    frame = make_stove_image(burner_on=True, seed=2)
    result = vision.classify(vision.preprocess(frame), _refs(baseline))
    assert result.state == "on"
    assert result.score > result.threshold


def test_pot_on_stove_reads_on():
    baseline = make_stove_image(seed=1)
    frame = make_stove_image(pot=True, seed=2)
    result = vision.classify(vision.preprocess(frame), _refs(baseline))
    assert result.state == "on"


def test_ambient_light_change_reads_off():
    """Global brightness shifts (kitchen light on/off) must not alarm."""
    baseline = make_stove_image(brightness=60, seed=1)
    frame = make_stove_image(brightness=110, seed=2)
    result = vision.classify(vision.preprocess(frame), _refs(baseline))
    assert result.state == "off"


def test_extra_off_reference_suppresses_false_alarm():
    """A scene that differs from the baseline but matches a learned
    off-reference (e.g. a kettle parked on the stove) reads off."""
    baseline = make_stove_image(seed=1)
    kettle_parked = make_stove_image(pot=True, seed=2)
    frame = make_stove_image(pot=True, seed=3)

    only_baseline = vision.classify(vision.preprocess(frame), _refs(baseline))
    assert only_baseline.state == "on"

    with_feedback = vision.classify(
        vision.preprocess(frame), _refs(baseline, kettle_parked)
    )
    assert with_feedback.state == "off"


def test_requires_reference():
    import pytest

    with pytest.raises(ValueError):
        vision.classify(vision.preprocess(make_stove_image()), [])
