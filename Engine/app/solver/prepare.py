
from collections import defaultdict


def index_by_id(items):
    """Create a dictionary using each item's ID."""
    return {item["id"]: item for item in items}


def period_minutes(value):
    """Convert HH:MM into minutes."""
    hours, minutes = map(int, value.split(":"))
    return hours * 60 + minutes


def get_session_periods(session, periods):
    """
    Return consecutive teaching periods for a session.
    A session cannot cross the lunch break.
    """
    duration = int(session.get("duration", 1))
    start = int(session.get("_start_period", 0))

    selected = [
        start + offset
        for offset in range(duration)
    ]

    period_map = {
        int(p["id"]): p for p in periods
    }

    if any(p not in period_map for p in selected):
        return []

    for period_id in selected:
        if not period_map[period_id].get("teaching", False):
            return []

    # Ensure actual clock times are consecutive.
    for first, second in zip(selected, selected[1:]):
        first_end = period_minutes(period_map[first]["end"])
        second_start = period_minutes(period_map[second]["start"])

        if first_end != second_start:
            return []

    return selected


def get_fixed_slot(session):
    """Read a fixed slot if one exists."""
    fixed = session.get("fixed_slot")

    if not fixed:
        return None

    if isinstance(fixed, dict):
        day = fixed.get("day")
        start = fixed.get(
            "start_period",
            fixed.get("period", fixed.get("start"))
        )

        if day is not None and start is not None:
            return str(day), int(start)

    if isinstance(fixed, (list, tuple)) and len(fixed) >= 2:
        return str(fixed[0]), int(fixed[1])

    raise ValueError(
        f"Unsupported fixed_slot format for {session['id']}: {fixed}"
    )


def room_is_compatible(session, room, faculty, groups):
    """Check room type, usage, capacity and accessibility."""
    if room["type"] not in session.get("room_types", []):
        return False

    if session["kind"] not in room.get("allowed_uses", []):
        return False

    if int(room.get("capacity", 0)) < int(session.get("size", 0)):
        return False

    needs_accessible = session.get("needs_accessible", False)

    if faculty and faculty.get("needs_accessible", False):
        needs_accessible = True

    for group_id in session.get("groups", []):
        group = groups.get(group_id)

        if group and group.get("needs_accessible", False):
            needs_accessible = True

    if needs_accessible and not room.get("accessible", False):
        return False

    return True


def prepare_dataset(data):
    """
    Prepare dataset information for the CP-SAT timetable solver.

    Returns:
        days
        periods
        sessions
        rooms
        faculty
        groups
        session_options
        units
        lookup dictionaries
    """
    required = [
        "calendar",
        "sessions",
        "rooms",
        "faculty",
        "student_groups",
    ]

    for key in required:
        if key not in data:
            raise ValueError(f"Dataset is missing '{key}'.")

    calendar = data["calendar"]

    days = calendar["days"]
    periods = sorted(
        calendar["periods"],
        key=lambda p: int(p["id"])
    )

    sessions = data["sessions"]
    rooms = data["rooms"]
    faculty_list = data["faculty"]
    group_list = data["student_groups"]

    session_map = index_by_id(sessions)
    room_map = index_by_id(rooms)
    faculty_map = index_by_id(faculty_list)
    group_map = index_by_id(group_list)

    # Faculty unavailable periods.
    faculty_unavailable = defaultdict(set)

    for member in faculty_list:
        for item in member.get("unavailable", []):
            for period in item.get("periods", []):
                faculty_unavailable[
                    (member["id"], item["day"])
                ].add(int(period))

    # Room unavailable periods.
    room_unavailable = defaultdict(set)

    for item in data.get("room_unavailability", []):
        for period in item.get("periods", []):
            room_unavailable[
                (item["room_id"], item["day"])
            ].add(int(period))

    # Legal room and time options for every session.
    session_options = {}
    impossible_sessions = []

    for session in sessions:
        sid = session["id"]
        duration = int(session.get("duration", 1))
        faculty_id = session["faculty_id"]
        member = faculty_map.get(faculty_id)

        fixed = get_fixed_slot(session)

        candidate_starts = [
            int(p["id"])
            for p in periods
            if p.get("teaching", False)
        ]

        if session.get("kind") == "lab":
            allowed_lab_starts = set(
                int(p)
                for p in calendar.get("lab_start_periods", [])
            )

            candidate_starts = [
                p for p in candidate_starts
                if p in allowed_lab_starts
            ]

        if fixed:
            fixed_day, fixed_period = fixed

            if fixed_day not in days:
                raise ValueError(
                    f"Invalid fixed day for session {sid}: {fixed_day}"
                )

            candidate_starts = [
                p for p in candidate_starts
                if p == fixed_period
            ]

        options = []

        for day in days:
            for start in candidate_starts:
                session_copy = dict(session)
                session_copy["_start_period"] = start

                occupied = get_session_periods(
                    session_copy,
                    periods
                )

                if len(occupied) != duration:
                    continue

                # Faculty availability.
                if set(occupied) & faculty_unavailable[
                    (faculty_id, day)
                ]:
                    continue

                # Legal rooms.
                compatible_rooms = []

                for room in rooms:
                    if not room_is_compatible(
                        session,
                        room,
                        member,
                        group_map
                    ):
                        continue

                    rid = room["id"]

                    if set(occupied) & room_unavailable[
                        (rid, day)
                    ]:
                        continue

                    compatible_rooms.append(rid)

                if not compatible_rooms:
                    continue

                options.append({
                    "day": day,
                    "start": start,
                    "periods": occupied,
                    "rooms": compatible_rooms,
                })

        session_options[sid] = options

        if not options:
            impossible_sessions.append(sid)

    # Group sessions that must share the same time using basket_slot.
    basket_groups = defaultdict(list)
    normal_units = []

    for session in sessions:
        basket = session.get("basket_slot")

        if basket:
            basket_groups[basket].append(session["id"])
        else:
            normal_units.append({
                "id": session["id"],
                "sessions": [session["id"]],
            })

    units = list(normal_units)

    for basket_id, member_ids in basket_groups.items():
        # Find time slots legal for every member of the basket.
        common_times = None

        for sid in member_ids:
            times = {
                (option["day"], option["start"])
                for option in session_options[sid]
            }

            common_times = (
                times if common_times is None
                else common_times & times
            )

        units.append({
            "id": f"BASKET::{basket_id}",
            "sessions": member_ids,
            "common_times": sorted(common_times or []),
        })

    return {
        "days": days,
        "periods": periods,
        "sessions": sessions,
        "rooms": rooms,
        "faculty": faculty_list,
        "student_groups": group_list,
        "session_map": session_map,
        "room_map": room_map,
        "faculty_map": faculty_map,
        "group_map": group_map,
        "faculty_unavailable": dict(faculty_unavailable),
        "room_unavailable": dict(room_unavailable),
        "session_options": session_options,
        "units": units,
        "impossible_sessions": impossible_sessions,
        "session_count": len(sessions),
    }
