
from typing import Any

from .common import (
    validate_schedule as run_validation,
)


def validate(
    dataset: dict[str, Any],
    schedule: dict[str, Any],
    baseline: dict[str, Any] | None = None,
    disruption: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Validate a schedule using the official checker.

    A schedule is valid only when hard_violation_count == 0.
    """
    return run_validation(
        dataset=dataset,
        schedule=schedule,
        baseline=baseline,
        disruption=disruption,
    )
