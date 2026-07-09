import io
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def make_stove_image(
    burner_on: bool = False,
    pot: bool = False,
    brightness: int = 60,
    seed: int = 0,
) -> bytes:
    """Synthetic top-down stove photo: dark cooktop with four burner rings.
    burner_on paints one burner glowing red-orange; pot draws a big gray
    circle over a burner; brightness shifts ambient light."""
    import random

    rng = random.Random(seed)
    img = Image.new("RGB", (640, 480), (brightness, brightness, brightness + 5))
    d = ImageDraw.Draw(img)
    burners = [(160, 120), (480, 120), (160, 360), (480, 360)]
    for cx, cy in burners:
        d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], outline=(20, 20, 20), width=8)
        d.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], outline=(30, 30, 30), width=5)
    # mild sensor noise so identical scenes aren't pixel-identical
    for _ in range(300):
        x, y = rng.randrange(640), rng.randrange(480)
        v = brightness + rng.randrange(-12, 12)
        d.point((x, y), (v, v, v))
    if burner_on:
        cx, cy = burners[0]
        d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=(255, 90, 20))
        d.ellipse([cx - 35, cy - 35, cx + 35, cy + 35], fill=(255, 180, 60))
    if pot:
        cx, cy = burners[1]
        d.ellipse([cx - 85, cy - 85, cx + 85, cy + 85], fill=(140, 140, 150))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """TestClient wired to a temp data dir and the console notifier."""
    from app.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "db_path", tmp_path / "stove.db")
    monkeypatch.setattr(settings, "images_dir", tmp_path / "images")

    from fastapi.testclient import TestClient

    from app import db, main
    from app.apns import ConsoleNotifier

    db.init_db()
    notifier = ConsoleNotifier()
    monkeypatch.setattr(main, "notifier", notifier)

    with TestClient(main.app) as c:
        c.notifier = notifier
        yield c


@pytest.fixture()
def device(client):
    resp = client.post("/api/devices", json={"name": "Test stove"})
    assert resp.status_code == 201
    data = resp.json()
    data["headers"] = {"Authorization": f"Bearer {data['device_key']}"}
    return data


def upload(client, device, path, image_bytes, field="image"):
    return client.post(
        path.format(id=device["device_id"]),
        files={field: ("frame.jpg", image_bytes, "image/jpeg")},
        headers=device["headers"],
    )
