
REASON_MESSAGES = {
    "NO_AVAILABLE_ROOM": "No suitable room is available for the requested time.",
    "ROOM_CAPACITY": "No suitable room has enough capacity for the requested attendance.",
    "ROOM_TYPE": "No room of the requested type is available.",
    "ROOM_FEATURES": "Available rooms do not have all the required facilities.",
    "ACCESSIBILITY": "No suitable accessible room is available.",
    "ROOM_UNAVAILABLE": "The requested room is unavailable during this time.",
    "TIMETABLE_CONFLICT": "The room is occupied by a scheduled class or another event.",
    "GROUP_CONFLICT": "One or more mandatory student groups have classes during this time.",
    "INVALID_WINDOW": "The requested time window is invalid.",
    "DURATION": "No valid time slot matches the requested event duration.",
    "CANCELLED": "This booking request was cancelled.",
    "PRIORITY": "A higher-priority booking has preference for the available slot.",
}


def get_reason(code):
    """Return a human-readable explanation for a booking decision."""
    return REASON_MESSAGES.get(
        code,
        "The request could not be accommodated under the scheduling constraints."
    )


def make_reason(code, details=None):
    """Create a structured reason for an approval, alternative, or rejection."""
    result = {
        "code": code,
        "message": get_reason(code),
    }

    if details:
        result["details"] = details

    return result
