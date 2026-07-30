//===== (Mocks) ======
jest.mock("../services/data.service", () => ({
  saveBatteryPowerForPlant: jest.fn(),
}));

jest.mock("./mqtt.config", () => ({
  bmsMqttConfig: {
    deviceId: "BMS-01",
    targetPlantName: "Plant Testing",
    targetDeviceId: "TARGET-01",
  },
}));

//===== (Imports) ======
const { saveBatteryPowerForPlant } = require("../services/data.service");
const {
  calculateBatteryPowerKw,
  handleBmsBatteryPower,
} = require("./bms.service");

//===== (Test Lifecycle) ======
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

//===== (BMS Battery Persistence) ======
describe("bms.service", () => {
  it("calculates signed battery power and persists it for the configured plant", async () => {
    saveBatteryPowerForPlant.mockResolvedValue({
      device_id: "TARGET-01",
    });

    await handleBmsBatteryPower([
      {
        deviceId: "BMS-01",
        type: "voltage",
        value: 52,
      },
      {
        deviceId: "BMS-01",
        type: "current",
        value: -10,
      },
    ]);

    expect(calculateBatteryPowerKw(52, -10)).toBe(-0.52);
    expect(saveBatteryPowerForPlant).toHaveBeenCalledWith({
      plantName: "Plant Testing",
      deviceId: "TARGET-01",
      powerKw: -0.52,
    });
  });
});
