from conftest import make_stove_image, upload


def setup_device(client, device):
    resp = upload(client, device, "/api/devices/{id}/baseline", make_stove_image(seed=1))
    assert resp.status_code == 200
    return resp


def test_snapshot_before_baseline_rejected(client, device):
    resp = upload(client, device, "/api/devices/{id}/snapshots", make_stove_image())
    assert resp.status_code == 409


def test_bad_device_key_rejected(client, device):
    resp = client.get(
        f"/api/devices/{device['device_id']}/status",
        headers={"Authorization": "Bearer wrong"},
    )
    assert resp.status_code == 401


def test_off_snapshot_no_notification(client, device):
    setup_device(client, device)
    resp = upload(client, device, "/api/devices/{id}/snapshots", make_stove_image(seed=5))
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "off"
    assert body["notified"] is False
    assert client.notifier.sent == []


def test_on_transition_sends_push_once(client, device):
    setup_device(client, device)
    client.post(
        f"/api/devices/{device['device_id']}/push-token",
        json={"token": "a" * 64},
        headers=device["headers"],
    )
    on_frame = make_stove_image(burner_on=True, seed=5)

    first = upload(client, device, "/api/devices/{id}/snapshots", on_frame).json()
    assert first["state"] == "on"
    assert first["notified"] is True
    assert len(client.notifier.sent) == 1
    assert "on" in client.notifier.sent[0]["title"].lower()

    # still on a few minutes later: no duplicate alert before the re-alert window
    second = upload(client, device, "/api/devices/{id}/snapshots", on_frame).json()
    assert second["state"] == "on"
    assert second["notified"] is False
    assert len(client.notifier.sent) == 1

    status = client.get(
        f"/api/devices/{device['device_id']}/status", headers=device["headers"]
    ).json()
    assert status["state"] == "on"
    assert status["last_snapshot"]["state"] == "on"


def test_snooze_suppresses_notifications(client, device):
    setup_device(client, device)
    client.post(
        f"/api/devices/{device['device_id']}/push-token",
        json={"token": "b" * 64},
        headers=device["headers"],
    )
    resp = client.post(
        f"/api/devices/{device['device_id']}/snooze",
        json={"minutes": 60},
        headers=device["headers"],
    )
    assert resp.status_code == 200

    result = upload(
        client, device, "/api/devices/{id}/snapshots", make_stove_image(burner_on=True)
    ).json()
    assert result["state"] == "on"
    assert result["notified"] is False
    assert client.notifier.sent == []

    status = client.get(
        f"/api/devices/{device['device_id']}/status", headers=device["headers"]
    ).json()
    assert status["snoozed"] is True

    client.delete(f"/api/devices/{device['device_id']}/snooze", headers=device["headers"])
    status = client.get(
        f"/api/devices/{device['device_id']}/status", headers=device["headers"]
    ).json()
    assert status["snoozed"] is False


