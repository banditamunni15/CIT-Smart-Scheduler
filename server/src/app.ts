import express ,{type Express}from "express";
import cors from "cors";
const app:Express = express();

app.use(cors());
app.options(/.*/, cors());
app.use(express.json());

export default app;
