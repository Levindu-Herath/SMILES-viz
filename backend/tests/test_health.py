"""Smoke test: the app starts and the liveness endpoint answers."""


def test_health_returns_ok(client):
    resp = client.get("/api/health")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
