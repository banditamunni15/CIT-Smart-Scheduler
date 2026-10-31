
from collections import defaultdict

from ..common import Ctx, check_bookings, check_timetable
from .priority import sort_booking_requests
from .reasons import get_reason


MAX_PERIOD = 13


def _build_base_assignment(sessions):
    """Convert schedule session records into the validator's assignment format."""

    if isinstance(sessions, dict):
        sessions = sessions.get("sessions", [])

    assignment = {}

    for item in sessions:
        sid = item["session_id"]

        if sid in assignment:
            raise ValueError(f"Duplicate scheduled session: {sid}")

        assignment[sid] = (
            item["day"],
            item["start_period"],
            item["room_id"],
        )

    return assignment


def _room_is_suitable(room, request):
    """Check room type, capacity, facilities and accessibility."""

    if "event" not in room.get("allowed_uses", []):
        return False, "ROOM_TYPE"

    if room.get("type") not in request.get("room_types", []):
        return False, "ROOM_TYPE"

    if room.get("capacity", 0) < request.get("attendance", 0):
        return False, "ROOM_CAPACITY"

    available_features = set(room.get("features", []))

    if room.get("accessible"):
        available_features.add("accessible")

    missing = set(request.get("needs", [])) - available_features

    if missing:
        if "accessible" in missing:
            return False, "ACCESSIBILITY"
        return False, "ROOM_FEATURES"

    return True, None


def _candidate_is_free(
    ctx,
    request,
    room,
    day,
    start,
    duration,
    room_busy,
    group_busy,
):
    """Check whether a room and time slot can host the request."""

    end = start + duration - 1

    if start < 1 or end > MAX_PERIOD:
        return False

    if day not in ctx.days:
        return False

    suitable, _ = _room_is_suitable(room, request)

    if not suitable:
        return False

    for period in range(start, end + 1):

        if (day, period) in ctx.room_un[room["id"]]:
            return False

        if room_busy[(room["id"], day, period)]:
            return False

        for group in request.get("mandatory_for_groups", []):
            if group_busy.get((group, day, period)):
                return False

    return True


def _candidate_sort_key(candidate, request, day_order):
    """Requested room first, then best capacity fit, then earliest slot."""

    room = candidate["room"]

    requested_room = request.get("requested_room")

    requested_room_rank = (
        0 if requested_room and room["id"] == requested_room else 1
    )

    capacity_waste = room["capacity"] - request["attendance"]

    return (
        requested_room_rank,
        capacity_waste,
        day_order[candidate["day"]],
        candidate["start"],
        room["id"],
    )


def _find_candidates(
    ctx,
    request,
    room_busy,
    group_busy,
    allowed_windows=None,
    exclude_windows=None,
):
    """Find all legal room/time combinations."""

    candidates = []
    duration = request["duration_periods"]

    day_order = {
        day: index
        for index, day in enumerate(ctx.days)
    }

    for window in allowed_windows or []:

        day = window["day"]
        first = window["from_period"]
        last = window["to_period"]

        if day not in day_order:
            continue

        latest_start = last - duration + 1

        for start in range(first, latest_start + 1):

            end = start + duration - 1

            if end > MAX_PERIOD:
                continue

            if exclude_windows and any(
                excluded["day"] == day
                and excluded["from_period"] <= start
                and end <= excluded["to_period"]
                for excluded in exclude_windows
            ):
                continue

            for room in ctx.rooms.values():

                if _candidate_is_free(
                    ctx,
                    request,
                    room,
                    day,
                    start,
                    duration,
                    room_busy,
                    group_busy,
                ):
                    candidates.append({
                        "room": room,
                        "day": day,
                        "start": start,
                        "end": end,
                    })

    candidates.sort(
        key=lambda candidate: _candidate_sort_key(
            candidate, request, day_order
        )
    )

    return candidates


