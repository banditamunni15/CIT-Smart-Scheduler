import express ,{type Express}from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";

const app:Express = express();

app.use(cors());
app.options(/.*/, cors());
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

export default app;
