"""Capture backends for the stove camera.

Pick with STOVECAM_CAPTURE:
  picamera2 — Raspberry Pi camera module via the picamera2 library (default
              on a Pi)
  mjpeg     — grab a single frame from an MJPEG stream URL (works with the
              existing Pi stream, e.g. https://crawler.mnemelabs.com/mjpg)
  command   — run a stills command like libcamera-still and read the file
  file      — read the newest image from a directory (testing/simulation)
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


class CaptureError(RuntimeError):
    pass


def capture_picamera2() -> bytes:
    from picamera2 import Picamera2  # only importable on a Pi

    import io
    import time

    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": (1280, 960)}))
    cam.start()
    try:
        time.sleep(1.5)  # let auto-exposure settle
        buf = io.BytesIO()
        cam.capture_file(buf, format="jpeg")
        return buf.getvalue()
    finally:
        cam.stop()
        cam.close()


def capture_mjpeg(url: str, timeout: float = 15.0) -> bytes:
    """Read one JPEG frame out of a multipart MJPEG stream."""
    import requests

    with requests.get(url, stream=True, timeout=timeout) as resp:
        resp.raise_for_status()
        buffer = b""
        for chunk in resp.iter_content(chunk_size=4096):
            buffer += chunk
            start = buffer.find(b"\xff\xd8")  # JPEG SOI
            end = buffer.find(b"\xff\xd9", start + 2)  # JPEG EOI
            if start != -1 and end != -1:
                return buffer[start : end + 2]
            if len(buffer) > 8 * 1024 * 1024:
                break
    raise CaptureError(f"no JPEG frame found in stream {url}")


def capture_command(command: str) -> bytes:
    """Run a stills command; {output} in the command is replaced with a temp
    file path, e.g. 'libcamera-still -n -o {output}'."""
    with tempfile.NamedTemporaryFile(suffix=".jpg") as tmp:
        cmd = command.format(output=tmp.name)
        result = subprocess.run(cmd, shell=True, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise CaptureError(f"capture command failed: {result.stderr.decode(errors='replace')}")
        data = Path(tmp.name).read_bytes()
    if not data:
        raise CaptureError("capture command produced an empty file")
    return data


def capture_file(directory: str) -> bytes:
    """Newest jpg/png in a directory — used by tests and simulations."""
    candidates = sorted(
        (p for p in Path(directory).iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}),
        key=lambda p: p.stat().st_mtime,
    )
    if not candidates:
        raise CaptureError(f"no images in {directory}")
    return candidates[-1].read_bytes()


def build_capture(config) -> "callable":
    mode = config.capture_mode
    if mode == "picamera2":
        return capture_picamera2
    if mode == "mjpeg":
        if not config.mjpeg_url:
            raise CaptureError("STOVECAM_MJPEG_URL required for mjpeg capture")
        return lambda: capture_mjpeg(config.mjpeg_url)
    if mode == "command":
        if not config.capture_command:
            raise CaptureError("STOVECAM_COMMAND required for command capture")
        return lambda: capture_command(config.capture_command)
    if mode == "file":
        if not config.capture_dir:
            raise CaptureError("STOVECAM_CAPTURE_DIR required for file capture")
        return lambda: capture_file(config.capture_dir)
    raise CaptureError(f"unknown capture mode: {mode}")
