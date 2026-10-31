
from pathlib import Path
import hashlib
import sys

# Project paths
APP_DIR = Path(__file__).resolve().parent
ENGINE_DIR = APP_DIR.parent
ROOT_DIR = ENGINE_DIR.parent
VENDOR_DIR = ENGINE_DIR / "vendor"

# Import the official validator
if str(VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(VENDOR_DIR))

import validator

# Expose official validator functions
Ctx = validator.Ctx
check_timetable = validator.check_timetable
soft_score = validator.soft_score
check_bookings = validator.check_bookings
check_exams = validator.check_exams
apply_disruption = validator.apply_disruption
effective_category = validator.effective_category
outranks = validator.outranks
run = validator.run

EXPECTED_VALIDATOR_HASH = (
    "F02733B382FA111E89CD6BB261E185AE57DA6E41795F094B96CAB1575D6EE144"
)


def verify_validator():
    """Verify that the official validator has not been modified."""
    path = VENDOR_DIR / "validator.py"
    actual = hashlib.sha256(path.read_bytes()).hexdigest().upper()

    checksum_file = VENDOR_DIR / "VALIDATOR.sha256"
    recorded = checksum_file.read_text(encoding="utf-8").split()[0].upper()

    if actual != EXPECTED_VALIDATOR_HASH or actual != recorded:
        raise RuntimeError("Official validator SHA256 verification failed.")

    return actual


def load_dataset(path):
    """Load a JSON dataset."""
    import json

    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def validate_dataset_id(dataset, schedule):
    """Ensure schedule and dataset belong to the same dataset."""
    dataset_id = dataset.get("dataset_id")
    schedule_id = schedule.get("dataset_id")

    if not dataset_id:
        raise ValueError("Dataset is missing dataset_id.")

    if not schedule_id:
        raise ValueError("Schedule is missing dataset_id.")

    if dataset_id != schedule_id:
        raise ValueError(
            f"Dataset ID mismatch: dataset={dataset_id}, "
            f"schedule={schedule_id}."
        )


def validate_schedule(dataset, schedule, baseline=None, disruption=None):
    """
    Run the official validator.
    Apply disruption to a copy of the dataset when requested.
    """
    verify_validator()
    validate_dataset_id(dataset, schedule)

    effective_dataset = dataset

    if disruption is not None:
        effective_dataset = apply_disruption(dataset, disruption)

    report = run(effective_dataset, schedule, baseline)

    return {
        "valid": report["hard_violation_count"] == 0,
        "report": report
    }
