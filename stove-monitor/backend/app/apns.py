"""Push notification delivery.

When APNs credentials are configured (APNS_KEY_PATH / APNS_KEY_ID /
APNS_TEAM_ID / APNS_TOPIC), notifications go to Apple over HTTP/2 with
token-based (p8 key) auth. Otherwise they're logged, which keeps local
development and tests free of Apple credentials.
"""

from __future__ import annotations

import logging
import time

from .config import settings

log = logging.getLogger("stove.apns")

APNS_HOST_SANDBOX = "https://api.sandbox.push.apple.com"
APNS_HOST_PROD = "https://api.push.apple.com"


class ConsoleNotifier:
    """Dev/test notifier: records and logs instead of calling Apple."""

    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, token: str, title: str, body: str, payload: dict | None = None) -> bool:
        entry = {"token": token, "title": title, "body": body, "payload": payload or {}}
        self.sent.append(entry)
        log.info("push (console) -> %s: %s — %s", token[:8], title, body)
        return True


class APNsNotifier:
    """Token-auth APNs client. JWTs are cached and refreshed under Apple's
    20–60 minute validity window."""

    def __init__(self) -> None:
        self._jwt: str | None = None
        self._jwt_issued_at = 0.0
        with open(settings.apns_key_path) as f:
            self._key = f.read()

    def _auth_token(self) -> str:
        import jwt  # PyJWT

        if self._jwt is None or time.time() - self._jwt_issued_at > 45 * 60:
            self._jwt = jwt.encode(
                {"iss": settings.apns_team_id, "iat": int(time.time())},
                self._key,
                algorithm="ES256",
                headers={"kid": settings.apns_key_id},
            )
            self._jwt_issued_at = time.time()
        return self._jwt

    def send(self, token: str, title: str, body: str, payload: dict | None = None) -> bool:
        import httpx

        host = APNS_HOST_SANDBOX if settings.apns_use_sandbox else APNS_HOST_PROD
        message = {
            "aps": {
                "alert": {"title": title, "body": body},
                "sound": "default",
                "interruption-level": "time-sensitive",
            },
            **(payload or {}),
        }
        try:
            with httpx.Client(http2=True, timeout=10) as client:
                resp = client.post(
                    f"{host}/3/device/{token}",
                    json=message,
                    headers={
                        "authorization": f"bearer {self._auth_token()}",
                        "apns-topic": settings.apns_topic,
                        "apns-push-type": "alert",
                        "apns-priority": "10",
                    },
                )
            if resp.status_code != 200:
                log.warning("APNs rejected push for %s…: %s %s", token[:8], resp.status_code, resp.text)
            return resp.status_code == 200
        except Exception:
            log.exception("APNs push failed for %s…", token[:8])
            return False


def build_notifier():
    if settings.apns_configured:
        return APNsNotifier()
    return ConsoleNotifier()
