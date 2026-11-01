# Server API

The server is an Express API. Exam scheduling is delegated to the Python
engine; the server stores validated schedules and exposes authenticated views.

## Scheduler assistant

The authenticated `POST /api/assistant/chat` endpoint answers questions using
the active dataset, published timetable and exam schedule, and the signed-in
user's own recent booking, change-request, and job status. It is read-only and
does not send draft schedules or other users' private records to the model.
Configure `OPENAI_API_KEY` on the server to enable it; `OPENAI_MODEL` defaults
to `gpt-4o-mini`. Chat messages are not persisted by the application or in
OpenAI Responses API storage.

## Phase 0 endpoints

| Method | Path          | Access                    | Purpose                              |
| ------ | ------------- | ------------------------- | ------------------------------------ |
| `GET`  | `/api/health` | Public                    | Liveness response                    |
| `GET`  | `/api/me`     | Any active signed-in user | Current database-backed user profile |

## Phase 2 jobs and timetable endpoints

| Method   | Path                                                  | Access                         | Purpose                                                                     |
| -------- | ----------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `GET`    | `/api/jobs`                                           | Admin                          | Paginated job metadata                                                      |
| `GET`    | `/api/jobs/:id`                                       | Job creator or Admin           | Job status and result metadata                                              |
| `POST`   | `/api/timetables/generate`                            | Admin                          | Queue generation; returns `202` with `data.jobId`                           |
| `GET`    | `/api/timetables`                                     | Admin                          | Paginated timetable metadata without schedule/report JSON                   |
| `GET`    | `/api/timetables/published`                           | Any active signed-in user      | Published timetable for the active dataset                                  |
| `GET`    | `/api/timetables/me`                                  | Faculty                        | Current faculty member's timetable                                          |
| `GET`    | `/api/timetables/:id`                                 | Admin                          | Timetable, schedule, and report details                                     |
| `POST`   | `/api/timetables/:id/validate`                        | Admin                          | Revalidate a draft and store its report                                     |
| `POST`   | `/api/timetables/:id/publish`                         | Admin                          | Revalidate and publish a zero-hard-violation draft                          |
| `DELETE` | `/api/timetables/:id`                                 | Admin                          | Delete a draft timetable                                                    |
| `GET`    | `/api/timetables/views/group/:groupId`                | Any active signed-in user      | Group view of the published timetable                                       |
| `GET`    | `/api/timetables/views/faculty/:facultyId`            | Admin, Coordinator, or Faculty | Faculty view; coordinators are limited to their department, faculty to self |
| `GET`    | `/api/timetables/views/room/:roomId`                  | Any active signed-in user      | Room view of the published timetable                                        |
| `POST`   | `/api/timetables/manual/validate`                     | Admin or Coordinator           | Validate `{ schedule }` against the active dataset without saving           |
| `GET`    | `/api/public/groups`                                  | Public                         | Groups in the active dataset                                                |
| `GET`    | `/api/public/timetable/group/:groupId`                | Public                         | Group view of the published timetable                                       |
| `GET`    | `/api/public/timetable/room/:roomId`                  | Public                         | Room view of the published timetable                                        |
| `GET`    | `/api/public/free-rooms?day=&period=&capacity=&type=` | Public                         | Rooms not occupied at the requested period, with optional filters           |

Timetable generation creates a database-backed `GENERATE_TIMETABLE` job tied to
the dataset active when requested. The worker sends the complete dataset with
the current `priority_order` to `{ENGINE_URL}/generate-timetable`, then sends
the generated schedule with that dataset to `{ENGINE_URL}/validate`. A draft
is written only when the official validator reports zero hard violations.
Publishing revalidates the draft and archives the prior published timetable
for that dataset in the same transaction. Queued generation jobs are resumed
when the server starts.

The public timetable views are derived from the published schedule and its
stored dataset; they do not create separate view tables. Manual validation
accepts `{ "schedule": { "sessions": [...] } }` and never persists the result.
Invalid schedules rejected by the engine return `422 SCHEDULE_RULE_VIOLATION`.

## Exam endpoints

