from .common import Ctx, check_timetable


def explain_session(dataset, schedule, session_id):
    """Explain the facts behind a scheduled session."""

    session = next(
        (s for s in dataset.get("sessions", [])
         if s["id"] == session_id),
        None,
    )

    if session is None:
        raise ValueError(f"Session not found: {session_id}")

    assignment = next(
        (s for s in schedule.get("sessions", [])
         if s["session_id"] == session_id),
        None,
    )

    if assignment is None:
        raise ValueError(f"Session is not scheduled: {session_id}")

    room = next(
        (r for r in dataset.get("rooms", [])
         if r["id"] == assignment["room_id"]),
        {},
    )

    faculty = next(
        (f for f in dataset.get("faculty", [])
         if f["id"] == session["faculty_id"]),
        {},
    )

    ctx = Ctx(dataset)

    all_assignments = {
        item["session_id"]: (
            item["day"],
            item["start_period"],
            item["room_id"],
        )
        for item in schedule.get("sessions", [])
    }

    violations, group_occupancy = check_timetable(
        ctx, all_assignments, "explanation"
    )

    reasons = [
        f"The session is scheduled on {assignment['day']} "
        f"starting at period {assignment['start_period']}."
    ]

    reasons.append(
        f"Room {room.get('id', assignment['room_id'])} "
        f"has capacity {room.get('capacity', 'unknown')}."
    )

    reasons.append(
        f"The session requires {session.get('size', 0)} seats "
        f"and lasts {session.get('duration', 1)} period(s)."
    )

    reasons.append(
        f"Faculty member: {session['faculty_id']}."
    )

    if session.get("fixed_slot"):
        reasons.append(
            f"The session has a fixed-slot requirement: "
            f"{session['fixed_slot']}."
        )

    if session.get("basket_slot"):
        reasons.append(
            f"The session belongs to basket "
            f"{session['basket_slot']}."
        )

    if room.get("type"):
        reasons.append(f"Room type: {room['type']}.")

    if room.get("features"):
        reasons.append(
            "Room facilities: " + ", ".join(room["features"]) + "."
        )

    if violations:
        status = "The complete timetable has validation violations."
    else:
        status = "The complete timetable passed hard-constraint validation."

    return {
        "session_id": session_id,
        "course_id": session.get("course_id"),
        "assignment": assignment,
        "room": {
            "id": room.get("id"),
            "type": room.get("type"),
            "capacity": room.get("capacity"),
        },
        "faculty_id": session["faculty_id"],
        "groups": session.get("groups", []),
        "reasons": reasons,
        "validation": {
            "valid": len(violations) == 0,
            "hard_violation_count": len(violations),
        },
        "summary": status,
    }


def explain_booking(dataset, schedule, request_id):
    """Explain the recorded decision for a booking request."""

    request = next(
        (r for r in dataset.get("booking_requests", [])
         if r["id"] == request_id),
        None,
    )

    if request is None:
        raise ValueError(f"Booking request not found: {request_id}")

    fest = schedule.get("fest_week", {})
    decision = next(
        (b for b in fest.get("bookings", [])
         if b.get("request_id") == request_id),
        None,
    )

    if decision is None:
        raise ValueError(
            f"No booking decision found for request {request_id}"
        )

    from .bookings.priority import get_priority_details
    from .bookings.reasons import get_reason

    priority = get_priority_details(dataset, request)

    reason_code = decision.get("reason_code")
    reason = (
        get_reason(reason_code)
        if reason_code
        else "The booking was processed by the allocation engine."
    )

    return {
        "request_id": request_id,
        "requester": request.get("requester"),
        "status": decision.get("status"),
        "priority": priority,
        "decision": decision,
        "reason": {
            "code": reason_code,
            "message": reason,
        },
    }
