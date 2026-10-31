
from collections import defaultdict

from ortools.sat.python import cp_model

from ..common import Ctx, check_exams


def generate_exams(dataset, time_limit_s=30, workers=1):
    """Generate an exam timetable using CP-SAT."""

    exams = dataset.get("exams", [])
    rooms = dataset.get("rooms", [])
    calendar = dataset["calendar"]["exam_week"]

    days = calendar["days"]
    slots = [s["id"] for s in calendar["sessions"]]

    if not exams:
        raise ValueError("Dataset contains no exams.")

    exam_rooms = [
        room for room in rooms
        if "exam" in room.get("allowed_uses", [])
        and int(room.get("capacity", 0)) > 0
    ]

    if not exam_rooms:
        raise ValueError("No rooms are allowed to host exams.")

    model = cp_model.CpModel()

    # -------------------------------------------------
    # Decision variables
    # x[e,d,s] = exam e is assigned to day d, slot s.
    # y[e,d,s,r] = room r is used for that exam.
    # -------------------------------------------------

    x = {}
    y = {}

    for exam in exams:
        eid = exam["id"]

        for day in days:
            for slot in slots:
                x[(eid, day, slot)] = model.NewBoolVar(
                    f"exam_{eid}_{day}_{slot}"
                )

                for room in exam_rooms:
                    rid = room["id"]

                    y[(eid, day, slot, rid)] = model.NewBoolVar(
                        f"room_{eid}_{day}_{slot}_{rid}"
                    )

    # Every exam gets exactly one day and slot.
    for exam in exams:
        eid = exam["id"]

        model.AddExactlyOne(
            x[(eid, day, slot)]
            for day in days
            for slot in slots
        )

    # -------------------------------------------------
    # Room capacity and room assignment.
    # Exam capacity = normal room capacity // 2.
    # -------------------------------------------------

    for exam in exams:
        eid = exam["id"]
        required_seats = int(exam["size"])

        for day in days:
            for slot in slots:
                selected_rooms = [
                    y[(eid, day, slot, room["id"])]
                    for room in exam_rooms
                ]

                model.Add(
                    sum(
                        (int(room["capacity"]) // 2)
                        * y[(eid, day, slot, room["id"])]
                        for room in exam_rooms
                    )
                    >= required_seats * x[(eid, day, slot)]
                )

                # A room can only be used if the exam
                # is assigned to that slot.
                for room_var in selected_rooms:
                    model.Add(
                        room_var <= x[(eid, day, slot)]
                    )

    # A room cannot host two exams simultaneously.
    for room in exam_rooms:
        rid = room["id"]

        for day in days:
            for slot in slots:
                model.AddAtMostOne(
                    y[(exam["id"], day, slot, rid)]
                    for exam in exams
                )

    # -------------------------------------------------
    # Student groups cannot have two exams in one slot.
    # -------------------------------------------------

    all_groups = {
        group
        for exam in exams
        for group in exam.get("groups", [])
    }

    for group in all_groups:
        for day in days:
            for slot in slots:
                group_exams = [
                    x[(exam["id"], day, slot)]
                    for exam in exams
                    if group in exam.get("groups", [])
                ]

                if len(group_exams) > 1:
                    model.AddAtMostOne(group_exams)

    # -------------------------------------------------
    # Soft objective:
    # 5 penalty for each additional exam per group/day.
    # Secondary objective: use fewer rooms.
    # -------------------------------------------------

    objective_terms = []
    room_count_terms = []

    for group in all_groups:
        for day in days:
            daily_exams = [
                x[(exam["id"], day, slot)]
                for exam in exams
                if group in exam.get("groups", [])
                for slot in slots
            ]

            count = model.NewIntVar(
                0,
                len(daily_exams),
                f"daily_exam_count_{group}_{day}"
            )

            model.Add(count == sum(daily_exams))

            excess = model.NewIntVar(
                0,
                len(daily_exams),
                f"daily_exam_excess_{group}_{day}"
            )

            model.AddMaxEquality(excess, [count - 1, 0])

            objective_terms.append(5 * excess)

    for room_var in y.values():
        room_count_terms.append(room_var)

    model.Minimize(
        1000 * sum(objective_terms)
        + sum(room_count_terms)
    )

    # -------------------------------------------------
    # Solve.
    # -------------------------------------------------

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(
        1, float(time_limit_s)
    )
    solver.parameters.num_search_workers = max(
        1, int(workers)
    )
    solver.parameters.random_seed = 42

    status = solver.Solve(model)

    if status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE,
    ):
        raise RuntimeError(
            "No feasible exam timetable found. "
            f"CP-SAT status: {solver.StatusName(status)}"
        )

    # -------------------------------------------------
    # Build output in the official expected format.
    # -------------------------------------------------

    exams_out = []

    for exam in exams:
        eid = exam["id"]
        selected = None

        for day in days:
            for slot in slots:
                if solver.Value(x[(eid, day, slot)]):
                    selected = {
                        "exam_id": eid,
                        "course_ids": exam.get("course_ids", []),
                        "group_ids": exam.get("groups", []),
                        "day": day,
                        "session": slot,
                        "rooms": [
                            room["id"]
                            for room in exam_rooms
                            if solver.Value(
                                y[(eid, day, slot, room["id"])]
                            )
                        ],
                    }
                    break

            if selected:
                break

        if selected is None:
            raise RuntimeError(
                f"Exam {eid} was not assigned."
            )

        exams_out.append(selected)

    # -------------------------------------------------
    # Official exam validation.
    # -------------------------------------------------

    ctx = Ctx(dataset)

    violations, exam_penalty = check_exams(
        ctx, exams_out
    )

    report = {
        "exam_count": len(exams_out),
        "hard_violations": violations,
        "hard_violation_count": len(violations),
        "exam_soft_penalty": exam_penalty,
    }

    if violations:
        raise RuntimeError(
            "Generated exams failed official validation: "
            + str(violations[:10])
        )

    solver_info = {
        "status": solver.StatusName(status),
        "objective_value": solver.ObjectiveValue(),
        "best_bound": solver.BestObjectiveBound(),
        "wall_time_seconds": solver.WallTime(),
        "num_conflicts": solver.NumConflicts(),
        "num_branches": solver.NumBranches(),
        "exam_count": len(exams_out),
        "exam_soft_penalty": exam_penalty,
    }

    return exams_out, report, solver_info
