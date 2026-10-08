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

// Cache for Deye Cloud historical chart responses to maintain sub-second response times
const deyeChartCache = new Map();
const DEYE_CHART_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const getCachedDeyeChart = (key) => {
  const entry = deyeChartCache.get(key);
  if (entry && Date.now() - entry.timestamp < DEYE_CHART_CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
};

const setCachedDeyeChart = (key, data) => {
  deyeChartCache.set(key, { timestamp: Date.now(), data });
};

// Helper to resolve authentic Deye station ID
const resolveStationId = async (plantId, deviceIds) => {
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
  return stationId;
};

//===== (getChartData) ======
const getChartData = async ({ plantId, deviceIds, segment, date }) => {
  // 1. Resolve authentic Deye Cloud Station ID
  const stationId = await resolveStationId(plantId, deviceIds);

  // 2. Prioritize authentic Deye Cloud historical data for Deye stations on Month / Year / Lifetime
  if (stationId && stationId >= 100000) {
    const deyeClient = require("../../integrations/deye/deye.client");

    if (segment === "month") {
      const now = new Date();
      let y = now.getFullYear();
      let m = now.getMonth() + 1;
      const parts = String(date || "").split("-");
      if (parts[0] && parts[1]) {
        y = Number(parts[0]);
        m = Number(parts[1]);
      }
      const yStr = String(y);
      const mStr = String(m).padStart(2, "0");
      const daysInMonth = new Date(y, m, 0).getDate();
      const cacheKey = `month_${stationId}_${yStr}-${mStr}`;
      const cached = getCachedDeyeChart(cacheKey);
      if (cached) return cached;

      try {
        const startAt = `${yStr}-${mStr}-01`;
        const endAt = `${yStr}-${mStr}-${String(daysInMonth).padStart(2, "0")}`;
        const deyeRes = await deyeClient.post("/v1.0/station/history", {
          stationId,
          granularity: 2,
          startAt,
          endAt,
        });

        const rawItems = deyeRes?.stationDataItems || [];
        const itemsByDay = new Map();
        rawItems.forEach(it => {
          if (it.day) itemsByDay.set(it.day, it);
        });

        const items = Array.from({ length: daysInMonth }, (_, idx) => {
          const day = idx + 1;
          const it = itemsByDay.get(day);
          const dStr = `${yStr}-${mStr}-${String(day).padStart(2, "0")}`;
          const gen = Number(Number(it?.generationValue || 0).toFixed(2));
          const cons = Number(Number(it?.consumptionValue || 0).toFixed(2));
          const grid = Number(Number(it?.gridValue || 0).toFixed(2));
          const charge = Number(Number(it?.chargeValue || 0).toFixed(2));
          return {
            day,
            label: String(day),
            date: dStr,
            pv: gen,
            production: gen,
            load: cons,
            grid,
            battery: charge,
            pvGenerate: gen,
          };
        });

        const resultData = {
          unit: "kWh",
          source: "deye_cloud_history",
          items,
        };
        const response = {
          source: "deye_cloud_history",
          counts: { items: items.length },
          rowCount: items.length,
          range: null,
          data: resultData,
        };
        setCachedDeyeChart(cacheKey, response);
        return response;
      } catch (err) {
        console.warn("[ChartService] Deye monthly history error:", err.message);
      }
    }

    if (segment === "year") {
      const now = new Date();
      let y = now.getFullYear();
      const parts = String(date || "").split("-");
      if (parts[0]) y = Number(parts[0]);
      const yStr = String(y);
      const cacheKey = `year_${stationId}_${yStr}`;
      const cached = getCachedDeyeChart(cacheKey);
      if (cached) return cached;

      try {
        const startAt = `${yStr}-01`;
        const endAt = `${yStr}-12`;
        const deyeRes = await deyeClient.post("/v1.0/station/history", {
          stationId,
          granularity: 3,
          startAt,
          endAt,
        });

        const rawItems = deyeRes?.stationDataItems || [];
        const itemsByMonth = new Map();
        rawItems.forEach(it => {
          if (it.month) itemsByMonth.set(it.month, it);
        });

        const items = Array.from({ length: 12 }, (_, idx) => {
          const monthNum = idx + 1;
          const it = itemsByMonth.get(monthNum);
          const gen = Number(Number(it?.generationValue || 0).toFixed(2));
          const cons = Number(Number(it?.consumptionValue || 0).toFixed(2));
          const grid = Number(Number(it?.gridValue || 0).toFixed(2));
          const charge = Number(Number(it?.chargeValue || 0).toFixed(2));
          return {
            month: monthNum,
            label: String(monthNum),
            pv: gen,
            production: gen,
            load: cons,
            grid,
            battery: charge,
            pvGenerate: gen,
          };
        });

        const resultData = {
          unit: "kWh",
          source: "deye_cloud_history",
          items,
        };
        const response = {
          source: "deye_cloud_history",
          counts: { items: items.length },
          rowCount: items.length,
          range: null,
          data: resultData,
        };
        setCachedDeyeChart(cacheKey, response);
        return response;
      } catch (err) {
        console.warn("[ChartService] Deye yearly history error:", err.message);
      }
    }

    if (segment === "lifetime") {
      const now = new Date();
      const currentYear = now.getFullYear();
      const cacheKey = `lifetime_${stationId}_${currentYear}`;
      const cached = getCachedDeyeChart(cacheKey);
      if (cached) return cached;

      try {
        const deyeRes = await deyeClient.post("/v1.0/station/history", {
          stationId,
          granularity: 4,
          startAt: "2020",
          endAt: String(currentYear),
        });

        const rawItems = deyeRes?.stationDataItems || [];
        const items = rawItems
          .filter(it => it.year > 0)
          .sort((a, b) => a.year - b.year)
          .map(it => {
            const gen = Number(Number(it.generationValue || 0).toFixed(2));
            const cons = Number(Number(it.consumptionValue || 0).toFixed(2));
            const grid = Number(Number(it.gridValue || 0).toFixed(2));
            const charge = Number(Number(it.chargeValue || 0).toFixed(2));
            return {
              year: it.year,
              label: String(it.year),
              pv: gen,
              production: gen,
              load: cons,
              grid,
              battery: charge,
              pvGenerate: gen,
            };
          });

        const resultData = {
          unit: "kWh",
          source: "deye_cloud_history",
          items,
        };
        const response = {
          source: "deye_cloud_history",
          counts: { items: items.length },
          rowCount: items.length,
          range: null,
          data: resultData,
        };
        setCachedDeyeChart(cacheKey, response);
        return response;
      } catch (err) {
        console.warn("[ChartService] Deye lifetime history error:", err.message);
      }
    }
  }

  // 3. Fallback for non-Deye stations: query existing energy service
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

  // 4. Intraday (Day segment)
  const { start, end } = getChartDateRange(segment, date);
  const range = start && end ? { start, end } : null;

  // Check if date is in the future
  const [yearStr, monthStr, dayStr] = String(date || "").split("-");
  if (yearStr && monthStr && dayStr) {
    const targetDayStartMs = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr)).getTime();
    const todayStartMs = new Date().setHours(0, 0, 0, 0);
    if (targetDayStartMs > todayStartMs) {
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

  // Prioritize authentic Deye Cloud telemetry for Deye operational stations on Day segment
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

  // 5. Fallback to database telemetry rows if not a Deye station or Deye Cloud has no data
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