def test_incorrect_on_learns_scene(client, device):
    """Disputing a false ON turns the offending frame into an off-reference,
    so the same scene stops alarming."""
    setup_device(client, device)
    # a glowing scene (e.g. low sun hitting the cooktop) misread as ON
    glare_frame = make_stove_image(burner_on=True, seed=5)

    first = upload(client, device, "/api/devices/{id}/snapshots", glare_frame).json()
    assert first["state"] == "on"

    resp = client.post(
        f"/api/devices/{device['device_id']}/feedback",
        json={"disputed_state": "on"},
        headers=device["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "off"
    assert resp.json()["learned"] is True

    again = upload(
        client, device, "/api/devices/{id}/snapshots", make_stove_image(burner_on=True, seed=9)
    ).json()
    assert again["state"] == "off"


def test_incorrect_off_tightens_threshold(client, device):
    setup_device(client, device)
    before = client.get(
        f"/api/devices/{device['device_id']}/status", headers=device["headers"]
    ).json()["threshold"]

    resp = client.post(
        f"/api/devices/{device['device_id']}/feedback",
        json={"disputed_state": "off"},
        headers=device["headers"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "on"
    assert body["threshold"] < before


def test_oven_model_references_apply_to_device(client, device):
    setup_device(client, device)

    model = client.post(
        "/api/oven-models", json={"brand": "GE", "model": "JB645RKSS"}
    ).json()
    # a known-off photo of this oven model with a pot parked on it
    resp = client.post(
        f"/api/oven-models/{model['id']}/references",
        files={"image": ("ref.jpg", make_stove_image(pot=True, seed=3), "image/jpeg")},
    )
    assert resp.status_code == 200

    # before assignment the pot scene reads changed; after, the model ref covers it
    assert (
        upload(client, device, "/api/devices/{id}/snapshots", make_stove_image(pot=True, seed=4))
        .json()["state"]
        == "changed"
    )
    client.post(
        f"/api/devices/{device['device_id']}/oven-model",
        json={"oven_model_id": model["id"]},
        headers=device["headers"],
    )
    assert (
        upload(client, device, "/api/devices/{id}/snapshots", make_stove_image(pot=True, seed=6))
        .json()["state"]
        == "off"
    )

    found = client.get("/api/oven-models", params={"query": "JB645"}).json()
    assert any(m["id"] == model["id"] for m in found)


def test_pot_alone_never_notifies(client, device):
    """A cold pot parked on the stove reads 'changed' — no push, ever."""
    setup_device(client, device)
    client.post(
        f"/api/devices/{device['device_id']}/push-token",
        json={"token": "c" * 64},
        headers=device["headers"],
    )
    result = upload(
        client, device, "/api/devices/{id}/snapshots", make_stove_image(pot=True, seed=5)
    ).json()
    assert result["state"] == "changed"
    assert result["notified"] is False
    assert client.notifier.sent == []

    status = client.get(
        f"/api/devices/{device['device_id']}/status", headers=device["headers"]
    ).json()
    assert status["state"] == "changed"


def test_static_changed_scene_is_auto_learned(client, device):
    """A changed scene that holds still for 3 consecutive snapshots becomes a
    new off-reference and the state settles back to off."""
    setup_device(client, device)

    states = [
        upload(
            client, device, "/api/devices/{id}/snapshots", make_stove_image(pot=True, seed=s)
        ).json()
        for s in (5, 6, 7)
    ]
    assert [r["state"] for r in states] == ["changed", "changed", "off"]
    assert states[-1]["auto_learned"] is True

    # the pot scene is now known-off; a lit burner must still alarm
    again = upload(
        client, device, "/api/devices/{id}/snapshots", make_stove_image(pot=True, seed=8)
    ).json()
    assert again["state"] == "off"
    assert again["auto_learned"] is False

    lit = upload(
        client, device, "/api/devices/{id}/snapshots",
        make_stove_image(pot=True, burner_on=True, seed=9),
    ).json()
    assert lit["state"] == "on"


def test_snooze_accepts_arbitrary_minutes(client, device):
    setup_device(client, device)
    for minutes in (1, 45, 90, 24 * 60):
        resp = client.post(
            f"/api/devices/{device['device_id']}/snooze",
            json={"minutes": minutes},
            headers=device["headers"],
        )
        assert resp.status_code == 200, minutes
    # out of range is rejected
    for minutes in (0, -5, 24 * 60 + 1):
        resp = client.post(
            f"/api/devices/{device['device_id']}/snooze",
            json={"minutes": minutes},
            headers=device["headers"],
        )
        assert resp.status_code == 422, minutes


def test_latest_snapshot_image_served(client, device):
    setup_device(client, device)
    upload(client, device, "/api/devices/{id}/snapshots", make_stove_image(seed=7))
    resp = client.get(
        f"/api/devices/{device['device_id']}/snapshots/latest.jpg",
        headers=device["headers"],
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
    assert resp.content[:2] == b"\xff\xd8"  # JPEG magic
