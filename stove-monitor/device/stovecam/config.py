"""Device agent configuration.

Loaded from environment variables, with an optional JSON credentials file
(written by `stovecam register`) carrying the device id and key.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CREDENTIALS = Path.home() / ".config" / "stovecam" / "credentials.json"


@dataclass
class Config:
    server_url: str = os.environ.get("STOVECAM_SERVER", "http://localhost:8000")
    interval_seconds: int = int(os.environ.get("STOVECAM_INTERVAL", "300"))
    capture_mode: str = os.environ.get("STOVECAM_CAPTURE", "picamera2")
    mjpeg_url: str | None = os.environ.get("STOVECAM_MJPEG_URL")
    capture_command: str | None = os.environ.get("STOVECAM_COMMAND")
    capture_dir: str | None = os.environ.get("STOVECAM_CAPTURE_DIR")
    credentials_path: Path = field(
        default_factory=lambda: Path(os.environ.get("STOVECAM_CREDENTIALS", DEFAULT_CREDENTIALS))
    )
    device_id: str | None = None
    device_key: str | None = None

    def __post_init__(self) -> None:
        self.device_id = os.environ.get("STOVECAM_DEVICE_ID")
        self.device_key = os.environ.get("STOVECAM_DEVICE_KEY")
        if not (self.device_id and self.device_key) and self.credentials_path.exists():
            creds = json.loads(self.credentials_path.read_text())
            self.device_id = self.device_id or creds.get("device_id")
            self.device_key = self.device_key or creds.get("device_key")

    def save_credentials(self, device_id: str, device_key: str) -> None:
        self.credentials_path.parent.mkdir(parents=True, exist_ok=True)
        self.credentials_path.write_text(
            json.dumps({"device_id": device_id, "device_key": device_key}, indent=2)
        )
        self.credentials_path.chmod(0o600)
        self.device_id, self.device_key = device_id, device_key
