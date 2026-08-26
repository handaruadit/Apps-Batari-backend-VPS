//===== (Mocks) ======
jest.mock("../sockets/socket", () => ({
  getIO: jest.fn(),
}));

jest.mock("../services/data.service", () => ({
  saveDeviceData: jest.fn(),
}));

jest.mock("./mqtt.config", () => ({
  bmsMqttConfig: {
    debugEnabled: false,
    topic: "bms_jiabaida/#",
  },
  primaryMqttConfig: {
    topics: ["app/+/baterai", "app/+/inverter"],
  },
}));

//===== (Imports) ======
const { EventEmitter } = require("events");
const { getIO } = require("../sockets/socket");
const { saveDeviceData } = require("../services/data.service");
const { bmsMqttConfig, primaryMqttConfig } = require("./mqtt.config");
const {
  registerBmsMqttHandlers,
  registerPrimaryMqttHandlers,
} = require("./mqtt.handlers");

//===== (FakeMqttClient) ======
class FakeMqttClient extends EventEmitter {
  constructor() {
    super();
    this.subscribe = jest.fn((topics, callback) => {
      if (callback) callback(null);
    });
  }
}

//===== (Test Lifecycle) ======
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

//===== (Primary MQTT Lifecycle) ======
describe("registerPrimaryMqttHandlers", () => {
  it("subscribes to every primary telemetry topic after connecting", () => {
    const client = new FakeMqttClient();
    registerPrimaryMqttHandlers(client);

    client.emit("connect");

    expect(client.subscribe).toHaveBeenCalledWith(
      primaryMqttConfig.topics,
      expect.any(Function),
    );
  });

  it("emits realtime data before persisting the parsed rows", async () => {
    const client = new FakeMqttClient();
    const room = {
      emit: jest.fn(),
    };
    const io = {
      to: jest.fn(() => room),
    };
    getIO.mockReturnValue(io);
    saveDeviceData.mockResolvedValue(undefined);
    jest.spyOn(Date, "now").mockReturnValue(123456789);
    registerPrimaryMqttHandlers(client);

    const messageHandler = client.listeners("message")[0];
    await messageHandler(
      "app/device-1/baterai",
      Buffer.from(
        JSON.stringify({
          deviceId: "device-1",
          baterai: {
            voltage: "51.2",
          },
        }),
      ),
    );

    const expectedRows = [
      {
        deviceId: "device-1",
        category: "baterai",
        type: "voltage",
        value: 51.2,
        timestamp: 123456789,
      },
    ];

    expect(io.to).toHaveBeenCalledWith("device-1");
    expect(room.emit).toHaveBeenCalledWith("mqtt_message", expectedRows);
    expect(saveDeviceData).toHaveBeenCalledWith(expectedRows);
    expect(room.emit.mock.invocationCallOrder[0]).toBeLessThan(
      saveDeviceData.mock.invocationCallOrder[0],
    );
  });
});

//===== (BMS MQTT Lifecycle) ======
describe("registerBmsMqttHandlers", () => {
  it("parses and saves a matching BMS data message", async () => {
    const client = new FakeMqttClient();

    const timestamp = new Date(
      "2026-07-30T10:15:00.000Z",
    ).getTime();

    const expectedRows = [
      {
        deviceId: "BMS_JIABAIDA",
        category: "baterai",
        type: "voltage",
        value: 52.4,
        timestamp,
      },
      {
        deviceId: "BMS_JIABAIDA",
        category: "baterai",
        type: "current",
        value: -10,
        timestamp,
      },
      {
        deviceId: "BMS_JIABAIDA",
        category: "baterai",
        type: "soc",
        value: 49,
        timestamp,
      },
      {
        deviceId: "BMS_JIABAIDA",
        category: "baterai",
        type: "power",
        value: -0.524,
        timestamp,
      },
    ];

    // Handler memeriksa jumlah baris yang dikembalikan database
    saveDeviceData.mockResolvedValue(
      expectedRows.map((row, index) => ({
        id: index + 1,
        device_id: row.deviceId,
        category: row.category,
        type: row.type,
        value: row.value,
        created_at: new Date(row.timestamp),
      })),
    );

    registerBmsMqttHandlers(client);

    const messageHandler =
      client.listeners("message")[0];

    await messageHandler(
      "bms_jiabaida/data",
      Buffer.from(
        JSON.stringify({
          device_id: "BMS_Jiabaida",
          voltage: 52.4,
          current: -10,
          soc: 49,
          waktu: "2026-07-30T10:15:00.000Z",
        }),
      ),
    );

    expect(saveDeviceData).toHaveBeenCalledTimes(1);
    expect(saveDeviceData).toHaveBeenCalledWith(
      expectedRows,
    );
  });

  it("does not save BMS status messages", async () => {
    const client = new FakeMqttClient();

    registerBmsMqttHandlers(client);

    const messageHandler =
      client.listeners("message")[0];

    await messageHandler(
      "bms_jiabaida/status",
      Buffer.from("online"),
    );

    expect(saveDeviceData).not.toHaveBeenCalled();
  });

  it("keeps the BMS client disabled when its configuration is incomplete", () => {
    registerBmsMqttHandlers(null);

    expect(console.warn).toHaveBeenCalledWith(
      "BMS MQTT disabled: BMS_MQTT_* env is incomplete",
    );

    expect(saveDeviceData).not.toHaveBeenCalled();
  });

  it("subscribes to the configured BMS topic after connecting", () => {
    const client = new FakeMqttClient();

    registerBmsMqttHandlers(client);

    client.emit("connect");

    expect(client.subscribe).toHaveBeenCalledWith(
      bmsMqttConfig.topic,
      expect.any(Function),
    );
  });
});
