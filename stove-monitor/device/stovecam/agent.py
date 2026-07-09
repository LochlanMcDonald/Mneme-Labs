"""Stove camera agent.

Commands:
  stovecam register --name "Kitchen stove"   pair with the backend, store creds
  stovecam baseline                          photograph the stove OFF and upload
  stovecam run                               snapshot loop (every 5 min by default)
  stovecam once                              single capture+classify, then exit
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import time

import requests

from .camera import CaptureError, build_capture
from .config import Config

log = logging.getLogger("stovecam")


class Client:
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()

    def _auth(self) -> dict:
        return {"Authorization": f"Bearer {self.config.device_key}"}

    def register(self, name: str) -> None:
        resp = self.session.post(
            f"{self.config.server_url}/api/devices", json={"name": name}, timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        self.config.save_credentials(data["device_id"], data["device_key"])
        log.info("registered as device %s; credentials saved to %s",
                 data["device_id"], self.config.credentials_path)

    def upload(self, endpoint: str, image: bytes) -> dict:
        resp = self.session.post(
            f"{self.config.server_url}/api/devices/{self.config.device_id}/{endpoint}",
            files={"image": ("frame.jpg", image, "image/jpeg")},
            headers=self._auth(),
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()


def require_credentials(config: Config) -> None:
    if not (config.device_id and config.device_key):
        sys.exit("Not registered. Run: stovecam register --name 'Kitchen stove'")


def cmd_register(config: Config, args) -> None:
    Client(config).register(args.name)


def cmd_baseline(config: Config, args) -> None:
    require_credentials(config)
    capture = build_capture(config)
    log.info("capturing baseline — make sure the stove and oven are OFF")
    image = capture()
    result = Client(config).upload("baseline", image)
    log.info("baseline stored, state reset to %s", result["state"])


def tick(client: Client, capture) -> dict | None:
    try:
        image = capture()
    except CaptureError:
        log.exception("capture failed")
        return None
    try:
        result = client.upload("snapshots", image)
    except requests.RequestException:
        log.exception("upload failed")
        return None
    log.info(
        "stove is %s (score %.4f / threshold %.4f)%s",
        result["state"].upper(),
        result["score"],
        result["threshold"],
        " — notification sent" if result.get("notified") else "",
    )
    return result


def cmd_once(config: Config, args) -> None:
    require_credentials(config)
    result = tick(Client(config), build_capture(config))
    if result is None:
        sys.exit(1)


def cmd_run(config: Config, args) -> None:
    require_credentials(config)
    client = Client(config)
    capture = build_capture(config)
    running = True

    def stop(signum, frame):
        nonlocal running
        running = False
        log.info("stopping")

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("watching stove every %ss (server: %s)", config.interval_seconds, config.server_url)
    while running:
        started = time.monotonic()
        tick(client, capture)
        elapsed = time.monotonic() - started
        delay = max(1.0, config.interval_seconds - elapsed)
        # sleep in short slices so SIGTERM lands quickly
        deadline = time.monotonic() + delay
        while running and time.monotonic() < deadline:
            time.sleep(min(1.0, deadline - time.monotonic()))


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="stovecam", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_register = sub.add_parser("register", help="pair this camera with the backend")
    p_register.add_argument("--name", default="Kitchen stove")
    p_register.set_defaults(func=cmd_register)

    sub.add_parser("baseline", help="capture + upload the stove-off baseline").set_defaults(func=cmd_baseline)
    sub.add_parser("run", help="run the monitoring loop").set_defaults(func=cmd_run)
    sub.add_parser("once", help="capture and classify a single frame").set_defaults(func=cmd_once)

    args = parser.parse_args(argv)
    config = Config()
    args.func(config, args)


if __name__ == "__main__":
    main()
