
from collections import defaultdict

from ortools.sat.python import cp_model

from ..common import Ctx, check_timetable, soft_score
from .prepare import prepare_dataset, get_fixed_slot


def generate_timetable(
    dataset,
    time_limit_s=20,
    workers=None,
    team="CIT Scheduling Engine",
    baseline=None,
    movement_weight=1000,
):
    """
    Generate a timetable using Google OR-Tools CP-SAT.

    Returns:
        schedule: timetable in the platform's expected JSON format
        report: official validator report
        solver_info: CP-SAT execution information
    """
    prepared = prepare_dataset(dataset)

    if prepared["impossible_sessions"]:
        raise ValueError(
            "Sessions have no legal room/time options: "
            + ", ".join(prepared["impossible_sessions"])
        )

    model = cp_model.CpModel()

    sessions = prepared["sessions"]
    session_map = prepared["session_map"]
    session_options = prepared["session_options"]
    rooms = prepared["room_map"]
    faculty = prepared["faculty_map"]
    groups = prepared["group_map"]
    days = prepared["days"]
    periods = prepared["periods"]

    # ---------------------------------------------------------
    # Decision variables
    # One Boolean variable for each legal session/day/time/room.
    # ---------------------------------------------------------

    x = {}
    options_by_session = defaultdict(list)
    options_by_time = defaultdict(list)
    room_occupancy = defaultdict(list)
    faculty_occupancy = defaultdict(list)
    group_occupancy = defaultdict(list)

    for session in sessions:
        sid = session["id"]

        fixed = get_fixed_slot(session)
        legal_options = session_options[sid]

        for option in legal_options:
            day = option["day"]
            start = option["start"]
            occupied = option["periods"]

            # Respect both the fixed day and fixed period.
            if fixed and day != fixed[0]:
                continue

            for rid in option["rooms"]:
                key = (sid, day, start, rid)

                var = model.NewBoolVar(
                    f"x_{sid}_{day}_{start}_{rid}"
                )

                x[key] = var
                options_by_session[sid].append(var)
                options_by_time[(sid, day, start)].append(var)

                # Room conflicts.
                for p in occupied:
                    room_occupancy[(rid, day, p)].append(var)

                    faculty_occupancy[
                        (session["faculty_id"], day, p)
                    ].append(var)

        if not options_by_session[sid]:
            raise ValueError(
                f"Session {sid} has no options after fixed-slot filtering."
            )

    # Every session must be scheduled exactly once.
    for sid in session_map:
        model.AddExactlyOne(options_by_session[sid])

    # ---------------------------------------------------------
    # Basket sessions must share their day and start period.
    # ---------------------------------------------------------

    basket_groups = defaultdict(list)

    for session in sessions:
        basket = session.get("basket_slot")

        if basket:
            basket_groups[basket].append(session["id"])

    for basket_id, member_ids in basket_groups.items():
        common_times = None

        for sid in member_ids:
            times = {
                (day, start)
                for (session_id, day, start) in options_by_time
                if session_id == sid
            }

            common_times = (
                times if common_times is None
                else common_times & times
            )

        common_times = common_times or []

        if not common_times:
            raise ValueError(
                f"Basket {basket_id} has no common legal time."
            )

        basket_time_vars = []

        for day, start in common_times:
            shared = model.NewBoolVar(
                f"basket_{basket_id}_{day}_{start}"
            )
            basket_time_vars.append(shared)

            for sid in member_ids:
                member_vars = options_by_time.get(
                    (sid, day, start), []
                )

                if member_vars:
                    model.Add(
                        sum(member_vars) == shared
                    )
                else:
                    model.Add(shared == 0)

        model.AddExactlyOne(basket_time_vars)

    # ---------------------------------------------------------
    # Student-group occupancy.
    #
    # Members of the same basket are counted as one occupancy
    # for a group, matching the validator's basket behaviour.
    # ---------------------------------------------------------

    group_terms = defaultdict(list)

    for session in sessions:
        sid = session["id"]
        basket = session.get("basket_slot")
        unit_key = (
            f"BASKET::{basket}" if basket else sid
        )

        for option in session_options[sid]:
            day = option["day"]
            start = option["start"]
            occupied = option["periods"]

            if get_fixed_slot(session):
                if day != get_fixed_slot(session)[0]:
                    continue

            matching_vars = []

            for rid in option["rooms"]:
                var = x.get((sid, day, start, rid))
                if var is not None:
                    matching_vars.append(var)

            if not matching_vars:
                continue

            presence = model.NewBoolVar(
                f"group_presence_{sid}_{day}_{start}"
            )

            model.AddMaxEquality(presence, matching_vars)

            for group_id in session.get("groups", []):
                for p in occupied:
                    group_terms[
                        (group_id, day, p, unit_key)
                    ].append(presence)

    # Merge the same basket occupancy into one Boolean variable.
    group_occupancy = defaultdict(list)

    for (group_id, day, period, unit_key), terms in group_terms.items():
        merged = model.NewBoolVar(
            f"grp_{group_id}_{day}_{period}_{unit_key}"
        )

        model.AddMaxEquality(merged, terms)

        group_occupancy[(group_id, day, period)].append(merged)

    # A group cannot attend two different sessions simultaneously.
    for key, terms in group_occupancy.items():
        if len(terms) > 1:
            model.AddAtMostOne(terms)

    # ---------------------------------------------------------
    # Room and faculty collision constraints.
    # ---------------------------------------------------------

    for key, terms in room_occupancy.items():
        if len(terms) > 1:
            model.AddAtMostOne(terms)

    for key, terms in faculty_occupancy.items():
        if len(terms) > 1:
            model.AddAtMostOne(terms)

    # ---------------------------------------------------------
    # Faculty daily teaching-hour limits.
    # ---------------------------------------------------------

    for faculty_id, member in faculty.items():
        max_hours = int(member.get("max_hours_per_day", 99))

        for day in days:
            terms = []

            for session in sessions:
                if session["faculty_id"] != faculty_id:
                    continue

                sid = session["id"]
                duration = int(session["duration"])

                for (session_id, option_day, start), vars_at_time in (
                    options_by_time.items()
                ):
                    if session_id == sid and option_day == day:
                        terms.extend(
                            duration * var for var in vars_at_time
                        )

            if terms:
                model.Add(sum(terms) <= max_hours)

    # ---------------------------------------------------------
    # Soft objective: S1 through S6.
    # ---------------------------------------------------------

    penalties = {
        f"S{i}": [] for i in range(1, 7)
    }

    # S1: avoid faculty preference periods.
    for session in sessions:
        sid = session["id"]
        member = faculty.get(session["faculty_id"], {})

        for option in session_options[sid]:
            day = option["day"]
            start = option["start"]
            occupied = option["periods"]

            if get_fixed_slot(session):
                if day != get_fixed_slot(session)[0]:
                    continue

            avoid_count = 0

            for pref in member.get("preferences", []):
                if pref.get("type") != "avoid":
                    continue

                if day not in pref.get("days", days):
                    continue

                avoid_count += sum(
                    1 for p in occupied
                    if p in pref.get("periods", [])
                )

            if avoid_count:
                for rid in option["rooms"]:
                    var = x.get((sid, day, start, rid))
                    if var is not None:
                        penalties["S1"].append(
                            2 * avoid_count * var
                        )

    # S5: room capacity usage below 40%.
    # S6: session reaches the last teaching period.
    last_teaching = max(
        int(p["id"])
        for p in periods
        if p.get("teaching", False)
    )

    for session in sessions:
        sid = session["id"]

        for option in session_options[sid]:
            day = option["day"]
            start = option["start"]

            if get_fixed_slot(session):
                if day != get_fixed_slot(session)[0]:
                    continue

            for rid in option["rooms"]:
                var = x.get((sid, day, start, rid))

                if var is None:
                    continue

                room = rooms[rid]

                capacity = int(room.get("capacity", 0))
                size = int(session.get("size", 0))

                if capacity and size / capacity < 0.4:
                    penalties["S5"].append(var)

                if last_teaching in option["periods"]:
                    penalties["S6"].append(var)

    # S2: gaps between the first and last occupied period.
    group_ids = list(groups)

    for group_id in group_ids:
        for day in days:
            occupied_vars = {}

            for p in range(1, last_teaching + 1):
                terms = group_occupancy.get(
                    (group_id, day, p), []
                )

                occupied = model.NewBoolVar(
                    f"occupied_{group_id}_{day}_{p}"
                )

                if terms:
                    model.AddMaxEquality(occupied, terms)
                else:
                    model.Add(occupied == 0)

                occupied_vars[p] = occupied

            for p in range(2, last_teaching):
                earlier = model.NewBoolVar(
                    f"earlier_{group_id}_{day}_{p}"
                )
                later = model.NewBoolVar(
                    f"later_{group_id}_{day}_{p}"
                )

                model.AddMaxEquality(
                    earlier,
                    [occupied_vars[q] for q in range(1, p)]
                )
                model.AddMaxEquality(
                    later,
                    [
                        occupied_vars[q]
                        for q in range(p + 1, last_teaching + 1)
                    ]
                )

                gap = model.NewBoolVar(
                    f"gap_{group_id}_{day}_{p}"
                )

                model.Add(gap <= earlier)
                model.Add(gap <= later)
                model.Add(gap + occupied_vars[p] <= 1)
                model.Add(
                    gap >= earlier + later
                    - occupied_vars[p] - 1
                )

                penalties["S2"].append(gap)

    # S3: more than six hours for a group on one day.
    # Basket sessions count once per group, as in the validator.
    for group_id in group_ids:
        for day in days:
            hour_terms = []
            seen_baskets = set()

            for session in sessions:
                if group_id not in session.get("groups", []):
                    continue

                sid = session["id"]
                basket = session.get("basket_slot")

                if basket:
                    basket_key = (group_id, basket)

                    if basket_key in seen_baskets:
                        continue

                    seen_baskets.add(basket_key)

                duration = int(session["duration"])

                for (session_id, option_day, start), vars_at_time in (
                    options_by_time.items()
                ):
                    if session_id == sid and option_day == day:
                        hour_terms.extend(
                            duration * var for var in vars_at_time
                        )

            if hour_terms:
                total_hours = model.NewIntVar(
                    0, 100, f"hours_{group_id}_{day}"
                )

                model.Add(total_hours == sum(hour_terms))

                excess = model.NewIntVar(
                    0, 100, f"excess_{group_id}_{day}"
                )

                model.AddMaxEquality(
                    excess,
                    [total_hours - 6, 0]
                )

                penalties["S3"].append(3 * excess)

    # S4: repeated non-basket lectures of the same course/group/day.
    for group_id in group_ids:
        course_ids = {
            s["course_id"]
            for s in sessions
            if group_id in s.get("groups", [])
            and s.get("kind") == "lecture"
            and not s.get("basket_slot")
        }

        for course_id in course_ids:
            for day in days:
                lecture_vars = []

                for session in sessions:
                    if (
                        group_id not in session.get("groups", [])
                        or session.get("kind") != "lecture"
                        or session.get("basket_slot")
                        or session["course_id"] != course_id
                    ):
                        continue

                    sid = session["id"]

                    for (session_id, option_day, start), vars_at_time in (
                        options_by_time.items()
                    ):
                        if session_id == sid and option_day == day:
                            lecture_vars.extend(vars_at_time)

                if lecture_vars:
                    count = model.NewIntVar(
                        0, len(lecture_vars),
                        f"lectures_{group_id}_{course_id}_{day}"
                    )
                    model.Add(count == sum(lecture_vars))

                    excess = model.NewIntVar(
                        0, len(lecture_vars),
                        f"lecture_excess_{group_id}_{course_id}_{day}"
                    )

                    model.AddMaxEquality(
                        excess,
                        [count - 1, 0]
                    )

                    penalties["S4"].append(3 * excess)

    # S4: basket lectures of the same course on the same day.
    basket_courses = defaultdict(list)

    for session in sessions:
        if session.get("basket_slot"):
            basket_courses[
                session["course_id"]
            ].append(session["id"])

    for course_id, member_ids in basket_courses.items():
        for day in days:
            terms = []

            for sid in member_ids:
                for (session_id, option_day, start), vars_at_time in (
                    options_by_time.items()
                ):
                    if session_id == sid and option_day == day:
                        terms.extend(vars_at_time)

            if terms:
                count = model.NewIntVar(
                    0, len(terms),
                    f"basket_course_{course_id}_{day}"
                )
                model.Add(count == sum(terms))

                excess = model.NewIntVar(
                    0, len(terms),
                    f"basket_excess_{course_id}_{day}"
                )

                model.AddMaxEquality(
                    excess,
                    [count - 1, 0]
                )

                penalties["S4"].append(3 * excess)

    # Minimize soft penalties while strongly preserving the baseline.
    objective_terms = []
    
    for terms in penalties.values():
        objective_terms.extend(terms)
    
    baseline_map = {}
    
    if baseline:
        baseline_sessions = (
            baseline.get("sessions", [])
            if isinstance(baseline, dict)
            else []
        )
    
        baseline_map = {
            item["session_id"]: (
                item["day"],
                int(item["start_period"]),
                item["room_id"],
            )
            for item in baseline_sessions
        }
    
    movement_terms = []
    
    for (sid, day, start, rid), var in x.items():
        old = baseline_map.get(sid)
    
        if old is not None and old != (day, start, rid):
            movement_terms.append(int(movement_weight) * var)
    
    all_objective_terms = objective_terms + movement_terms
    
    if all_objective_terms:
        model.Minimize(sum(all_objective_terms))

    # ---------------------------------------------------------
    # Solve.
    # ---------------------------------------------------------

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(
        1, float(time_limit_s)
    )
    solver.parameters.num_search_workers = (
        int(workers) if workers else 1
    )
    solver.parameters.random_seed = 42

    status = solver.Solve(model)

    if status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE,
    ):
        raise RuntimeError(
            "No feasible timetable found. "
            f"CP-SAT status: {solver.StatusName(status)}"
        )

    # ---------------------------------------------------------
    # Convert solution into the required schedule JSON.
    # ---------------------------------------------------------

    assignments = []

    for session in sessions:
        sid = session["id"]
        selected = None

        for option in session_options[sid]:
            day = option["day"]
            start = option["start"]

            if get_fixed_slot(session):
                if day != get_fixed_slot(session)[0]:
                    continue

            for rid in option["rooms"]:
                var = x.get((sid, day, start, rid))

                if var is not None and solver.Value(var):
                    selected = {
                        "session_id": sid,
                        "day": day,
                        "start_period": start,
                        "room_id": rid,
                    }
                    break

            if selected:
                break

        if selected is None:
            raise RuntimeError(
                f"Solver did not assign session {sid}."
            )

        assignments.append(selected)

    schedule = {
        "team": team,
        "dataset_id": dataset["dataset_id"],
        "sessions": assignments,
        "fest_week": {
            "bookings": [],
            "session_overrides": [],
        },
        "exams": [],
    }

    # Always check the result with the untouched official validator.
    
    # Validate the timetable using the official timetable checker.
    ctx = Ctx(dataset)

    assignment = {
        item["session_id"]: (
            item["day"],
            item["start_period"],
            item["room_id"],
        )
        for item in assignments
    }

    hard_violations, _ = check_timetable(
        ctx, assignment, "timetable"
    )

    soft_penalties, soft_total = soft_score(
        ctx, assignment
    )

    report = {
        "dataset_id": dataset["dataset_id"],
        "hard_violations": hard_violations,
        "hard_violation_count": len(hard_violations),
        "soft_penalties": soft_penalties,
        "soft_total": soft_total,
    }

    if hard_violations:
        raise RuntimeError(
            "Generated timetable failed timetable validation: "
            + str(hard_violations[:10])
        )

    solver_info = {
        "status": solver.StatusName(status),
        "objective_value": solver.ObjectiveValue(),
        "best_bound": solver.BestObjectiveBound(),
        "wall_time_seconds": solver.WallTime(),
        "num_conflicts": solver.NumConflicts(),
        "num_branches": solver.NumBranches(),
        "session_count": len(assignments),
        "hard_violation_count": len(hard_violations),
        "soft_penalties": soft_penalties,
        "soft_total": soft_total,
    }

    return schedule, report, solver_info
