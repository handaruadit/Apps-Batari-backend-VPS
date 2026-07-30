//===== (Mock Auth Middleware) ======
jest.mock("./middlewares/auth.middleware", () => (req, _res, next) => {
  req.__authenticated = true;
  next();
});

//===== (createMockHandler) ======
const createMockHandler = (name) => (req, res) =>
  res.status(200).json({
    handler: name,
    authenticated: Boolean(req.__authenticated),
  });

//===== (Mock Auth Controller) ======
jest.mock("./controllers/auth.controller", () => ({
  register: createMockHandler("register"),
  login: createMockHandler("login"),
  forgotPassword: createMockHandler("forgotPassword"),
  verifyResetCode: createMockHandler("verifyResetCode"),
  updatePassword: createMockHandler("updatePassword"),
}));

//===== (Mock Data Controller) ======
jest.mock("./controllers/data.controller", () => ({
  sendManualPlantData: createMockHandler("sendManualPlantData"),
  fetchDeviceData: createMockHandler("fetchDeviceData"),
  getDaily: createMockHandler("getDaily"),
  getMonthly: createMockHandler("getMonthly"),
  getYearly: createMockHandler("getYearly"),
  getLifetime: createMockHandler("getLifetime"),
  getChart: createMockHandler("getChart"),
  getMonthlyChart: createMockHandler("getMonthlyChart"),
  getYearlyChart: createMockHandler("getYearlyChart"),
}));

//===== (Mock Plant Controller) ======
jest.mock("./controllers/plant.controller", () => ({
  createPlant: createMockHandler("createPlant"),
  assignUserToPlantByEmail: createMockHandler("assignUserToPlantByEmail"),
  addDeviceToPlant: createMockHandler("addDeviceToPlant"),
  getPlantDeviceData: createMockHandler("getPlantDeviceData"),
  removeDeviceFromPlant: createMockHandler("removeDeviceFromPlant"),
  getPlantData: createMockHandler("getPlantData"),
  updatePlantData: createMockHandler("updatePlantData"),
  deletePlantData: createMockHandler("deletePlantData"),
  getPlantAccessData: createMockHandler("getPlantAccessData"),
  searchPlantAccessUsers: createMockHandler("searchPlantAccessUsers"),
  addPlantAccessUser: createMockHandler("addPlantAccessUser"),
  updatePlantAccessUser: createMockHandler("updatePlantAccessUser"),
  removePlantAccessUser: createMockHandler("removePlantAccessUser"),
}));

//===== (Mock MQTT) ======
jest.mock("./config/mqtt", () => ({
  publishMessage: jest.fn(),
}));

//===== (Imports) ======
const request = require("supertest");
const app = require("./app");
const { publishMessage } = require("./config/mqtt");

//===== (Route Contract Cases) ======
const routeCases = [
  ["post", "/api/auth/register", "register", false],
  ["post", "/api/auth/login", "login", false],
  ["post", "/api/auth/forgot-password", "forgotPassword", false],
  ["post", "/api/auth/verify-reset-code", "verifyResetCode", false],
  ["post", "/api/auth/reset-password", "updatePassword", false],
  ["post", "/api/data/manual/send", "sendManualPlantData", false],
  ["get", "/api/data/", "fetchDeviceData", true],
  ["get", "/api/data/chart/monthly", "getMonthlyChart", true],
  ["get", "/api/data/chart/yearly", "getYearlyChart", true],
  ["get", "/api/data/chart", "getChart", true],
  ["get", "/api/data/daily", "getDaily", true],
  ["get", "/api/data/monthly", "getMonthly", true],
  ["get", "/api/data/yearly", "getYearly", true],
  ["get", "/api/data/lifetime", "getLifetime", true],
  ["post", "/api/plant/create", "createPlant", true],
  ["post", "/api/plant/assign-user", "assignUserToPlantByEmail", true],
  ["post", "/api/plant/assign-device", "addDeviceToPlant", true],
  ["get", "/api/plant/1/access", "getPlantAccessData", true],
  ["post", "/api/plant/1/access/search", "searchPlantAccessUsers", true],
  ["post", "/api/plant/1/access", "addPlantAccessUser", true],
  ["patch", "/api/plant/1/access/2", "updatePlantAccessUser", true],
  ["delete", "/api/plant/1/access/2", "removePlantAccessUser", true],
  ["post", "/api/plant/1/device", "addDeviceToPlant", true],
  ["get", "/api/plant/1/devices", "getPlantDeviceData", true],
  ["delete", "/api/plant/1/device/device-1", "removeDeviceFromPlant", true],
  ["put", "/api/plant/1", "updatePlantData", true],
  ["delete", "/api/plant/1", "deletePlantData", true],
  ["get", "/api/plant/", "getPlantData", true],
];

//===== (Application Route Contracts) ======
describe("application route contracts", () => {
  test.each(routeCases)(
    "%s %s keeps its handler and auth contract",
    async (method, path, handler, authenticated) => {
      const response = await request(app)[method](path);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ handler, authenticated });
    },
  );
});

//===== (MQTT Publish Route Contract) ======
describe("MQTT publish route contract", () => {
  beforeEach(() => {
    publishMessage.mockClear();
  });

  test("rejects an incomplete payload", async () => {
    const response = await request(app)
      .post("/api/mqtt/publish")
      .send({ topic: "app/device/inverter" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: "error",
      message: "topic and message required",
    });
    expect(publishMessage).not.toHaveBeenCalled();
  });

  test("publishes and returns the existing response shape", async () => {
    const body = {
      topic: "app/device/inverter",
      message: "payload",
    };
    const response = await request(app).post("/api/mqtt/publish").send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "success",
      ...body,
    });
    expect(publishMessage).toHaveBeenCalledWith(body.topic, body.message);
  });
});