| Method | Path                               | Access                    | Purpose                                                                   |
| ------ | ---------------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `POST` | `/api/exams/generate`              | Admin                     | Queue generation; returns `202` with `data.jobId`                         |
| `GET`  | `/api/exams`                       | Admin                     | Paginated metadata (`page`, `limit`; defaults `1`, `20`; max limit `100`) |
| `GET`  | `/api/exams/:id`                   | Admin                     | Schedule details and engine report                                        |
| `GET`  | `/api/exams/published`             | Any active signed-in user | Current published schedule                                                |
| `POST` | `/api/exams/:id/publish`           | Admin                     | Publish a valid draft and archive the previous published schedule         |
| `GET`  | `/api/public/exams/group/:groupId` | Public                    | Published exams for one group                                             |

## Booking endpoints

| Method  | Path                                  | Access                    | Purpose                                                                  |
| ------- | ------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `POST`  | `/api/bookings`                       | Signed-in user            | Submit a booking request with server-assigned requester and category     |
| `POST`  | `/api/bookings/check-draft`           | Signed-in user            | Check a draft against the published timetable                            |
| `GET`   | `/api/bookings`                       | Signed-in user            | Paginated requests scoped by role and department                         |
| `GET`   | `/api/bookings/series/:seriesId`      | Signed-in user            | Scoped requests in a series                                              |
| `GET`   | `/api/bookings/:id`                   | Signed-in user            | Request and decision history                                             |
| `PATCH` | `/api/bookings/:id`                   | Request owner             | Edit a request while it is submitted                                     |
| `POST`  | `/api/bookings/:id/cancel`            | Owner or Admin             | Cancel a request and invalidate its current decision                     |
| `POST`  | `/api/bookings/decide`                | Admin                     | Queue decisions for the active dataset                                   |
| `POST`  | `/api/bookings/:id/decide`            | Admin                     | Queue a decision for one request                                         |
| `POST`  | `/api/bookings/:id/override`          | Admin                     | Validate and apply an Admin override                                     |
| `POST`  | `/api/bookings/decisions/:id/approve` | Admin                     | Revalidate and approve a pending session override                       |
| `POST`  | `/api/bookings/decisions/:id/reject`  | Admin                     | Reject a pending session override with a review reason                   |
| `POST`  | `/api/bookings/decisions/:id/dept-approve` | Coordinator          | Audit department approval for an in-scope lab request                    |
| `POST`  | `/api/bookings/manual`                | Admin or Coordinator      | Validate and immediately save a manual room/time booking                 |

Booking decisions are database-backed jobs. The worker sends the complete
dataset, booking requests and cancellations, and published timetable to the
configured engine. Hard violations prevent decision writes; decisions with
session overrides remain submitted until an Admin revalidates and approves
them. Coordinator listings are limited to requests tied to their department's
users, rooms, or groups. `/api/bookings/parse` is not part of this phase.

## Timetable change endpoints

| Method | Path                              | Access                  | Purpose                                                         |
| ------ | --------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `POST` | `/api/changes`                    | Admin                   | Submit an official disruption JSON object for repair            |
| `POST` | `/api/changes/upload`             | Admin                   | Submit a JSON disruption file (`file` multipart field supported) |
| `POST` | `/api/changes/unavailability`     | Faculty                 | Submit own faculty unavailability                               |
| `POST` | `/api/changes/request`             | Coordinator or Faculty  | Request a session move or extra session                         |
| `GET`  | `/api/changes`                    | Signed-in user          | List own proposals; Admin can filter with comma-separated status |
| `GET`  | `/api/changes/:id`                | Owner or Admin          | Read proposal, diff, counts, report, conflicts, and explanation  |
| `POST` | `/api/changes/:id/dept-approve`   | Coordinator             | Approve a faculty proposal from the coordinator's department    |
| `POST` | `/api/changes/:id/approve`        | Admin                   | Validate and apply a repaired change                            |
| `POST` | `/api/changes/:id/reject`         | Admin                   | Reject a proposal with `{ "note": "..." }`                      |
| `POST` | `/api/changes/:id/withdraw`       | Requester                | Withdraw before the engine makes a decision                      |

