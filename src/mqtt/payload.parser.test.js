//===== (Imports) ======
const {
  parsePayloadRows,
  parseValue,
  previewPayload,
  topicMatchesSubscription,
} = require("./payload.parser");

//===== (MQTT Payload Parser) ======
describe("payload.parser", () => {
  it("converts supported primitive values without changing parser behavior", () => {
    expect(parseValue(12.5)).toBe(12.5);
    expect(parseValue("12.5")).toBe(12.5);
    expect(parseValue(true)).toBe(1);
    expect(parseValue(false)).toBe(0);
    expect(parseValue("")).toBeNull();
    expect(parseValue(null)).toBeNull();
    expect(parseValue("not-a-number")).toBeNull();
  });

  it("parses a flat telemetry payload and keeps its requested timestamp", () => {
    const rows = parsePayloadRows({
      device_id: "device-1",
      category: "grid",
      type: "power",
      value: "1500",
      created_at: "2026-07-30T10:15:00.000Z",
    });

    expect(rows).toEqual([
      {
        deviceId: "device-1",
        category: "grid",
        type: "power",
        value: 1500,
        timestamp: new Date("2026-07-30T10:15:00.000Z").getTime(),
      },
    ]);
  });

  it("flattens nested metrics and expands array values with one timestamp", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(123456789);

    const rows = parsePayloadRows({
      deviceId: "device-2",
      baterai: {
        voltage: "51.2",
        enabled: true,
        cell_voltages: [3.2, "3.3", null],
      },
    });

    expect(rows).toEqual([
      {
        deviceId: "device-2",
        category: "baterai",
        type: "voltage",
        value: 51.2,
        timestamp: 123456789,
      },
      {
        deviceId: "device-2",
        category: "baterai",
        type: "enabled",
        value: 1,
        timestamp: 123456789,
      },
      {
        deviceId: "device-2",
        category: "baterai",
        type: "cell_voltages_1",
        value: 3.2,
        timestamp: 123456789,
      },
      {
        deviceId: "device-2",
        category: "baterai",
        type: "cell_voltages_2",
        value: 3.3,
        timestamp: 123456789,
      },
      {
        deviceId: "device-2",
        category: "baterai",
        type: "cell_voltages_3",
        value: null,
        timestamp: 123456789,
      },
    ]);

    nowSpy.mockRestore();
  });

  it("matches MQTT single-level and multi-level wildcard subscriptions", () => {
    expect(
      topicMatchesSubscription("app/+/baterai", "app/device-1/baterai"),
    ).toBe(true);
    expect(
      topicMatchesSubscription("app/+/baterai", "app/device-1/inverter"),
    ).toBe(false);
    expect(topicMatchesSubscription("bms/#", "bms/site/device/data")).toBe(
      true,
    );
    expect(topicMatchesSubscription("bms/#/data", "bms/site/data")).toBe(
      false,
    );
  });

  it("returns an empty row set without a device id and truncates previews", () => {
    expect(parsePayloadRows({ grid: { power: 1 } })).toEqual([]);
    expect(previewPayload(Buffer.from("123456789"), 5)).toBe("12345...");
    expect(previewPayload(Buffer.from("123"), 5)).toBe("123");
  });
});
