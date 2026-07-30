//===== (Imports) ======
const {
  getChartDateRange,
  buildChartSeries,
  getSeriesCounts,
  buildMockChartSeries,
} = require("./chart.utils");

//===== (Chart Utilities) ======
describe("chart.utils", () => {
  it("builds the same date ranges for day, month, year, and lifetime", () => {
    expect(getChartDateRange("day", "2026-02-10")).toEqual({
      start: "2026-02-10 00:00:00",
      end: "2026-02-10 23:59:59.999",
    });
    expect(getChartDateRange("month", "2024-02")).toEqual({
      start: "2024-02-01 00:00:00",
      end: "2024-02-29 23:59:59.999",
    });
    expect(getChartDateRange("year", "2026")).toEqual({
      start: "2026-01-01 00:00:00",
      end: "2026-12-31 23:59:59.999",
    });
    expect(getChartDateRange("lifetime")).toEqual({});
  });

  it("rejects unsupported chart input with the existing error codes", () => {
    expect(() => getChartDateRange("week", "2026-02-10")).toThrow(
      "Invalid_Chart_Segment",
    );
    expect(() => getChartDateRange("day", "10-02-2026")).toThrow(
      "Invalid_Chart_Date",
    );
  });

  it("groups aliases and keeps the existing production/load fallbacks", () => {
    const series = buildChartSeries([
      {
        id: 1,
        device_id: "device-1",
        category: "solar",
        type: "power",
        value: 2000,
        unit: "W",
        created_at: "2026-02-10 12:00:00",
      },
      {
        id: 2,
        device_id: "device-1",
        category: "out",
        type: "va_power",
        value: 1.5,
        unit: "kW",
        created_at: "2026-02-10 12:00:00",
      },
    ]);

    expect(series.production[0].value).toBe(2);
    expect(series.pvGenerate).toEqual(series.production);
    expect(series.load).toEqual(series.upsLoad);
    expect(getSeriesCounts(series)).toMatchObject({
      production: 1,
      load: 1,
      upsLoad: 1,
      grid: 0,
      battery: 0,
    });
  });

  it("creates deterministic mock chart output for the same seed", () => {
    const input = { plantId: 1, segment: "month", date: "2026-02" };

    expect(buildMockChartSeries(input)).toEqual(buildMockChartSeries(input));
    expect(buildMockChartSeries(input).production).toHaveLength(28);
  });
});
