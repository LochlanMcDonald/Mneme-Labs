"""SQLite storage layer.

Plain sqlite3 keeps the dependency footprint small; every function opens a
short-lived connection so the layer is safe under FastAPI's threadpool.
"""

from __future__ import annotations

import sqlite3
import time
import uuid
from pathlib import Path

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    device_key TEXT NOT NULL,
    name TEXT NOT NULL,
    oven_model_id TEXT,
    state TEXT NOT NULL DEFAULT 'unknown',        -- unknown | off | on
    threshold REAL NOT NULL,
    snooze_until REAL,                            -- unix ts; NULL = not snoozed
    state_changed_at REAL,
    last_seen_at REAL,
    last_alert_at REAL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    path TEXT NOT NULL,
    state TEXT NOT NULL,
    score REAL NOT NULL,
    created_at REAL NOT NULL
);

-- Known-off reference images: the setup baseline, frames the user flagged as
-- false alarms, and per-oven-model reference photos.
CREATE TABLE IF NOT EXISTS off_references (
    id TEXT PRIMARY KEY,
    device_id TEXT REFERENCES devices(id),        -- NULL for oven-model refs
    oven_model_id TEXT REFERENCES oven_models(id),
    label TEXT NOT NULL,                          -- baseline | feedback | model
    path TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS oven_models (
    id TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at REAL NOT NULL,
    UNIQUE(brand, model)
);

CREATE TABLE IF NOT EXISTS push_tokens (
    token TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    platform TEXT NOT NULL DEFAULT 'ios',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    disputed_state TEXT NOT NULL,                 -- the state the user says is wrong
    snapshot_id TEXT,
    created_at REAL NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    settings.ensure_dirs()
    with connect() as conn:
        conn.executescript(SCHEMA)


def new_id() -> str:
    return uuid.uuid4().hex


def now() -> float:
    return time.time()


# --- devices ---------------------------------------------------------------

def create_device(name: str, threshold: float) -> dict:
    device = {
        "id": new_id(),
        "device_key": uuid.uuid4().hex + uuid.uuid4().hex,
        "name": name,
        "threshold": threshold,
        "created_at": now(),
    }
    with connect() as conn:
        conn.execute(
            "INSERT INTO devices (id, device_key, name, threshold, created_at)"
            " VALUES (:id, :device_key, :name, :threshold, :created_at)",
            device,
        )
    return device


def get_device(device_id: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()


def update_device(device_id: str, **fields) -> None:
    keys = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = device_id
    with connect() as conn:
        conn.execute(f"UPDATE devices SET {keys} WHERE id = :id", fields)


# --- snapshots ---------------------------------------------------------------

def add_snapshot(device_id: str, path: str, state: str, score: float) -> dict:
    snap = {
        "id": new_id(),
        "device_id": device_id,
        "path": path,
        "state": state,
        "score": score,
        "created_at": now(),
    }
    with connect() as conn:
        conn.execute(
            "INSERT INTO snapshots (id, device_id, path, state, score, created_at)"
            " VALUES (:id, :device_id, :path, :state, :score, :created_at)",
            snap,
        )
    return snap


def latest_snapshot(device_id: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM snapshots WHERE device_id = ? ORDER BY created_at DESC LIMIT 1",
            (device_id,),
        ).fetchone()


# --- off references ----------------------------------------------------------

def add_off_reference(
    path: str,
    label: str,
    device_id: str | None = None,
    oven_model_id: str | None = None,
) -> str:
    ref_id = new_id()
    with connect() as conn:
        conn.execute(
            "INSERT INTO off_references (id, device_id, oven_model_id, label, path, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (ref_id, device_id, oven_model_id, label, path, now()),
        )
    return ref_id


def clear_baseline(device_id: str) -> None:
    with connect() as conn:
        conn.execute(
            "DELETE FROM off_references WHERE device_id = ? AND label = 'baseline'",
            (device_id,),
        )


def off_references_for_device(device_id: str) -> list[sqlite3.Row]:
    """Device-specific refs plus any refs attached to the device's oven model."""
    with connect() as conn:
        return conn.execute(
            """
            SELECT r.* FROM off_references r
            WHERE r.device_id = ?
               OR r.oven_model_id = (SELECT oven_model_id FROM devices WHERE id = ?)
            ORDER BY r.created_at
            """,
            (device_id, device_id),
        ).fetchall()


# --- oven models -------------------------------------------------------------

def create_oven_model(brand: str, model: str) -> sqlite3.Row:
    with connect() as conn:
        existing = conn.execute(
            "SELECT * FROM oven_models WHERE brand = ? AND model = ?", (brand, model)
        ).fetchone()
        if existing:
            return existing
        model_id = new_id()
        conn.execute(
            "INSERT INTO oven_models (id, brand, model, created_at) VALUES (?, ?, ?, ?)",
            (model_id, brand, model, now()),
        )
        return conn.execute("SELECT * FROM oven_models WHERE id = ?", (model_id,)).fetchone()


def search_oven_models(query: str) -> list[sqlite3.Row]:
    like = f"%{query}%"
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM oven_models WHERE brand LIKE ? OR model LIKE ? ORDER BY brand, model",
            (like, like),
        ).fetchall()


def get_oven_model(model_id: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM oven_models WHERE id = ?", (model_id,)).fetchone()


# --- push tokens & feedback ---------------------------------------------------

def register_push_token(device_id: str, token: str, platform: str = "ios") -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO push_tokens (token, device_id, platform, created_at) VALUES (?, ?, ?, ?)"
            " ON CONFLICT(token) DO UPDATE SET device_id = excluded.device_id",
            (token, device_id, platform, now()),
        )


def push_tokens_for_device(device_id: str) -> list[str]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT token FROM push_tokens WHERE device_id = ?", (device_id,)
        ).fetchall()
    return [r["token"] for r in rows]


def add_feedback(device_id: str, disputed_state: str, snapshot_id: str | None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO feedback (id, device_id, disputed_state, snapshot_id, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (new_id(), device_id, disputed_state, snapshot_id, now()),
        )
