# StoveWatch

A clip-on stove monitor. A small camera (Raspberry Pi + camera module) watches
your cooktop, and your iPhone gets a push notification whenever the stove or
oven looks like it's in use — and again if it's been left on.

```
┌────────────────┐  snapshot every 5 min   ┌──────────────────┐   APNs push   ┌───────────┐
│  Pi camera     │ ──────────────────────▶ │  FastAPI backend │ ────────────▶ │  iOS app  │
│  (device/)     │                         │  (backend/)      │               │  (ios/)   │
└────────────────┘                         └──────────────────┘               └───────────┘
```

## How detection works

During setup the camera photographs the stove **in its OFF state** — that
baseline is the first *known-off reference*. Every few minutes the camera
posts a new snapshot; the backend compares it (small, blurred,
brightness-normalized frames) against every known-off image and lands on one
of three states:

- **off** — the frame matches a known-off reference.
- **on** — the frame matches nothing *and* shows the ON signal for your
  stove type (set in the app's settings):
  - **gas / electric**: **glow** — a localized brightness jump with warm
    flame/burner color.
  - **induction** (which never glows): **motion** — the changed scene is
    itself moving between checks (steam, stirring, a shifted pot).
- **changed** — the frame matches nothing but shows no ON signal. A cold pot
  parked on a burner or a cutting board left on the cooktop lands here: the
  app shows it, but it never triggers a notification. If a changed scene
  holds perfectly still for 3 consecutive checks (`STOVE_AUTOLEARN_SNAPSHOTS`,
  0 to disable; induction waits twice as long since a heating pot can look
  still), it's automatically learned as a new off-reference — the parked pot
  becomes part of "normal".

The reference set grows over time:

- **Baseline** — captured during setup with `stovecam baseline`.
- **"You're incorrect" feedback** — when the app says ON but the stove is
  off, tapping the button turns that frame into a new off-reference, so the
  same scene never alarms again. Disputing an OFF reading tightens the
  detection threshold instead.
- **Oven model photos** — enter your oven's brand/model in the app and upload
  extra photos of it while off; they're shared as references across every
  camera watching that model.

Global brightness changes (kitchen light on/off, daylight) are normalized
away, so only local changes on the cooktop trigger alerts.

## Components

| Directory  | What it is | Runs on |
|------------|------------|---------|
| `backend/` | FastAPI server: image comparison, state machine, snooze, feedback, oven models, APNs push | Any host (Docker/VPS/the same Pi) |
| `device/`  | `stovecam` capture agent: snapshots every 5 min via picamera2, an MJPEG stream, or a stills command | Raspberry Pi (Zero 2 W is plenty) |
| `ios/`     | SwiftUI app: live status, latest snapshot, snooze (30m/1h/2h presets or any custom duration up to 24h), "you're incorrect", stove type (gas/electric/induction), oven model setup | iPhone, iOS 17+ |

## Quick start

### 1. Backend

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Push notifications print to the server log until APNs is configured. To send
real pushes, create an APNs auth key (.p8) in your Apple developer account
and set:

```bash
export APNS_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
export APNS_KEY_ID=XXXXXXXXXX
export APNS_TEAM_ID=YYYYYYYYYY
export APNS_TOPIC=com.mnemelabs.stovewatch   # the app's bundle id
export APNS_SANDBOX=1                        # 0 for production builds
```

Run the tests with `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest`.

### 2. Camera device (Raspberry Pi)

Clip the Pi + camera somewhere with a clear view of the cooktop (e.g. under
the range hood), then:

```bash
sudo apt install -y python3-picamera2 python3-requests
cd device
export STOVECAM_SERVER=https://your-backend.example.com

python3 -m stovecam.agent register --name "Kitchen stove"
# With the stove and oven OFF:
python3 -m stovecam.agent baseline
# Start watching (every 5 minutes):
python3 -m stovecam.agent run
```

Install `stovecam.service` into `/etc/systemd/system/` to run it on boot.
Useful settings:

- `STOVECAM_INTERVAL=300` — seconds between snapshots
- `STOVECAM_CAPTURE=picamera2 | mjpeg | command | file`
- `STOVECAM_MJPEG_URL=…` — reuse an existing MJPEG stream instead of
  attaching a new camera
- `STOVECAM_COMMAND='libcamera-still -n -o {output}'` — any stills CLI

### 3. iOS app

```bash
brew install xcodegen
cd ios/StoveWatch
xcodegen generate
open StoveWatch.xcodeproj
```

Set your Apple development team, build to your iPhone, then pair by entering
the server URL and the device id/key from `~/.config/stovecam/credentials.json`
on the Pi. Grant notification permission when prompted.

## API sketch

- `POST /api/devices` — register a camera → `{device_id, device_key}`
- `POST /api/devices/{id}/baseline` — upload the off-state photo
- `POST /api/devices/{id}/snapshots` — periodic frame → `{state, score, notified}`
- `GET  /api/devices/{id}/status` — state, snooze, last snapshot metadata
- `GET  /api/devices/{id}/snapshots/latest.jpg` — most recent frame
- `POST /api/devices/{id}/snooze {minutes}` / `DELETE …/snooze`
- `POST /api/devices/{id}/feedback {disputed_state}` — "you're incorrect"
- `POST /api/devices/{id}/stove-type {stove_type}` — gas | electric | induction
- `POST /api/devices/{id}/push-token` — APNs token registration
- `POST /api/oven-models`, `GET /api/oven-models?query=`,
  `POST /api/oven-models/{id}/references`, `POST /api/devices/{id}/oven-model`

All device endpoints require `Authorization: Bearer <device_key>`.

## Safety note

StoveWatch is a convenience reminder, not a safety device. It can miss
activity or misread scenes and must not be relied on to prevent fires.

## License

Proprietary — Copyright © 2026 MNEME Labs, all rights reserved. See the
repository root LICENSE file. Not licensed for use, copying, modification,
or distribution without written permission.
