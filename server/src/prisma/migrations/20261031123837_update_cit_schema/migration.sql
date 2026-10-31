-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'COORDINATOR', 'FACULTY', 'CLUB');

-- CreateEnum
CREATE TYPE "DatasetSource" AS ENUM ('SEED', 'UPLOAD', 'CHANGE_APPLIED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BookingCategory" AS ENUM ('INSTITUTE_EVENT', 'GUEST_LECTURE', 'DEPARTMENT_EVENT', 'CLUB_EVENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'ALTERNATIVE_OFFERED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('APPROVED', 'ALTERNATIVE_OFFERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DecisionSource" AS ENUM ('RULE_ENGINE', 'ADMIN_OVERRIDE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('NOT_REQUIRED', 'PENDING_ADMIN', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('ADMIN_FORM', 'ADMIN_FILE', 'FACULTY_ASSISTANT', 'FACULTY_UNAVAILABILITY', 'COORDINATOR_REQUEST', 'MANUAL_MOVE');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('SUBMITTED', 'PROPOSED', 'DEPT_APPROVED', 'APPROVED', 'REJECTED', 'IMPOSSIBLE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('GENERATE_TIMETABLE', 'GENERATE_EXAMS', 'DECIDE_BOOKINGS', 'REPAIR');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "LlmPurpose" AS ENUM ('BOOKING_PARSE', 'FACULTY_ASSISTANT', 'EXPLAIN');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "clubName" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "facultyId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'CLUB';

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "DatasetSource" NOT NULL,
    "data" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetables" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "label" TEXT,
    "schedule" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "hardViolationCount" INTEGER NOT NULL,
    "softTotal" INTEGER NOT NULL,
    "softBreakdown" JSONB NOT NULL,
    "solverMeta" JSONB,
    "parentId" TEXT,
    "generatedById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "exams" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "hardViolationCount" INTEGER NOT NULL,
    "softPenalty" INTEGER NOT NULL,
    "generatedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "requesterId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterRole" "Role" NOT NULL,
    "requestedCategory" "BookingCategory" NOT NULL,
    "effectiveCategory" "BookingCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "attendance" INTEGER NOT NULL,
    "durationPeriods" INTEGER NOT NULL,
    "windows" JSONB NOT NULL,
    "roomTypes" TEXT[],
    "needs" TEXT[],
    "requestedRoom" TEXT,
    "mandatoryForGroups" TEXT[],
    "seriesId" TEXT,
    "rawText" TEXT,
    "llmDraft" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "cancelledAt" TIMESTAMP(3),
    "cancelNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_decisions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "timetableId" TEXT,
    "status" "DecisionStatus" NOT NULL,
    "day" TEXT,
    "startPeriod" INTEGER,
    "endPeriod" INTEGER,
    "roomId" TEXT,
    "reason" TEXT NOT NULL,
    "source" "DecisionSource" NOT NULL,
    "decidedById" TEXT,
    "approvalState" "ApprovalState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_overrides" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromDay" TEXT NOT NULL,
    "fromStart" INTEGER NOT NULL,
    "fromRoom" TEXT NOT NULL,
    "toDay" TEXT NOT NULL,
    "toStart" INTEGER NOT NULL,
    "toRoom" TEXT NOT NULL,

    CONSTRAINT "session_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_proposals" (
    "id" TEXT NOT NULL,
    "source" "ChangeSource" NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "baseDatasetId" TEXT NOT NULL,
    "baseTimetableId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "originalText" TEXT,
    "disruption" JSONB NOT NULL,
    "proposedSchedule" JSONB,
    "diff" JSONB,
    "movedCount" INTEGER,
    "timeChangedCount" INTEGER,
    "roomOnlyCount" INTEGER,
    "report" JSONB,
    "conflicts" JSONB,
    "explanation" TEXT,
    "deptApprovedById" TEXT,
    "deptApprovedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "resultDatasetId" TEXT,
    "resultTimetableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "params" JSONB,
    "resultType" TEXT,
    "resultId" TEXT,
    "error" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_calls" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" "LlmPurpose" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" JSONB,
    "validationOk" BOOLEAN,
    "rejectedReason" TEXT,
    "latencyMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "datasets_isActive_idx" ON "datasets"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_datasetKey_version_key" ON "datasets"("datasetKey", "version");

-- CreateIndex
CREATE INDEX "timetables_datasetId_status_idx" ON "timetables"("datasetId", "status");

-- CreateIndex
CREATE INDEX "exam_schedules_datasetId_status_idx" ON "exam_schedules"("datasetId", "status");

-- CreateIndex
CREATE INDEX "booking_requests_datasetId_status_idx" ON "booking_requests"("datasetId", "status");

-- CreateIndex
CREATE INDEX "booking_requests_requesterId_idx" ON "booking_requests"("requesterId");

-- CreateIndex
CREATE INDEX "booking_requests_seriesId_idx" ON "booking_requests"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_requests_datasetId_externalId_key" ON "booking_requests"("datasetId", "externalId");

-- CreateIndex
CREATE INDEX "booking_decisions_requestId_isCurrent_idx" ON "booking_decisions"("requestId", "isCurrent");

-- CreateIndex
CREATE INDEX "booking_decisions_approvalState_idx" ON "booking_decisions"("approvalState");

-- CreateIndex
CREATE INDEX "session_overrides_decisionId_idx" ON "session_overrides"("decisionId");

-- CreateIndex
CREATE INDEX "change_proposals_status_idx" ON "change_proposals"("status");

-- CreateIndex
CREATE INDEX "change_proposals_requestedById_idx" ON "change_proposals"("requestedById");

-- CreateIndex
CREATE INDEX "jobs_state_idx" ON "jobs"("state");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "llm_calls_purpose_createdAt_idx" ON "llm_calls"("purpose", "createdAt");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "timetables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_decisions" ADD CONSTRAINT "booking_decisions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_decisions" ADD CONSTRAINT "booking_decisions_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "timetables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_decisions" ADD CONSTRAINT "booking_decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_decisions" ADD CONSTRAINT "booking_decisions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_overrides" ADD CONSTRAINT "session_overrides_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "booking_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_baseDatasetId_fkey" FOREIGN KEY ("baseDatasetId") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_baseTimetableId_fkey" FOREIGN KEY ("baseTimetableId") REFERENCES "timetables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_resultDatasetId_fkey" FOREIGN KEY ("resultDatasetId") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_resultTimetableId_fkey" FOREIGN KEY ("resultTimetableId") REFERENCES "timetables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_deptApprovedById_fkey" FOREIGN KEY ("deptApprovedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
