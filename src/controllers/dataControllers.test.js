//===== (Mocks) ======
jest.mock("../services/data.service", () => ({
  formatDeviceDataForResponse: jest.fn(),
  getChartData: jest.fn(),
  getDailyData: jest.fn(),
  getDeviceData: jest.fn(),
  getDeviceIdData: jest.fn(),
  getLatestEnergyData: jest.fn(),
  getLifetimeData: jest.fn(),
  getMonthlyChartData: jest.fn(),
  getMonthlyData: jest.fn(),
  getYearlyChartData: jest.fn(),
  getYearlyData: jest.fn(),
}));

jest.mock("../services/mockPlantData.service", () => ({
  sendManualPlantData: jest.fn(),
}));

//===== (Imports) ======
const dataService = require("../services/data.service");
const mockPlantDataService = require("../services/mockPlantData.service");
const {
  getChart,
  getMonthlyChart,
} = require("./dataChart.controller");
const {
  fetchDeviceData,
  getDaily,
  getYearly,
} = require("./dataTelemetry.controller");
const { sendManualPlantData } = require("./manualPlantData.controller");

//===== (createResponse) ======
const createResponse = () => {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
};

//===== (createAuthenticatedRequest) ======
const createAuthenticatedRequest = (query = {}) => ({
  query,
  user: {
    userId: 7,
    role: "user",
  },
});

//===== (Lifecycle Test) ======
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

//===== (Telemetry Controller) ======
describe("dataTelemetry.controller", () => {
  test("mempertahankan respons plantId wajib", async () => {
    const response = createResponse();

    await fetchDeviceData(createAuthenticatedRequest(), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      status: "error",
      message: "plantId is required",
    });
  });

  test("mengelompokkan telemetry dan mempertahankan metadata energi", async () => {
    const response = createResponse();
    const deviceRow = {
      category: "baterai",
      type: "voltage",
      value: 48,
    };
    const formattedRow = { ...deviceRow, unit: "V" };

    dataService.getDeviceIdData.mockResolvedValue([{ device_id: "BMS-01" }]);
    dataService.getDeviceData.mockResolvedValue([deviceRow]);
    dataService.formatDeviceDataForResponse.mockReturnValue(formattedRow);
    dataService.getLatestEnergyData.mockResolvedValue({ todayEnergy: 4.5 });

    await fetchDeviceData(
      createAuthenticatedRequest({
        plantId: "3",
        category: "baterai",
        type: "voltage,current",
        limit: "10",
      }),
      response,
    );

    expect(dataService.getDeviceData).toHaveBeenCalledWith({
      deviceIds: ["BMS-01"],
      category: "baterai",
      types: ["voltage", "current"],
      startDate: undefined,
      endDate: undefined,
      latestBy: undefined,
      limit: 10,
    });
    expect(response.json).toHaveBeenCalledWith({
      status: "success",
      count: 1,
      data: {
        baterai: {
          voltage: formattedRow,
        },
      },
      todayEnergy: 4.5,
    });
  });

  test("mempertahankan respons penolakan akses device", async () => {
    const response = createResponse();
    dataService.getDeviceIdData.mockRejectedValue(new Error("Access_Denied"));

    await getDaily(
      createAuthenticatedRequest({ plantId: "3", date: "2026-07-30" }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: "Anda tidak memiliki akses ke plant ini",
    });
  });

  test("mempertahankan pesan error yearly pada field status", async () => {
    const response = createResponse();
    dataService.getDeviceIdData.mockRejectedValue(new Error("Database_Error"));

    await getYearly(
      createAuthenticatedRequest({ plantId: "3", date: "2026" }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      status: "Database_Error",
    });
  });
});

//===== (Chart Controller) ======
describe("dataChart.controller", () => {
  test("mempertahankan respons plantId wajib pada chart", async () => {
    const response = createResponse();

    await getChart(createAuthenticatedRequest(), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      status: "error",
      message: "plantId is required",
    });
  });

  test("mempertahankan pemetaan invalid segment atau date", async () => {
    const response = createResponse();
    dataService.getDeviceIdData.mockResolvedValue([{ device_id: "BMS-01" }]);
    dataService.getChartData.mockRejectedValue(
      new Error("Invalid_Chart_Date"),
    );

    await getChart(
      createAuthenticatedRequest({
        plantId: "3",
        segment: "day",
        date: "invalid",
      }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      status: "error",
      message: "Invalid chart segment or date",
    });
  });

  test("mempertahankan validasi month sebelum query device", async () => {
    const response = createResponse();

    await getMonthlyChart(
      createAuthenticatedRequest({ plantId: "3" }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      status: "error",
      message: "month is required (Format: YYYY-MM)",
    });
    expect(dataService.getDeviceIdData).not.toHaveBeenCalled();
  });
});

//===== (Manual MockPlant Controller) ======
describe("manualPlantData.controller", () => {
  test("mempertahankan urutan validasi metric wajib", async () => {
    const response = createResponse();

    await sendManualPlantData({ body: {} }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      status: "error",
      message: "PV is required",
    });
    expect(mockPlantDataService.sendManualPlantData).not.toHaveBeenCalled();
  });

  test("mempertahankan alias, konversi metric, dan respons sukses", async () => {
    const response = createResponse();
    const serviceResult = { inserted: 9 };
    mockPlantDataService.sendManualPlantData.mockResolvedValue(serviceResult);

    await sendManualPlantData(
      {
        body: {
          plant_id: "3",
          plant_name: "Plant Testing",
          device_id: "BMS-01",
          PV: "1.2",
          Battery: "-0.5",
          Grid: "0",
          Production: "1.2",
          "UPS-load": "0.2",
          Load: "1",
          pv_generate: "8.4",
          Export: "2",
          Charge: "0.4",
          strict_plant_name: true,
          strict_device: true,
          created_at: "2026-07-30T10:00:00.000Z",
        },
      },
      response,
    );

    expect(mockPlantDataService.sendManualPlantData).toHaveBeenCalledWith({
      plantId: "3",
      plantName: "Plant Testing",
      deviceId: "BMS-01",
      strictPlantName: true,
      strictDevice: true,
      timestamp: undefined,
      createdAt: "2026-07-30T10:00:00.000Z",
      time: undefined,
      jam: undefined,
      date: undefined,
      metrics: {
        pv: 1.2,
        battery: -0.5,
        grid: 0,
        production: 1.2,
        upsLoad: 0.2,
        load: 1,
        pvGenerate: 8.4,
        export: 2,
        charge: 0.4,
      },
    });
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      status: "success",
      message: "Manual plant data sent",
      data: serviceResult,
    });
  });

  test("mempertahankan respons device target tidak ditemukan", async () => {
    const response = createResponse();
    mockPlantDataService.sendManualPlantData.mockRejectedValue(
      new Error("Device_Not_Found"),
    );

    await sendManualPlantData(
      {
        body: {
          pv: 1,
          battery: 1,
          grid: 1,
          production: 1,
          upsLoad: 1,
          load: 1,
        },
      },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      status: "error",
      message: "Device not found for target plant",
    });
  });
});
