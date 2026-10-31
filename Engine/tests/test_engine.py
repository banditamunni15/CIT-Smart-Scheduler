
import json
import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from Engine.app.main import app
from Engine.app.common import verify_validator
from Engine.app.solver.prepare import prepare_dataset
from Engine.app.bookings.engine import decide_bookings
from Engine.app.explain import explain_session, explain_booking


ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = ROOT / "data" / "cit_public.json"
SCHEDULE_PATH = ROOT / "exports" / "schedule.json"
VALIDATOR_PATH = ROOT / "Engine" / "vendor" / "validator.py"

client = TestClient(app)


@pytest.fixture(scope="module")
def dataset():
    with open(DATASET_PATH, encoding="utf-8") as file:
        return json.load(file)


@pytest.fixture(scope="module")
def schedule():
    if not SCHEDULE_PATH.exists():
        pytest.skip("Run Engine/scripts/run_all.py first.")
    with open(SCHEDULE_PATH, encoding="utf-8") as file:
        return json.load(file)


def test_dataset_loads(dataset):
    assert dataset["dataset_id"] == "cit-public-v1"
    assert len(dataset["sessions"]) == 189


def test_official_validator_integrity():
    assert verify_validator() is not False
    assert VALIDATOR_PATH.exists()
    assert VALIDATOR_PATH.stat().st_size > 0


def test_dataset_preparation(dataset):
    prepared = prepare_dataset(dataset)
    assert prepared is not None


def test_generated_schedule_exists(schedule, dataset):
    assert schedule["dataset_id"] == dataset["dataset_id"]
    assert len(schedule["sessions"]) == 189


def test_booking_allocation(schedule, dataset):
    fest, report = decide_bookings(dataset, schedule["sessions"])
    assert len(fest["bookings"]) > 0
    assert report is not None


def test_session_explanation(schedule, dataset):
    session_id = schedule["sessions"][0]["session_id"]
    result = explain_session(dataset, schedule, session_id)
    assert result is not None


def test_booking_explanation(schedule, dataset):
    if not dataset.get("booking_requests"):
        pytest.skip("Dataset has no booking requests.")

    request_id = dataset["booking_requests"][0]["id"]
    result = explain_booking(dataset, schedule, request_id)
    assert result is not None


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200


def test_api_documentation():
    response = client.get("/openapi.json")
    assert response.status_code == 200
