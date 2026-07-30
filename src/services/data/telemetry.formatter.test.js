//===== (Imports) ======
const {
  normalizePowerKw,
  roundPowerKw,
  formatDeviceDataForResponse,
} = require("./telemetry.formatter");

//===== (Telemetry Formatter) ======
describe("telemetry.formatter", () => {
  it("normalizes watt values to kilowatts without changing explicit kW values", () => {
    expect(normalizePowerKw(2500, { unit: "W" })).toBe(2.5);
    expect(normalizePowerKw(2.5, { unit: "kW" })).toBe(2.5);
    expect(normalizePowerKw("invalid", { unit: "W" })).toBeNull();
  });

  it("keeps the existing rounding behavior for power responses", () => {
    expect(roundPowerKw(1.23456)).toBe(1.235);
    expect(roundPowerKw(0.0004)).toBe(0);
    expect(roundPowerKw("invalid")).toBe(0);
  });

  it("formats power aliases while preserving non-power values", () => {
    expect(
      formatDeviceDataForResponse({
        category: "battery",
        type: "power",
        value: 1500,
        unit: "W",
      }).value,
    ).toBe(1.5);

    expect(
      formatDeviceDataForResponse({
        category: "battery",
        type: "soc",
        value: "85",
      }).value,
    ).toBe("85");
  });
});