def _diagnose_rejection(ctx, request, room_busy, group_busy):
    """Choose a useful rejection reason based on the request constraints."""

    rooms = list(ctx.rooms.values())

    if not rooms:
        return "NO_AVAILABLE_ROOM"

    suitable_rooms = []

    for room in rooms:
        suitable, reason = _room_is_suitable(room, request)

        if suitable:
            suitable_rooms.append(room)

    if not suitable_rooms:
        reasons = [
            _room_is_suitable(room, request)[1]
            for room in rooms
        ]

        for code in (
            "ROOM_CAPACITY",
            "ROOM_FEATURES",
            "ACCESSIBILITY",
            "ROOM_TYPE",
        ):
            if code in reasons:
                return code

        return "ROOM_TYPE"

    valid_window = False
    room_blocked = False
    group_blocked = False
    duration = request["duration_periods"]

    for window in request.get("windows", []):

        day = window["day"]

        if day not in ctx.days:
            continue

        for start in range(
            window["from_period"],
            window["to_period"] - duration + 2,
        ):

            end = start + duration - 1

            if end > MAX_PERIOD:
                continue

            valid_window = True

            for room in suitable_rooms:

                blocked_by_room = False

                for period in range(start, end + 1):
                    if (day, period) in ctx.room_un[room["id"]]:
                        blocked_by_room = True

                    if room_busy[(room["id"], day, period)]:
                        blocked_by_room = True

                if blocked_by_room:
                    room_blocked = True
                    continue

                for group in request.get("mandatory_for_groups", []):
                    if any(
                        group_busy.get((group, day, period))
                        for period in range(start, end + 1)
                    ):
                        group_blocked = True
                        break

                if not group_blocked:
                    return "NO_AVAILABLE_ROOM"

    if not valid_window:
        return "INVALID_WINDOW"

    if group_blocked:
        return "GROUP_CONFLICT"

    if room_blocked:
        return "TIMETABLE_CONFLICT"

    return "NO_AVAILABLE_ROOM"


def decide_bookings(dataset, sessions):
    """
    Allocate event bookings using deterministic priority and room selection.

    Returns:
        fest: booking decisions and session overrides
        report: official validator results
    """

    if not dataset.get("dataset_id"):
        raise ValueError("Dataset is missing dataset_id.")

    ctx = Ctx(dataset)
    base = _build_base_assignment(sessions)

    # Validate the base timetable and obtain occupied student-group periods.
    _, group_busy = check_timetable(ctx, base, "base")

    # Initialize room occupancy using the existing timetable.
    room_busy = defaultdict(list)

    for sid, (day, start, room_id) in base.items():

        session = ctx.sessions.get(sid)

        if not session:
            continue

        for period in range(start, start + session["duration"]):
            room_busy[(room_id, day, period)].append(sid)

    # Cancelled requests receive a rejected decision, never an approval.
    cancelled_ids = set(ctx.cancelled)

    decisions = []

    for request_id in cancelled_ids:
        decisions.append({
            "request_id": request_id,
            "status": "rejected",
            "reason": "This booking request was cancelled.",
            "reason_code": "CANCELLED",
        })

    # Process active requests in official priority order.
    requests = sort_booking_requests(dataset)

    for request in requests:

        request_id = request["id"]
        windows = request.get("windows", [])

        # First try the requested windows.
        candidates = _find_candidates(
            ctx=ctx,
            request=request,
            room_busy=room_busy,
            group_busy=group_busy,
            allowed_windows=windows,
        )

        if candidates:
            chosen = candidates[0]

            decision = {
                "request_id": request_id,
                "status": "approved",
                "room_id": chosen["room"]["id"],
                "day": chosen["day"],
                "start_period": chosen["start"],
                "end_period": chosen["end"],
            }

        else:
            # No requested-window slot: search for an alternative.
            all_windows = [
                {
                    "day": day,
                    "from_period": 1,
                    "to_period": MAX_PERIOD,
                }
                for day in ctx.days
            ]

            alternatives = _find_candidates(
                ctx=ctx,
                request=request,
                room_busy=room_busy,
                group_busy=group_busy,
                allowed_windows=all_windows,
                exclude_windows=windows,
            )

            if alternatives:
                chosen = alternatives[0]

                decision = {
                    "request_id": request_id,
                    "status": "alternative_offered",
                    "room_id": chosen["room"]["id"],
                    "day": chosen["day"],
                    "start_period": chosen["start"],
                    "end_period": chosen["end"],
                    "reason": (
                        "No suitable slot was available in the requested "
                        "windows. An alternative slot is offered."
                    ),
                    "reason_code": "NO_AVAILABLE_ROOM",
                }

            else:
                reason_code = _diagnose_rejection(
                    ctx,
                    request,
                    room_busy,
                    group_busy,
                )

                decision = {
                    "request_id": request_id,
                    "status": "rejected",
                    "reason": get_reason(reason_code),
                    "reason_code": reason_code,
                }

        decisions.append(decision)

        # Reserve the room only for approved or alternative bookings.
        if decision["status"] in (
            "approved",
            "alternative_offered",
        ):
            room_id = decision["room_id"]
            day = decision["day"]

            for period in range(
                decision["start_period"],
                decision["end_period"] + 1,
            ):
                room_busy[(room_id, day, period)].append(request_id)

    fest = {
        "bookings": decisions,
        "session_overrides": [],
    }

    # Run the official validator on the complete booking decisions.
    violations, warnings, stats = check_bookings(
        ctx,
        base,
        fest,
    )

    report = {
        "valid": len(violations) == 0,
        "hard_violations": violations,
        "hard_violation_count": len(violations),
        "warnings": warnings,
        **stats,
    }

    return fest, report

