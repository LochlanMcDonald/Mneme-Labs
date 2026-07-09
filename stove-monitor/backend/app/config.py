"""Backend configuration, sourced from environment variables."""

from __future__ import annotations

import os
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        self.data_dir = Path(os.environ.get("STOVE_DATA_DIR", "./data")).resolve()
        self.db_path = Path(os.environ.get("STOVE_DB_PATH", str(self.data_dir / "stove.db")))
        self.images_dir = self.data_dir / "images"

        # Re-alert if the stove stays on this long after the first alert.
        # 0 disables re-alerts.
        self.realert_minutes = int(os.environ.get("STOVE_REALERT_MINUTES", "30"))

        # A scene that differs from all off-references but shows no glow (a
        # parked pot, a cutting board) is auto-learned as a new off-reference
        # after staying static for this many consecutive snapshots. 0 disables.
        self.autolearn_snapshots = int(os.environ.get("STOVE_AUTOLEARN_SNAPSHOTS", "3"))

        # APNs (token-based auth). If unset, notifications are logged instead.
        self.apns_key_path = os.environ.get("APNS_KEY_PATH")
        self.apns_key_id = os.environ.get("APNS_KEY_ID")
        self.apns_team_id = os.environ.get("APNS_TEAM_ID")
        self.apns_topic = os.environ.get("APNS_TOPIC")  # the iOS bundle id
        self.apns_use_sandbox = os.environ.get("APNS_SANDBOX", "1") != "0"

    @property
    def apns_configured(self) -> bool:
        return all([self.apns_key_path, self.apns_key_id, self.apns_team_id, self.apns_topic])

    def ensure_dirs(self) -> None:
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
