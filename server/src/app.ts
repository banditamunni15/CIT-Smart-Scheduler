import express, { type Express } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import errorHandler from "./middlewares/error-handler.js";
import notFound from "./middlewares/not-found.js";
import examsRouter from "./modules/exams/exams.routes.js";
import publicExamsRouter from "./modules/exams/exams.public.routes.js";
import systemRouter from "./modules/system/system.routes.js";
import datasetsRouter from "./modules/datasets/datasets.routes.js";
import settingsRouter from "./modules/settings/settings.routes.js";
import jobsRouter from "./modules/jobs/jobs.routes.js";
import timetablesRouter from "./modules/timetables/timetables.routes.js";
import publicTimetablesRouter from "./modules/timetables/timetables.public.routes.js";
import bookingsRouter from "./modules/bookings/bookings.routes.js";
import changesRouter from "./modules/changes/changes.routes.js";

const app: Express = express();

app.use(cors());
app.options(/.*/, cors());
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "10mb" }));

app.use("/api", systemRouter);
app.use("/api", datasetsRouter);
app.use("/api", settingsRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/timetables", timetablesRouter);
app.use("/api/public", publicTimetablesRouter);
app.use("/api/exams", examsRouter);
app.use("/api/public/exams", publicExamsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/changes", changesRouter);
app.use(notFound);
app.use(errorHandler);
export default app;
