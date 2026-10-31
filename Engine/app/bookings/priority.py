
from ..common import effective_category, outranks


def get_effective_priority(dataset, request):
    """Return the effective priority category of a booking request."""
    return effective_category(dataset, request)


def compare_requests(dataset, request_a, request_b):
    """
    Return:
      -1 if A has higher priority
       1 if B has higher priority
       0 if both have equal priority
    """
    if outranks(dataset, request_a, request_b):
        return -1

    if outranks(dataset, request_b, request_a):
        return 1

    return 0


def sort_booking_requests(dataset, requests=None):
    """Sort requests using the official priority and submission-time rules."""

    if requests is None:
        requests = dataset.get("booking_requests", [])

    cancelled = {
        item["request_id"]
        for item in dataset.get("cancellations", [])
    }

    active_requests = [
        request
        for request in requests
        if request["id"] not in cancelled
    ]

    priority_order = dataset["priority_order"]

    return sorted(
        active_requests,
        key=lambda request: (
            priority_order.index(
                effective_category(dataset, request)
            ),
            request["submitted_at"],
            request["id"],
        ),
    )


def get_priority_details(dataset, request):
    """Return readable priority information for a request."""

    category = effective_category(dataset, request)

    return {
        "request_id": request["id"],
        "requester": request["requester"],
        "requested_category": request["requested_category"],
        "effective_category": category,
        "priority_rank": dataset["priority_order"].index(category) + 1,
        "submitted_at": request["submitted_at"],
    }
