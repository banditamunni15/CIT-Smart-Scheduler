from ..common import apply_disruption, run
from ..bookings.engine import decide_bookings
from .timetable import generate_timetable


def repair_timetable(
    dataset,
    baseline,
    disruption,
    time_limit_s=180,
    workers=4,
):
    """
    Apply a disruption and repair the timetable while minimizing
    the number of changed session assignments.
    """

    if baseline.get("dataset_id") != dataset.get("dataset_id"):
        raise ValueError("Baseline and dataset IDs do not match.")

    if not baseline.get("sessions"):
        raise ValueError("Baseline timetable has no sessions.")

    # Apply the requested change using the official validator.
    updated_dataset = apply_disruption(dataset, disruption)

    # Generate a repaired timetable, preserving baseline assignments.
    repaired, timetable_report, solver_info = generate_timetable(
        updated_dataset,
        time_limit_s=time_limit_s,
        workers=workers,
        team=baseline.get("team", "CIT Scheduling Engine"),
        baseline=baseline,
        movement_weight=1000,
    )

    # Recalculate bookings against the repaired timetable.
    fest_week, booking_report = decide_bookings(
        updated_dataset,
        repaired["sessions"],
    )

    repaired["fest_week"] = fest_week

    # Retain the existing exam assignments.
    repaired["exams"] = baseline.get("exams", [])

    old_assignments = {
        item["session_id"]: (
            item["day"],
            item["start_period"],
            item["room_id"],
        )
        for item in baseline.get("sessions", [])
    }

    new_assignments = {
        item["session_id"]: (
            item["day"],
            item["start_period"],
            item["room_id"],
        )
        for item in repaired["sessions"]
    }

    moved_sessions = []

    for sid, new_value in new_assignments.items():
        old_value = old_assignments.get(sid)

        if old_value is not None and old_value != new_value:
            moved_sessions.append({
                "session_id": sid,
                "before": {
                    "day": old_value[0],
                    "start_period": old_value[1],
                    "room_id": old_value[2],
                },
                "after": {
                    "day": new_value[0],
                    "start_period": new_value[1],
                    "room_id": new_value[2],
                },
            })

    # Run the official full validator on the repaired output.
    final_report = run(
        updated_dataset,
        repaired,
        baseline=baseline,
    )

    result = {
        "success": final_report["hard_violation_count"] == 0,
        "schedule": repaired,
        "report": final_report,
        "timetable_report": timetable_report,
        "booking_report": booking_report,
        "solver_info": solver_info,
        "moved_session_count": len(moved_sessions),
        "moved_sessions": moved_sessions,
        "new_session_count": len(
            set(new_assignments) - set(old_assignments)
        ),
        "removed_session_count": len(
            set(old_assignments) - set(new_assignments)
        ),
    }

    return result