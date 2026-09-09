//===== (Imports) ======
const { CHART_ENERGY_SOURCE } = require("./constants");
const {
  getChartDateRange,
  buildChartSeries,
  getSeriesCounts,
  hasChartSeriesData,
  isMockChartEnabled,
  buildMockChartSeries,
} = require("./chart.utils");
const { getChartRows } = require("./data.repository");
const {
  getMonthlyChartData,
  getYearlyChartData,
  getLifetimeChartData,
} = require("./energy.service");

//===== (getChartData) ======
const getChartData = async ({ plantId, deviceIds, segment, date }) => {
  if (segment === "month") {
    const data = await getMonthlyChartData({ deviceIds, month: date });

    return {
      source: CHART_ENERGY_SOURCE,
      counts: { items: data.items.length },
      rowCount: data.items.length,
      range: null,
      data,
    };
  }

  if (segment === "year") {
    const data = await getYearlyChartData({ deviceIds, year: date });

    return {
      source: CHART_ENERGY_SOURCE,
      counts: { items: data.items.length },
      rowCount: data.items.length,
      range: null,
      data,
    };
  }

  if (segment === "lifetime") {
    const data = await getLifetimeChartData({ deviceIds });

    return {
      source: CHART_ENERGY_SOURCE,
      counts: { items: data.items.length },
      rowCount: data.items.length,
      range: null,
      data,
    };
  }

  const { start, end } = getChartDateRange(segment, date);
  const rows = await getChartRows({ deviceIds, start, end });
  const data = buildChartSeries(rows);
  const range = start && end ? { start, end } : null;

  if (hasChartSeriesData(data) && rows.length >= 200) {
    return {
      source: "database",
      counts: getSeriesCounts(data),
      rowCount: rows.length,
      range,
      data,
    };
  }

  // Check if date is in the future
  const nowMs = Date.now();
  const [yearStr, monthStr, dayStr] = String(date || "").split("-");
  if (yearStr && monthStr && dayStr) {
    const targetDayStartMs = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr)).getTime();
    const todayStartMs = new Date().setHours(0, 0, 0, 0);
    if (targetDayStartMs > todayStartMs) {
      // Future date: return empty series
      const emptySeries = {
        production: [],
        load: [],
        upsLoad: [],
        grid: [],
        battery: [],
        soc: [],
        pvGenerate: [],
        export: [],
        charge: [],
      };
      return {
        source: "empty_future",
        counts: getSeriesCounts(emptySeries),
        rowCount: 0,
        range,
        data: emptySeries,
      };
    }
  }

  // Pull real 5-minute telemetry directly from Deye Cloud API
  let stationId = Number(plantId);
  if (!Number.isFinite(stationId) || stationId < 100000) {
    const firstDevice = Array.isArray(deviceIds) ? deviceIds[0] : "";
    const match = String(firstDevice).match(/\d{7,10}/);
    if (match) {
      stationId = Number(match[0]);
    }
  }

  if (stationId && yearStr && monthStr && dayStr) {
    try {
      const deyeClient = require("../../integrations/deye/deye.client");
      const [y, m, d] = [Number(yearStr), Number(monthStr), Number(dayStr)];
      const startTimestamp = Math.floor(new Date(y, m - 1, d, 0, 0, 0).getTime() / 1000);
      const endTimestamp = Math.min(
        Math.floor(new Date(y, m - 1, d, 23, 59, 59).getTime() / 1000),
        Math.floor(Date.now() / 1000)
      );

      const deyeRes = await deyeClient.post("/v1.0/station/history/power", {
        stationId,
        startTimestamp,
        endTimestamp,
      });

      if (Array.isArray(deyeRes?.stationDataItems) && deyeRes.stationDataItems.length > 0) {
        const production = [];
        const load = [];
        const grid = [];
        const battery = [];
        const pvGenerate = [];
        const soc = [];

        deyeRes.stationDataItems.forEach((item, idx) => {
          const iso = new Date(item.timeStamp * 1000).toISOString();
          const pvKw = Number(((item.generationPower || 0) / 1000).toFixed(2));
          const loadKw = Number(((item.consumptionPower || 0) / 1000).toFixed(2));
          const gridKw = Number((((item.wirePower ?? item.purchasePower ?? 0)) / 1000).toFixed(2));
          const battKw = Number(((item.batteryPower || 0) / 1000).toFixed(2));
          const socVal = Number(Number(item.batterySOC ?? 0).toFixed(1));

          production.push({ id: idx, value: pvKw, created_at: iso, timestamp: item.timeStamp });
          load.push({ id: idx, value: loadKw, created_at: iso, timestamp: item.timeStamp });
          grid.push({ id: idx, value: gridKw, created_at: iso, timestamp: item.timeStamp });
          battery.push({ id: idx, value: battKw, created_at: iso, timestamp: item.timeStamp });
          pvGenerate.push({ id: idx, value: pvKw, created_at: iso, timestamp: item.timeStamp });
          soc.push({ id: idx, value: socVal, created_at: iso, timestamp: item.timeStamp });
        });

        const seriesData = {
          production,
          load,
          upsLoad: load,
          grid,
          battery,
          soc,
          pvGenerate,
          export: [],
          charge: [],
        };

        return {
          source: "deye_cloud",
          counts: getSeriesCounts(seriesData),
          rowCount: deyeRes.stationDataItems.length,
          range,
          data: seriesData,
        };
      }
    } catch (err) {
      console.warn("[ChartService] Deye history fetch fallback error:", err.message);
    }
  }

  if (hasChartSeriesData(data)) {
    return {
      source: "database",
      counts: getSeriesCounts(data),
      rowCount: rows.length,
      range,
      data,
    };
  }

  if (!isMockChartEnabled()) {
    return {
      source: "database",
      counts: getSeriesCounts(data),
      rowCount: rows.length,
      range,
      data,
    };
  }

  const mockData = buildMockChartSeries({ plantId, segment, date });

  return {
    source: "dummy",
    counts: getSeriesCounts(mockData),
    rowCount: rows.length,
    range,
    data: mockData,
  };
};

//===== (Exports) ======
module.exports = {
  getChartData,
};
