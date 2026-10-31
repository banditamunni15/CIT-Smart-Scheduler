# Third-Party Software Notices

The CIT Campus Scheduling Engine uses the following open-source Python packages.

## 1. Direct Dependencies

| Package | Purpose | License |
|---|---|---|
| FastAPI | REST API framework | MIT |
| Uvicorn | ASGI application server | BSD-3-Clause |
| Pydantic | Data validation and request models | MIT |
| Google OR-Tools | Constraint programming and CP-SAT scheduling | Apache-2.0 |
| Pytest | Automated testing | MIT |
| httpx2 | HTTP client support for FastAPI TestClient | BSD-3-Clause |

## 2. Official Project Sources

- FastAPI: https://github.com/fastapi/fastapi
- Uvicorn: https://github.com/encode/uvicorn
- Pydantic: https://github.com/pydantic/pydantic
- Google OR-Tools: https://github.com/google/or-tools
- Pytest: https://github.com/pytest-dev/pytest
- httpx2: https://github.com/pydantic/httpx2

## 3. License Information

The dependencies are distributed under their respective open-source licenses:

- **MIT License:** FastAPI, Pydantic and Pytest.
- **BSD 3-Clause License:** Uvicorn and httpx2.
- **Apache License 2.0:** Google OR-Tools.

Each package remains the property of its respective authors and contributors.

## 4. Transitive Dependencies

These packages may install additional dependencies automatically. Those dependencies retain their own licenses and copyright notices.

This document identifies the project's directly declared dependencies. It is not a complete inventory of every transitive package installed in the Python environment.

## 5. Project Code

The CIT Campus Scheduling Engine's original application code is maintained separately from the third-party packages listed above.

The official validator supplied with the project is preserved unchanged and is not an independently developed third-party dependency.