
import json
import sys
from pathlib import Path

# Make the project root importable when this script is run directly.
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from Engine.app.common import run as official_validate
from Engine.app.solver.timetable import generate_timetable
from Engine.app.solver.exams import generate_exams
from Engine.app.solver.repair import repair_timetable
from Engine.app.bookings.engine import decide_bookings


DATASET_PATH = ROOT / "data" / "cit_public.json"
EXPORT_DIR = ROOT / "exports"


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)


def main():
    print("=" * 60)
    print("CIT CAMPUS SCHEDULING ENGINE - FULL INTEGRATION")
    print("=" * 60)

    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATASET_PATH}"
        )

    with DATASET_PATH.open(encoding="utf-8") as file:
        dataset = json.load(file)

    print("\n[1/6] Generating timetable...")

    schedule, timetable_report, timetable_info = generate_timetable(
        dataset,
        time_limit_s=180,
        workers=4,
    )

    print("Timetable status:", timetable_info["status"])
    print("Scheduled sessions:", len(schedule["sessions"]))
    print("Timetable violations:",
          timetable_report["hard_violation_count"])

    print("\n[2/6] Generating examinations...")

    exams, exam_report, exam_info = generate_exams(
        dataset,
        time_limit_s=60,
        workers=4,
    )

    schedule["exams"] = exams

    print("Exam status:", exam_info["status"])
    print("Generated exams:", exam_info["exam_count"])
    print("Exam violations:", exam_report["hard_violation_count"])

    print("\n[3/6] Allocating bookings...")

    fest_week, booking_report = decide_bookings(
        dataset,
        schedule["sessions"],
    )

    schedule["fest_week"] = fest_week

    print("Approved:", booking_report["approved"])
    print("Alternatives:", booking_report["alternatives"])
    print("Rejected:", booking_report["rejected"])
    print("Booking violations:",
          booking_report["hard_violation_count"])
    print("Priority inversions:",
          len(booking_report["priority_inversions"]))

    print("\n[4/6] Running official full validation...")

    final_report = official_validate(dataset, schedule)

    print("Hard violations:",
          final_report["hard_violation_count"])

    save_json(EXPORT_DIR / "schedule.json", schedule)
    save_json(EXPORT_DIR / "validation_report.json", final_report)

    print("Saved:", EXPORT_DIR / "schedule.json")

    if final_report["hard_violation_count"] != 0:
        print("\nBASE SCHEDULE VALIDATION FAILED.")
        return 1

    print("\n[5/6] Testing timetable repair...")

    # Choose a non-basket session to create a real disruption.
    session_map = {
        item["id"]: item for item in dataset["sessions"]
    }

    target = next(
        (
            item for item in schedule["sessions"]
            if not session_map[item["session_id"]].get("basket_slot")
        ),
        None,
    )

    if target is None:
        raise RuntimeError("No suitable session found for repair test.")

    source_session = session_map[target["session_id"]]

    affected_periods = list(
        range(
            target["start_period"],
            target["start_period"] + source_session["duration"],
        )
    )

    disruption = {
        "changes": [
            {
                "type": "faculty_unavailable",
                "faculty_id": source_session["faculty_id"],
                "days": [target["day"]],
                "periods": affected_periods,
                "reason": "Automated integration repair test",
            }
        ]
    }

    print(
        "Disruption:",
        source_session["faculty_id"],
        target["day"],
        affected_periods,
        target["session_id"],
    )

    repaired_result = repair_timetable(
        dataset=dataset,
        baseline=schedule,
        disruption=disruption,
        time_limit_s=180,
        workers=4,
    )

    repaired_schedule = repaired_result["schedule"]

    print("Repair status:",
          repaired_result["solver_info"]["status"])
    print("Repair successful:", repaired_result["success"])
    print("Moved sessions:",
          repaired_result["moved_session_count"])
    print("Repair violations:",
          repaired_result["report"]["hard_violation_count"])

    print("\n[6/6] Saving repaired timetable...")

    save_json(
        EXPORT_DIR / "schedule_after.json",
        repaired_schedule,
    )
    save_json(
        EXPORT_DIR / "repair_report.json",
        repaired_result,
    )

    print("Saved:", EXPORT_DIR / "schedule_after.json")

    success = (
        final_report["hard_violation_count"] == 0
        and repaired_result["success"]
        and repaired_result["report"]["hard_violation_count"] == 0
        and booking_report["hard_violation_count"] == 0
        and exam_report["hard_violation_count"] == 0
    )

    print("\n" + "=" * 60)

    if success:
        print("INTEGRATION TEST PASSED")
    else:
        print("INTEGRATION TEST FAILED")

    print("=" * 60)

    return 0 if success else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("\nINTEGRATION ERROR:", str(exc))
        raise
