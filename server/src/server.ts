import app from "./app.js";
import { env } from "./config/env.js";
import { examsService } from "./modules/exams/exams.service.js";
import logger from "./utils/logger.js";
import { timetablesService } from "./modules/timetables/timetables.service.js";
import { bookingsService } from "./modules/bookings/bookings.service.js";
import { changesService } from "./modules/changes/changes.service.js";
import { prisma } from "./lib/prisma.js";

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}.`);
});

async function resumeQueuedJobsAfterDatabaseCheck() {
  let connected = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      connected = true;
      logger.info("Database connection verified.");
      break;
    } catch (error) {
      logger.error(`[DATABASE_STARTUP_CHECK_FAILED] attempt ${attempt}/3`, error);
      try {
        await prisma.$disconnect();
      } catch (disconnectError) {
        logger.error("[DATABASE_DISCONNECT_FAILED]", disconnectError);
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }

  if (!connected) {
    logger.error(
      "[QUEUED_JOB_RECOVERY_SKIPPED] Database unavailable after three connection attempts.",
      new Error("Check DATABASE_URL and database availability, then restart the server."),
    );
    return;
  }

  const recoveries = [
    ["QUEUED_EXAM_JOBS_RESUME_FAILED", () => examsService.resumeQueuedJobs()],
    ["QUEUED_TIMETABLE_JOBS_RESUME_FAILED", () => timetablesService.resumeQueuedJobs()],
    ["QUEUED_BOOKING_JOBS_RESUME_FAILED", () => bookingsService.resumeQueuedJobs()],
    ["QUEUED_CHANGE_JOBS_RESUME_FAILED", () => changesService.resumeQueuedJobs()],
  ] as const;

  for (const [label, recover] of recoveries) {
    try {
      await recover();
    } catch (error) {
      logger.error(`[${label}]`, error);
    }
  }
}

void resumeQueuedJobsAfterDatabaseCheck();
