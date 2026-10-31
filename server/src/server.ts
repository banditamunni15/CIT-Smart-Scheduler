import app from "./app.js";
import { env } from "./config/env.js";
import { examsService } from "./modules/exams/exams.service.js";
import logger from "./utils/logger.js";
import { timetablesService } from "./modules/timetables/timetables.service.js";
import { bookingsService } from "./modules/bookings/bookings.service.js";
import { changesService } from "./modules/changes/changes.service.js";

(async function () {
  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}.`);
  });
  void examsService
    .resumeQueuedJobs()
    .catch((error: unknown) =>
      logger.error("[QUEUED_JOBS_RESUME_FAILED]", error),
    );
  void timetablesService
    .resumeQueuedJobs()
    .catch((error: unknown) =>
      logger.error("[QUEUED_TIMETABLE_JOBS_RESUME_FAILED]", error),
    );
  void bookingsService
    .resumeQueuedJobs()
    .catch((error: unknown) =>
      logger.error("[QUEUED_BOOKING_JOBS_RESUME_FAILED]", error),
    );
  void changesService
    .resumeQueuedJobs()
    .catch((error: unknown) =>
      logger.error("[QUEUED_CHANGE_JOBS_RESUME_FAILED]", error),
    );
})();
