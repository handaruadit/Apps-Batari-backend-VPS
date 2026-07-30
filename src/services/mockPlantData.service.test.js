//===== (Imports) ======
const {
  buildAutomaticMetrics,
  buildManualPlantDataRows,
  parseRequestedTimestamp,
} = require("./mockPlantData.service");

//===== (MockPlantData Service) ======
describe("mockPlantData.service", () => {
  it("builds nine telemetry rows that match the frontend mapping", () => {
    const timestamp = new Date("2026-04-27T05:00:00.000Z");
    const rows = buildManualPlantDataRows(
      "mock-device-1",
      {
        pv: 4.23,
        battery: -1.2,
        grid: 0.8,
        production: 3.75,
        pvGenerate: 4.1,
        export: 0.9,
        charge: 1.3,
        upsLoad: 2.4,
        load: 1.9,
      },
      timestamp
    );

    expect(rows).toHaveLength(9);
    expect(rows).toEqual([
      expect.objectContaining({
        deviceId: "mock-device-1",
        category: "grid",
        type: "power",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "baterai",
        type: "power",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "pv",
        type: "power",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "pv",
        type: "chargePower",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "out",
        type: "vaPower",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "out",
        type: "power",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "production",
        type: "pvGenerate",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "production",
        type: "export",
        createdAt: timestamp,
      }),
      expect.objectContaining({
        category: "production",
        type: "charge",
        createdAt: timestamp,
      }),
    ]);

    rows.forEach((row) => {
      expect(typeof row.value).toBe("number");
      expect(Number.isFinite(row.value)).toBe(true);
    });
  });

  it("parses time-only input into the requested local date and hour", () => {
    const timestamp = parseRequestedTimestamp({
      date: "2026-04-27",
      time: "14:35:20",
    });

    expect(timestamp.getFullYear()).toBe(2026);
    expect(timestamp.getMonth()).toBe(3);
    expect(timestamp.getDate()).toBe(27);
    expect(timestamp.getHours()).toBe(14);
    expect(timestamp.getMinutes()).toBe(35);
    expect(timestamp.getSeconds()).toBe(20);
  });

  it("produces solar output during daytime and zero production at night", () => {
    const midday = buildAutomaticMetrics(new Date("2026-04-27T05:00:00.000Z"), {
      timeZone: "Asia/Jakarta",
      random: () => 0.5,
    });
    const night = buildAutomaticMetrics(new Date("2026-04-27T19:00:00.000Z"), {
      timeZone: "Asia/Jakarta",
      random: () => 0.5,
    });

    expect(midday.production).toBeGreaterThan(0);
    expect(midday.pv).toBeGreaterThanOrEqual(midday.production);
    expect(midday.pvGenerate).toBeGreaterThan(0);
    expect(midday.charge).toBeGreaterThan(0);
    expect(night.production).toBe(0);
    expect(night.pv).toBe(0);
    expect(night.pvGenerate).toBe(0);
    expect(night.export).toBe(0);
    expect(night.charge).toBe(0);
  });
});

