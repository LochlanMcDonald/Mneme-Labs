"""StoveWatch backend.

Flow: the Pi camera device registers once, uploads a baseline photo of the
stove in its OFF state, then posts a snapshot every few minutes. Each snapshot
is compared with every known-off image; a frame that matches none of them
flips the device to ON and pushes a notification to the paired iPhone(s).
The app can snooze alerts and dispute a wrong reading, which feeds back into
the reference set.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import db, vision
from .apns import build_notifier
from .config import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("stove")

app = FastAPI(title="StoveWatch", version="1.0.0")
notifier = build_notifier()

MIN_THRESHOLD = 0.01
FEEDBACK_TIGHTEN_FACTOR = 0.8  # applied when the user says a reading of OFF was wrong

# Two consecutive frames closer than this are considered a static scene
# (used to decide when a "changed" scene is safe to auto-learn as off).
STATIC_FRACTION = 0.01


@app.on_event("startup")
def startup() -> None:
    db.init_db()


# --- auth -------------------------------------------------------------------

def authed_device(device_id: str, authorization: str = Header(default="")) -> dict:
    device = db.get_device(device_id)
    if device is None:
        raise HTTPException(404, "unknown device")
    expected = f"Bearer {device['device_key']}"
    if authorization != expected:
        raise HTTPException(401, "bad device key")
    return dict(device)


# --- schemas ------------------------------------------------------------------

class DeviceCreate(BaseModel):
    name: str = Field(default="Kitchen stove", max_length=100)
    threshold: float = Field(default=vision.DEFAULT_CHANGED_FRACTION, gt=0, lt=1)


class SnoozeRequest(BaseModel):
    minutes: int = Field(gt=0, le=24 * 60)


class FeedbackRequest(BaseModel):
    # The state the server currently reports that the user says is wrong.
    disputed_state: str = Field(pattern="^(on|off)$")


class PushTokenRequest(BaseModel):
    token: str = Field(min_length=8, max_length=200)
    platform: str = "ios"


class OvenModelCreate(BaseModel):
    brand: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)


class OvenModelAssign(BaseModel):
    oven_model_id: str


# --- helpers ------------------------------------------------------------------

def _save_image(image: bytes, name: str) -> str:
    settings.ensure_dirs()
    path = settings.images_dir / name
    path.write_bytes(image)
    return str(path)


def _load_off_references(device_id: str) -> list[tuple[str, "vision.np.ndarray"]]:
    refs = []
    for row in db.off_references_for_device(device_id):
        try:
            refs.append((f"{row['label']}:{row['id'][:8]}", vision.preprocess(open(row["path"], "rb").read())))
        except (OSError, ValueError):
            log.warning("skipping unreadable reference %s", row["path"])
    return refs


def _iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _status_payload(device: dict) -> dict:
    snap = db.latest_snapshot(device["id"])
    return {
        "device_id": device["id"],
        "name": device["name"],
        "state": device["state"],
        "state_changed_at": _iso(device["state_changed_at"]),
        "last_seen_at": _iso(device["last_seen_at"]),
        "snoozed": bool(device["snooze_until"] and device["snooze_until"] > db.now()),
        "snooze_until": _iso(device["snooze_until"]) if device["snooze_until"] and device["snooze_until"] > db.now() else None,
        "threshold": device["threshold"],
        "oven_model_id": device["oven_model_id"],
        "last_snapshot": {
            "id": snap["id"],
            "state": snap["state"],
            "score": snap["score"],
            "created_at": _iso(snap["created_at"]),
        } if snap else None,
    }


def _notify(device: dict, title: str, body: str) -> None:
    for token in db.push_tokens_for_device(device["id"]):
        notifier.send(token, title, body, payload={"device_id": device["id"]})


# --- device lifecycle -----------------------------------------------------------

@app.post("/api/devices", status_code=201)
def create_device(req: DeviceCreate):
    device = db.create_device(req.name, req.threshold)
    return {"device_id": device["id"], "device_key": device["device_key"], "name": device["name"]}


@app.post("/api/devices/{device_id}/baseline")
def upload_baseline(device_id: str, image: UploadFile = File(...), device: dict = Depends(authed_device)):
    data = image.file.read()
    try:
        vision.preprocess(data)  # validate it decodes
    except Exception:
        raise HTTPException(400, "could not decode image")
    path = _save_image(data, f"{device_id}-baseline.jpg")
    db.clear_baseline(device_id)
    db.add_off_reference(path, label="baseline", device_id=device_id)
    db.update_device(device_id, state="off", state_changed_at=db.now(), last_seen_at=db.now())
    return {"ok": True, "state": "off"}


@app.post("/api/devices/{device_id}/snapshots")
def ingest_snapshot(device_id: str, image: UploadFile = File(...), device: dict = Depends(authed_device)):
    data = image.file.read()
    try:
        frame = vision.preprocess(data)
    except Exception:
        raise HTTPException(400, "could not decode image")

    refs = _load_off_references(device_id)
    if not refs:
        raise HTTPException(409, "no baseline set — run setup first")

    result = vision.classify(frame, refs, threshold=device["threshold"])

    # Is the scene static? Compare against the previous frame before we
    # overwrite it — a parked pot is still; steam and flames flicker.
    latest_path = settings.images_dir / f"{device_id}-latest.jpg"
    static = False
    if latest_path.exists():
        try:
            previous_frame = vision.preprocess(latest_path.read_bytes())
            static = vision.changed_fraction(frame, previous_frame) <= STATIC_FRACTION
        except (OSError, ValueError):
            pass

    path = _save_image(data, f"{device_id}-latest.jpg")
    snap = db.add_snapshot(device_id, path, result.state, result.score)

    # A changed-but-not-glowing scene that holds still for several checks is
    # a new "normal" (pot parked on the stove): learn it and treat it as off.
    auto_learned = False
    final_state = result.state
    if result.state == "changed":
        streak = (device["changed_streak"] + 1) if static else 1
        if settings.autolearn_snapshots and streak >= settings.autolearn_snapshots:
            import shutil
            ref_path = settings.images_dir / f"{device_id}-auto-{snap['id']}.jpg"
            shutil.copyfile(path, ref_path)
            db.add_off_reference(str(ref_path), label="auto", device_id=device_id)
            log.info("device %s: learned static changed scene as off-reference", device_id)
            auto_learned = True
            final_state = "off"
            streak = 0
    else:
        streak = 0

    previous_state = device["state"]
    updates = {"last_seen_at": db.now(), "state": final_state, "changed_streak": streak}
    if final_state != previous_state:
        updates["state_changed_at"] = db.now()
    db.update_device(device_id, **updates)
    device.update(updates)

    snoozed = bool(device["snooze_until"] and device["snooze_until"] > db.now())
    notified = False
    if final_state == "on" and not snoozed:
        turned_on = previous_state != "on"
        first_alert = device["last_alert_at"]
        long_running = (
            not turned_on
            and settings.realert_minutes > 0
            and first_alert is not None
            and db.now() - first_alert >= settings.realert_minutes * 60
        )
        if turned_on:
            _notify(device, "Stove is on", f"{device['name']} looks like it's in use.")
            db.update_device(device_id, last_alert_at=db.now())
            notified = True
        elif long_running:
            minutes = int((db.now() - device["state_changed_at"]) / 60)
            _notify(device, "Stove still on", f"{device['name']} has been on for about {minutes} minutes.")
            db.update_device(device_id, last_alert_at=db.now())
            notified = True

    return {
        "state": final_state,
        "score": round(result.score, 4),
        "glow": round(result.glow, 4),
        "threshold": device["threshold"],
        "matched_reference": result.matched_reference,
        "notified": notified,
        "auto_learned": auto_learned,
        "snapshot_id": snap["id"],
    }


# --- app-facing endpoints ---------------------------------------------------------

@app.get("/api/devices/{device_id}/status")
def get_status(device_id: str, device: dict = Depends(authed_device)):
    return _status_payload(device)


@app.get("/api/devices/{device_id}/snapshots/latest.jpg")
def latest_snapshot_image(device_id: str, device: dict = Depends(authed_device)):
    snap = db.latest_snapshot(device_id)
    if snap is None:
        raise HTTPException(404, "no snapshots yet")
    return FileResponse(snap["path"], media_type="image/jpeg")


@app.post("/api/devices/{device_id}/snooze")
def snooze(device_id: str, req: SnoozeRequest, device: dict = Depends(authed_device)):
    until = db.now() + req.minutes * 60
    db.update_device(device_id, snooze_until=until)
    return {"ok": True, "snooze_until": _iso(until)}


@app.delete("/api/devices/{device_id}/snooze")
def clear_snooze(device_id: str, device: dict = Depends(authed_device)):
    db.update_device(device_id, snooze_until=None)
    return {"ok": True}


@app.post("/api/devices/{device_id}/feedback")
def feedback(device_id: str, req: FeedbackRequest, device: dict = Depends(authed_device)):
    """The "you're incorrect" button.

    Disputing ON: the latest frame actually shows the stove off, so it becomes
    a new off-reference (the detector stops alarming on that scene) and the
    state flips to off.

    Disputing OFF: the detector missed real activity, so the device's change
    threshold tightens, and the state flips to on.
    """
    snap = db.latest_snapshot(device_id)
    db.add_feedback(device_id, req.disputed_state, snap["id"] if snap else None)

    if req.disputed_state == "on":
        if snap is not None:
            import shutil
            ref_path = settings.images_dir / f"{device_id}-feedback-{snap['id']}.jpg"
            shutil.copyfile(snap["path"], ref_path)
            db.add_off_reference(str(ref_path), label="feedback", device_id=device_id)
        db.update_device(device_id, state="off", state_changed_at=db.now(), last_alert_at=None)
        return {"ok": True, "state": "off", "learned": snap is not None}

    new_threshold = max(MIN_THRESHOLD, device["threshold"] * FEEDBACK_TIGHTEN_FACTOR)
    db.update_device(device_id, state="on", state_changed_at=db.now(), threshold=new_threshold)
    return {"ok": True, "state": "on", "threshold": new_threshold}


@app.post("/api/devices/{device_id}/push-token")
def add_push_token(device_id: str, req: PushTokenRequest, device: dict = Depends(authed_device)):
    db.register_push_token(device_id, req.token, req.platform)
    return {"ok": True}


# --- oven models -------------------------------------------------------------------

@app.post("/api/oven-models", status_code=201)
def create_oven_model(req: OvenModelCreate):
    row = db.create_oven_model(req.brand.strip(), req.model.strip())
    return {"id": row["id"], "brand": row["brand"], "model": row["model"]}


@app.get("/api/oven-models")
def list_oven_models(query: str = ""):
    return [
        {"id": r["id"], "brand": r["brand"], "model": r["model"]}
        for r in db.search_oven_models(query)
    ]


@app.post("/api/oven-models/{model_id}/references")
def add_model_reference(model_id: str, image: UploadFile = File(...), label: str = Form("model")):
    if db.get_oven_model(model_id) is None:
        raise HTTPException(404, "unknown oven model")
    data = image.file.read()
    try:
        vision.preprocess(data)
    except Exception:
        raise HTTPException(400, "could not decode image")
    path = _save_image(data, f"model-{model_id}-{db.new_id()[:8]}.jpg")
    ref_id = db.add_off_reference(path, label="model", oven_model_id=model_id)
    return {"ok": True, "reference_id": ref_id}


@app.post("/api/devices/{device_id}/oven-model")
def assign_oven_model(device_id: str, req: OvenModelAssign, device: dict = Depends(authed_device)):
    if db.get_oven_model(req.oven_model_id) is None:
        raise HTTPException(404, "unknown oven model")
    db.update_device(device_id, oven_model_id=req.oven_model_id)
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"ok": True, "apns": settings.apns_configured}