Disruption bodies use `{ "changes": [...] }` with the official change types:
`faculty_unavailable`, `room_unavailable`, `add_session`, `add_faculty`, and
`remove_session`. Unknown fields are retained and forwarded to the engine.
Submissions create repair jobs and never modify the live dataset or timetable.
An approved repair creates a new `CHANGE_APPLIED` dataset version and publishes
a child timetable in one transaction. Engine repairs use
`POST {ENGINE_URL}/repair`; mock mode requires
`ENGINE_MOCK_REPAIR_RESULT`.

## Dataset and settings endpoints

| Method | Path                           | Access | Purpose                                                        |
| ------ | ------------------------------ | ------ | -------------------------------------------------------------- |
| `GET`  | `/api/datasets`                | Admin  | Paginated metadata and summaries; does not return dataset JSON |
| `GET`  | `/api/datasets/active`         | Public | Active dataset summary only                                    |
| `POST` | `/api/datasets/upload`         | Admin  | Validate and store `{ label, data }`                           |
| `POST` | `/api/datasets/:id/activate`   | Admin  | Make one dataset active                                        |
| `POST` | `/api/admin/reset-demo`        | Admin  | Activate the latest upload, archive schedules, and clear jobs  |
| `GET`  | `/api/settings/priority-order` | Public | Return the priority-order string array (empty if unset)        |
| `PUT`  | `/api/settings/priority-order` | Admin  | Save `{ "priority_order": ["..."] }`                           |

Uploads derive `datasetKey` from `data.dataset_id`, assign a new version for
that key, compute summary counts from top-level arrays, and call
`POST {ENGINE_URL}/validate` before saving. The engine response must include
`report.hard_violation_count`; a positive count rejects the upload without
creating a dataset.

The demo reset preserves dataset versions and audit history. It activates the
most recently uploaded dataset, archives all timetables and exam schedules, and
deletes job rows. If no uploaded dataset exists, it returns
`409 NO_DATASET_TO_RESET`.

Successful responses use `{ statusCode, success, message, data }`. Error
responses use `{ statusCode, success, message, code, details? }`.

## Scheduling engine

Set `ENGINE_URL` to the engine's base URL. Exam generation sends a `POST` to
`{ENGINE_URL}/generate-exams` with the full active dataset and, when available,
the published timetable schedule. The response must have this shape:

```json
{
  "exams": [
    {
      "exam_id": "exam-id",
      "course": "course-id",
      "group_ids": ["group-id"],
      "day": "MON",
      "session": "AM",
      "rooms": ["room-id"]
    }
  ],
  "report": {
    "hard_violation_count": 0,
    "soft_penalty": 0
  }
}
```

Each exam must include its group membership and public schedule fields. The
server does not save generated output when the engine reports hard violations.
Engine requests time out after `ENGINE_TIMEOUT_MS` (default `60000`).

For local development only, `ENGINE_MODE=mock` selects `MockEngine`; provide
`ENGINE_MOCK_EXAM_RESULT` as a JSON string containing the engine response
fixture, and `ENGINE_MOCK_VALIDATION_RESULT` as a JSON string containing
`{ "report": { "hard_violation_count": 0 } }`. Timetable generation also
requires `ENGINE_MOCK_TIMETABLE_RESULT` containing the timetable engine
response. Booking check-draft and decision calls require
`ENGINE_MOCK_BOOKING_DRAFT_RESULT` and
`ENGINE_MOCK_BOOKING_DECISIONS_RESULT` JSON response fixtures. The default
engine mode is `real`.

## Development

Run `pnpm build` to type-check and `pnpm test` to run the API tests and
type-check their sources.

### Demo users

Set `DEMO_USER_PASSWORD` to a password of at least 8 characters, then run
`pnpm seed:demo-users`. The idempotent script creates or updates the five
accounts shown on the client login page and assigns their demo roles. It also
resets their passwords to the supplied value each time it runs. For local
development, set the same value as `NEXT_PUBLIC_DEMO_PASSWORD` in the client
environment to enable the login-page demo account shortcut. Do not use demo
accounts or expose the demo password in a production deployment.
