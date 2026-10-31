import type { RequestHandler } from "express";
import { NotFoundError, UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import type { RequestUser } from "../../types/express.js";
import {
  timetablesService,
  type TimetablesService,
} from "./timetables.service.js";
import type {
  FreeRoomsQuery,
  ManualValidationBody,
  TimetableListQuery,
} from "./timetables.schema.js";
import {
  facultyParamsSchema,
  groupParamsSchema,
  roomParamsSchema,
  timetableIdParamsSchema,
} from "./timetables.schema.js";
import type { z } from "zod";

type IdParams = z.infer<typeof timetableIdParamsSchema>;
type GroupParams = z.infer<typeof groupParamsSchema>;
type FacultyParams = z.infer<typeof facultyParamsSchema>;
type RoomParams = z.infer<typeof roomParamsSchema>;

const getActor = (req: Parameters<RequestHandler>[0]): RequestUser => {
  if (!req.user) throw new UnauthorizedError("Authentication is required.");
  return req.user;
};

type TimetablesController = {
  generate: RequestHandler;
  list: RequestHandler;
  getPublished: RequestHandler;
  getMe: RequestHandler;
  getById: RequestHandler;
  validateStored: RequestHandler;
  publish: RequestHandler;
  deleteDraft: RequestHandler;
  groupView: RequestHandler;
  facultyView: RequestHandler;
  roomView: RequestHandler;
  manualValidate: RequestHandler;
  publicGroups: RequestHandler;
  publicGroupView: RequestHandler;
  publicRoomView: RequestHandler;
  freeRooms: RequestHandler;
};

export const createTimetablesController = (
  service: Pick<
    TimetablesService,
    | "generate"
    | "list"
    | "getPublished"
    | "getById"
    | "validateStored"
    | "publish"
    | "deleteDraft"
    | "getGroupView"
    | "getFacultyView"
    | "getRoomView"
    | "getGroups"
    | "getFreeRooms"
    | "validateManual"
  > = timetablesService,
): TimetablesController => ({
  generate: AsyncHandler(async (req, res) => {
    const data = await service.generate(getActor(req));
    res
      .status(202)
      .json(new ApiResponse(202, "Timetable generation queued.", data));
  }),
  list: AsyncHandler(async (_req, res) => {
    const query = validatedData<TimetableListQuery>(res, "query");
    const data = await service.list(query);
    res.status(200).json(new ApiResponse(200, "Timetables retrieved.", data));
  }),
  getPublished: AsyncHandler(async (_req, res) => {
    const data = await service.getPublished();
    res
      .status(200)
      .json(new ApiResponse(200, "Published timetable retrieved.", data));
  }),
  getMe: AsyncHandler(async (req, res) => {
    const user = getActor(req);
    if (user.role !== "FACULTY" || !user.facultyId) {
      throw new NotFoundError("The faculty timetable was not found.");
    }
    const data = await service.getFacultyView(user.facultyId, user);
    res
      .status(200)
      .json(new ApiResponse(200, "Your timetable retrieved.", data));
  }),
  getById: AsyncHandler(async (_req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.getById(id);
    res.status(200).json(new ApiResponse(200, "Timetable retrieved.", data));
  }),
  validateStored: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.validateStored(id, getActor(req));
    res.status(200).json(new ApiResponse(200, "Timetable validated.", data));
  }),
  publish: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.publish(id, getActor(req));
    res.status(200).json(new ApiResponse(200, "Timetable published.", data));
  }),
  deleteDraft: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.deleteDraft(id, getActor(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Draft timetable deleted.", data));
  }),
  groupView: AsyncHandler(async (_req, res) => {
    const { groupId } = validatedData<GroupParams>(res, "params");
    const data = await service.getGroupView(groupId);
    res
      .status(200)
      .json(new ApiResponse(200, "Group timetable retrieved.", data));
  }),
  facultyView: AsyncHandler(async (req, res) => {
    const { facultyId } = validatedData<FacultyParams>(res, "params");
    const data = await service.getFacultyView(facultyId, getActor(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Faculty timetable retrieved.", data));
  }),
  roomView: AsyncHandler(async (_req, res) => {
    const { roomId } = validatedData<RoomParams>(res, "params");
    const data = await service.getRoomView(roomId);
    res
      .status(200)
      .json(new ApiResponse(200, "Room timetable retrieved.", data));
  }),
  manualValidate: AsyncHandler(async (_req, res) => {
    const input = validatedData<ManualValidationBody>(res, "body");
    const data = await service.validateManual(input);
    res.status(200).json(new ApiResponse(200, "Schedule validated.", data));
  }),
  publicGroups: AsyncHandler(async (_req, res) => {
    const data = await service.getGroups();
    res.status(200).json(new ApiResponse(200, "Groups retrieved.", data));
  }),
  publicGroupView: AsyncHandler(async (_req, res) => {
    const { groupId } = validatedData<GroupParams>(res, "params");
    const data = await service.getGroupView(groupId);
    res
      .status(200)
      .json(new ApiResponse(200, "Group timetable retrieved.", data));
  }),
  publicRoomView: AsyncHandler(async (_req, res) => {
    const { roomId } = validatedData<RoomParams>(res, "params");
    const data = await service.getRoomView(roomId);
    res
      .status(200)
      .json(new ApiResponse(200, "Room timetable retrieved.", data));
  }),
  freeRooms: AsyncHandler(async (_req, res) => {
    const query = validatedData<FreeRoomsQuery>(res, "query");
    const data = await service.getFreeRooms(query);
    res.status(200).json(new ApiResponse(200, "Free rooms retrieved.", data));
  }),
});
