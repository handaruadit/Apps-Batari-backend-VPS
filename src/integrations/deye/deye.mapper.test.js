const {
  getStationDeviceId,
  mapStationLatest,
  toIsoTimestamp,
  toKilowatt,
} = require("./deye.mapper");

describe("deye.mapper", () => {
  const raw = {
    generationPower: "4210",
    consumptionPower: 2830,
    gridPower: "950",
    batteryPower: "-430",
    batterySOC: "87",
    lastUpdateTime: 1_786_601_888,
    unknownRawField: "must-not-leak",
  };

  test("maps station aggregate to the five BySense telemetry rows", () => {
    expect(mapStationLatest(61_419_275, raw)).toEqual([
      { deviceId: "DEYE_STATION_61419275", category: "pv", type: "chargePower", value: 4.21, createdAt: "2026-08-13T06:18:08.000Z" },
      { deviceId: "DEYE_STATION_61419275", category: "out", type: "power", value: 2.83, createdAt: "2026-08-13T06:18:08.000Z" },
      { deviceId: "DEYE_STATION_61419275", category: "grid", type: "power", value: 0.95, createdAt: "2026-08-13T06:18:08.000Z" },
      { deviceId: "DEYE_STATION_61419275", category: "baterai", type: "power", value: -0.43, createdAt: "2026-08-13T06:18:08.000Z" },
      { deviceId: "DEYE_STATION_61419275", category: "baterai", type: "soc", value: 87, createdAt: "2026-08-13T06:18:08.000Z" },
    ]);
  });

  test("handles missing/null/string/NaN and rejects an invalid timestamp", () => {
    expect(mapStationLatest(1, {
      generationPower: null,
      consumptionPower: "not-a-number",
      batterySOC: 101,
      gridPower: "1000",
      lastUpdateTime: 1_786_601_888,
    })).toEqual([
      { deviceId: "DEYE_STATION_1", category: "grid", type: "power", value: 1, createdAt: "2026-08-13T06:18:08.000Z" },
    ]);
    expect(() => mapStationLatest(1, { lastUpdateTime: null })).toThrow(
      "Invalid_Deye_Source_Timestamp",
    );
  });

  test("uses purchase or wire power when Deye omits gridPower", () => {
    const base = {
      generationPower: 0,
      consumptionPower: 4780,
      batteryPower: -43,
      batterySOC: 19,
      lastUpdateTime: 1_786_601_888,
    };

    const fromPurchase = mapStationLatest(1, {
      ...base,
      gridPower: null,
      purchasePower: 4900,
      wirePower: 4944,
    });
    const fromWire = mapStationLatest(1, {
      ...base,
      gridPower: null,
      purchasePower: null,
      wirePower: 4944,
    });

    expect(fromPurchase.find((item) => item.category === "grid")?.value).toBe(4.9);
    expect(fromWire.find((item) => item.category === "grid")?.value).toBe(4.944);
  });

  test("normalizes W/kW/MW and seconds/milliseconds timestamps", () => {
    expect(toKilowatt("4210", "W")).toBe(4.21);
    expect(toKilowatt("4.21", "kW")).toBe(4.21);
    expect(toKilowatt("0.00421", "MW")).toBe(4.21);
    expect(toKilowatt("NaN", "W")).toBeNull();
    expect(toIsoTimestamp(1_786_601_888)).toBe("2026-08-13T06:18:08.000Z");
    expect(toIsoTimestamp(1_786_601_888_000)).toBe("2026-08-13T06:18:08.000Z");
    expect(toIsoTimestamp(null)).toBeNull();
  });

  test("validates deterministic station device identity", () => {
    expect(getStationDeviceId(61_419_275)).toBe("DEYE_STATION_61419275");
    expect(() => getStationDeviceId("bad")).toThrow("Invalid_Deye_Station_ID");
  });
});
