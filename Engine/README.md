# CIT Campus Scheduling Engine

## 1. Overview

The CIT Campus Scheduling Engine is a stateless Python service designed to generate, validate, and repair campus schedules.

It supports:
- Automatic timetable generation.
- Examination scheduling.
- Event booking allocation.
- Timetable repair after disruptions.
- Explanations for scheduling and booking decisions.
- Official hard-constraint validation.

## 2. Technology Stack

- Python 3.11+
- FastAPI
- Uvicorn
- Pydantic v2
- Google OR-Tools CP-SAT
- Pytest

## 3. Project Structure

```text
Engine/
├── app/
│   ├── bookings/
│   │   ├── engine.py
│   │   ├── priority.py
│   │   └── reasons.py
│   ├── solver/
│   │   ├── prepare.py
│   │   ├── timetable.py
│   │   ├── exams.py
│   │   └── repair.py
│   ├── common.py
│   ├── explain.py
│   ├── main.py
│   └── validate.py
├── scripts/
│   └── run_all.py
├── tests/
│   └── test_engine.py
├── vendor/
│   └── validator.py
├── Dockerfile
├── requirements.txt
├── THIRD_PARTY.md
└── README.md
```

## 4. Environment Setup

Run these commands from the repository root.

Create a virtual environment:

```powershell
py -3.11 -m venv .venv-py311
```

Activate it:

```powershell
.\.venv-py311\Scripts\Activate.ps1
```

Install dependencies:

```powershell
python -m pip install -r Engine/requirements.txt
```

## 5. Start the API Server

From the repository root:

```powershell
uvicorn Engine.app.main:app --host 127.0.0.1 --port 8080 --reload
```

API documentation:

http://127.0.0.1:8080/docs

## 6. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Check service health |
| POST | `/validate` | Validate a schedule |
| POST | `/timetable/generate` | Generate a timetable |
| POST | `/exams/generate` | Generate examination schedule |
| POST | `/bookings/decide` | Allocate event bookings |
| POST | `/bookings/check-draft` | Validate booking draft |
| POST | `/repair` | Repair a disrupted timetable |
| POST | `/explain/session` | Explain a session assignment |
| POST | `/explain/booking` | Explain a booking decision |

## 7. Run the Integration Script

From the repository root:

```powershell
python Engine/scripts/run_all.py
```

The script generates and validates:
- `exports/schedule.json`
- `exports/validation_report.json`
- `exports/schedule_after.json`
- `exports/repair_report.json`

## 8. Run Automated Tests

```powershell
python -m pytest Engine/tests -v
```

## 9. Docker Setup

Build the Docker image from the repository root:

```powershell
docker build -f Engine/Dockerfile -t cit-scheduler-engine .
```

Run the container:

```powershell
docker run -p 8000:8000 cit-scheduler-engine
```

Open:

http://localhost:8000/docs

## 10. Validation and Reliability

The engine uses the supplied official validator located in `Engine/vendor/validator.py`.

The validator is preserved unchanged and is used as the source of truth for hard-constraint validation.

The integration workflow checks timetable generation, examination scheduling, event booking allocation, validation, and timetable repair.