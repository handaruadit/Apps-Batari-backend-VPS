//===== (Fake MQTT Client) ======
const mockPrimaryClient = {
  connected: true,
  publish: jest.fn((topic, message, options, callback) => callback(null)),
};

//===== (Mocks) ======
jest.mock("mqtt", () => ({
  connect: jest.fn(() => mockPrimaryClient),
}));

jest.mock("./mqtt.config", () => ({
  bmsMqttConfig: {
    clientId: undefined,
    host: undefined,
    password: undefined,
    port: undefined,
    protocol: undefined,
    topic: undefined,
    username: undefined,
  },
  createClientOptions: jest.fn(() => ({
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  })),
  createConnectUrl: jest.fn(() => "mqtt://broker.test:1883"),
  isBmsMqttConfigured: jest.fn(() => false),
  primaryMqttConfig: {
    clientId: "primary-client",
    host: "broker.test",
    password: "secret",
    port: "1883",
    protocol: "mqtt",
    topics: ["app/+/baterai", "app/+/inverter"],
    username: "tester",
  },
}));

jest.mock("./mqtt.handlers", () => ({
  registerBmsMqttHandlers: jest.fn(),
  registerPrimaryMqttHandlers: jest.fn(),
}));

//===== (Imports) ======
const mqtt = require("mqtt");
const {
  registerBmsMqttHandlers,
  registerPrimaryMqttHandlers,
} = require("./mqtt.handlers");

//===== (Test State) ======
let bmsClient;
let client;
let publishMessage;

//===== (Test Lifecycle) ======
beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  ({ bmsClient, client, publishMessage } = require("./mqtt.client"));
});

beforeEach(() => {
  mockPrimaryClient.connected = true;
  mockPrimaryClient.publish.mockClear();
});

afterAll(() => {
  jest.restoreAllMocks();
});

//===== (MQTT Client Lifecycle) ======
describe("mqtt.client", () => {
  it("does not create a BMS client when the BMS environment is incomplete", () => {
    expect(client).toBe(mockPrimaryClient);
    expect(bmsClient).toBeNull();
    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect(registerPrimaryMqttHandlers).toHaveBeenCalledWith(mockPrimaryClient);
    expect(registerBmsMqttHandlers).toHaveBeenCalledWith(null);
  });

  it("publishes messages with QoS 1", () => {
    publishMessage("app/device-1/command", "turn-on");

    expect(mockPrimaryClient.publish).toHaveBeenCalledWith(
      "app/device-1/command",
      "turn-on",
      { qos: 1 },
      expect.any(Function),
    );
  });
});
