//===== (Imports) ======
const {
  integrateRowsToKwh,
  getDailyKwhFromRows,
  buildEnergyPayload,
} = require("./energy.utils");

//===== (Energy Utilities) ======
describe("energy.utils", () => {
  it("integrates watt samples per device into kWh", () => {
    const rows = [
      {
        id: 1,
        device_id: "device-1",
        category: "grid",
        type: "power",
        value: 1000,
        unit: "W",
        created_at: "2026-02-10 10:00:00",
      },
      {
        id: 2,
        device_id: "device-1",
        category: "grid",
        type: "power",
        value: 3000,
        unit: "W",
        created_at: "2026-02-10 11:00:00",
      },
    ];

    expect(integrateRowsToKwh(rows)).toBe(2);
  });

  it("uses existing metric aliases and totals daily energy", () => {
    const timestampRows = (category, type, first, second) => [
      {
        id: `${category}-${type}-1`,
        device_id: "device-1",
        category,
        type,
        value: first,
        unit: "kW",
        created_at: "2026-02-10 10:00:00",
      },
      {
        id: `${category}-${type}-2`,
        device_id: "device-1",
        category,
        type,
        value: second,
        unit: "kW",
        created_at: "2026-02-10 11:00:00",
      },
    ];
    const energy = getDailyKwhFromRows([
      ...timestampRows("pv", "charge_power", 2, 2),
      ...timestampRows("grid", "power", 1, 1),
      ...timestampRows("baterai", "power", -0.5, -0.5),
    ]);

    expect(energy).toMatchObject({
      pvKwh: 2,
      gridKwh: 1,
      batteryKwh: 0.5,
      totalConsumptionKwh: 3.5,
    });
  });

  it("keeps energy response fields and percentage calculations stable", () => {
    expect(
      buildEnergyPayload({
        consumptionKwh: 2,
        batteryKwh: 1,
        gridKwh: 1,
        pvGenerateKwh: 3,
        exportKwh: 1,
      }),
    ).toEqual({
      energy: {
        consumptionKwh: 2,
        batteryKwh: 1,
        gridKwh: 1,
        totalKwh: 4,
      },
      energyPercent: {
        batteryPercent: 25,
        consumptionPercent: 50,
        gridPercent: 25,
      },
      productionEnergy: {
        pvGenerateKwh: 3,
        exportKwh: 1,
        chargeKwh: 0,
        totalProductionKwh: 4,
      },
      productionEnergyPercent: {
        pvGeneratePercent: 75,
        exportPercent: 25,
        chargePercent: 0,
      },
    });
  });
});
