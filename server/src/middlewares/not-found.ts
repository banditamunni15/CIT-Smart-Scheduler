import type { RequestHandler } from "express";
import { NotFoundError } from "../utils/api-error.js";

const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError("The requested resource was not found."));
};

export default notFound;
