
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .common import (
    Ctx,
    check_bookings,
    verify_validator,
)
from .validate import validate as run_validation
from .solver.timetable import generate_timetable
from .solver.exams import generate_exams
from .solver.repair import repair_timetable
from .bookings.engine import decide_bookings
from .explain import explain_session, explain_booking


app = FastAPI(
    title="CIT Campus Scheduling Engine",
    description="Stateless Python scheduling and validation service",
    version="1.0.0",
)


# ---------------------------------------------------------
# Request models
# ---------------------------------------------------------

class ValidateRequest(BaseModel):
    dataset: dict[str, Any]
    schedule: dict[str, Any]
    baseline: dict[str, Any] | None = None
    disruption: dict[str, Any] | None = None


class GenerateTimetableRequest(BaseModel):
    dataset: dict[str, Any]
    time_limit_s: float = Field(default=20, gt=0, le=300)
    workers: int | None = Field(default=1, ge=1)
    team: str = "CIT Scheduling Engine"


class GenerateExamsRequest(BaseModel):
    dataset: dict[str, Any]
    time_limit_s: float = Field(default=30, gt=0, le=300)
    workers: int = Field(default=1, ge=1)


class BookingRequest(BaseModel):
    dataset: dict[str, Any]
    sessions: list[dict[str, Any]]


class BookingDraftRequest(BaseModel):
    dataset: dict[str, Any]
    sessions: list[dict[str, Any]]
    draft: dict[str, Any]


class RepairRequest(BaseModel):
    dataset: dict[str, Any]
    baseline: dict[str, Any]
    disruption: dict[str, Any]
    time_limit_s: float = Field(default=180, gt=0, le=300)
    workers: int = Field(default=4, ge=1)


class ExplainSessionRequest(BaseModel):
    dataset: dict[str, Any]
    schedule: dict[str, Any]
    session_id: str


class ExplainBookingRequest(BaseModel):
    dataset: dict[str, Any]
    schedule: dict[str, Any]
    request_id: str


# ---------------------------------------------------------
# Startup
# ---------------------------------------------------------

@app.on_event("startup")
def startup_check():
    verify_validator()


# ---------------------------------------------------------
# Health
# ---------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "CIT Campus Scheduling Engine",
        "validator": "verified",
    }


# ---------------------------------------------------------
# Official validation
# ---------------------------------------------------------

@app.post("/validate")
def validate_endpoint(request: ValidateRequest):
    try:
        return run_validation(
            dataset=request.dataset,
            schedule=request.schedule,
            baseline=request.baseline,
            disruption=request.disruption,
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Official validation failed: {str(exc)}",
        )


# ---------------------------------------------------------
# Timetable generation
# ---------------------------------------------------------

@app.post("/timetable/generate")
def generate_timetable_endpoint(
    request: GenerateTimetableRequest,
):
    try:
        schedule, report, solver_info = generate_timetable(
            dataset=request.dataset,
            time_limit_s=request.time_limit_s,
            workers=request.workers,
            team=request.team,
        )

        return {
            "schedule": schedule,
            "report": report,
            "solver": solver_info,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Timetable generation failed: {str(exc)}",
        )


# ---------------------------------------------------------
# Exam generation
# ---------------------------------------------------------

@app.post("/exams/generate")
def generate_exams_endpoint(request: GenerateExamsRequest):
    try:
        exams, report, solver_info = generate_exams(
            dataset=request.dataset,
            time_limit_s=request.time_limit_s,
            workers=request.workers,
        )

        return {
            "exams": exams,
            "report": report,
            "solver": solver_info,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Exam generation failed: {str(exc)}",
        )


# ---------------------------------------------------------
# Booking allocation
# ---------------------------------------------------------

@app.post("/bookings/decide")
def decide_bookings_endpoint(request: BookingRequest):
    try:
        fest_week, report = decide_bookings(
            request.dataset,
            request.sessions,
        )

        return {
            "fest_week": fest_week,
            "report": report,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Booking allocation failed: {str(exc)}",
        )


# ---------------------------------------------------------
# Booking draft validation
# ---------------------------------------------------------

@app.post("/bookings/check-draft")
def check_booking_draft_endpoint(
    request: BookingDraftRequest,
):
    try:
        ctx = Ctx(request.dataset)

        base = {
            item["session_id"]: (
                item["day"],
                item["start_period"],
                item["room_id"],
            )
            for item in request.sessions
        }

        violations, warnings, stats = check_bookings(
            ctx,
            base,
            request.draft,
        )

        return {
            "valid": len(violations) == 0,
            "hard_violations": violations,
            "hard_violation_count": len(violations),
            "warnings": warnings,
            "stats": stats,
        }

    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Booking draft validation failed: {str(exc)}",
        )


# ---------------------------------------------------------
# Timetable repair
# ---------------------------------------------------------

@app.post("/repair")
def repair_endpoint(request: RepairRequest):
    try:
        return repair_timetable(
            dataset=request.dataset,
            baseline=request.baseline,
            disruption=request.disruption,
            time_limit_s=request.time_limit_s,
            workers=request.workers,
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Timetable repair failed: {str(exc)}",
        )


# ---------------------------------------------------------
# Explanations
# ---------------------------------------------------------

@app.post("/explain/session")
def explain_session_endpoint(request: ExplainSessionRequest):
    try:
        return explain_session(
            request.dataset,
            request.schedule,
            request.session_id,
        )

    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Session explanation failed: {str(exc)}",
        )


@app.post("/explain/booking")
def explain_booking_endpoint(request: ExplainBookingRequest):
    try:
        return explain_booking(
            request.dataset,
            request.schedule,
            request.request_id,
        )

    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Booking explanation failed: {str(exc)}",
        )
