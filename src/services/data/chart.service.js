//===== (Imports) ======
const { CHART_ENERGY_SOURCE } = require("./constants");
const {
  getChartDateRange,
  buildChartSeries,
  getSeriesCounts,
  hasChartSeriesData,
  isMockChartEnabled,
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
  const range = start && end ? { start, end } : null;

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

  // 1. Resolve authentic Deye Cloud Station ID
  const ID_ALIASES = {
    62566372: 62506492,
    62566373: 62448210,
    62566374: 62435287,
    62566375: 62433430,
  };
  let stationId = ID_ALIASES[Number(plantId)] || Number(plantId);
  if (!Number.isFinite(stationId) || stationId < 100000) {
    try {
      const db = require("../../config/db");
      const integration = await db("deye_integrations")
        .where("plant_id", String(plantId))
        .orWhere("station_id", String(plantId))
        .first("station_id");
      if (integration?.station_id) {
        stationId = ID_ALIASES[Number(integration.station_id)] || Number(integration.station_id);
      }
    } catch (_) {}
  }
  if (!Number.isFinite(stationId) || stationId < 100000) {
    const firstDevice = Array.isArray(deviceIds) ? (typeof deviceIds[0] === "object" ? deviceIds[0].device_id : deviceIds[0]) : "";
    const deyeStationMatch = String(firstDevice).match(/^DEYE_STATION_(\d+)/i);
    if (deyeStationMatch) {
      stationId = ID_ALIASES[Number(deyeStationMatch[1])] || Number(deyeStationMatch[1]);
    }
  }

  // 2. Prioritize authentic Deye Cloud telemetry for Deye operational stations
  if (stationId && stationId >= 100000 && yearStr && monthStr && dayStr) {
    try {
      const deyeClient = require("../../integrations/deye/deye.client");
      const [y, m, d] = [Number(yearStr), Number(monthStr), Number(dayStr)];
      const yyyy = String(y);
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const startTimestamp = Math.floor(new Date(`${yyyy}-${mm}-${dd}T00:00:00+07:00`).getTime() / 1000);
      const endTimestamp = Math.min(
        Math.floor(new Date(`${yyyy}-${mm}-${dd}T23:59:59+07:00`).getTime() / 1000),
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
          const rawGrid = item.wirePower != null ? item.wirePower : (item.gridPower != null ? item.gridPower : (item.purchasePower != null ? item.purchasePower : 0));
          const gridKw = Number((Number(rawGrid || 0) / 1000).toFixed(2));
          const battKw = Number(((item.batteryPower || 0) / 1000).toFixed(2));
          const socVal = Number(Number(item.batterySOC ?? 0).toFixed(1));

          production.push({ id: idx, value: pvKw, created_at: iso, timestamp: item.timeStamp * 1000 });
          load.push({ id: idx, value: loadKw, created_at: iso, timestamp: item.timeStamp * 1000 });
          grid.push({ id: idx, value: gridKw, created_at: iso, timestamp: item.timeStamp * 1000 });
          battery.push({ id: idx, value: battKw, created_at: iso, timestamp: item.timeStamp * 1000 });
          pvGenerate.push({ id: idx, value: loadKw, created_at: iso, timestamp: item.timeStamp * 1000 });
          soc.push({ id: idx, value: socVal, created_at: iso, timestamp: item.timeStamp * 1000 });
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
      console.warn("[ChartService] Deye history fetch error:", err.message);
    }
  }

  // 3. Fallback to database telemetry rows if not a Deye station or Deye Cloud has no data
  const rows = await getChartRows({ deviceIds, start, end });
  const data = buildChartSeries(rows);
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

  const emptyData = {
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
    source: "no_data",
    counts: getSeriesCounts(emptyData),
    rowCount: 0,
    range,
    data: emptyData,
  };
};

//===== (Exports) ======
module.exports = {
  getChartData,
};
