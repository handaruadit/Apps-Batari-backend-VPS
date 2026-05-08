const db = require("../config/db");

const normalizeCreatedAt = (value) => {
  if (!value) {
    return undefined;
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
};

const CHART_CATEGORY_ALIASES = {
  pv: ["pv", "solar"],
  grid: ["grid"],
  battery: ["battery", "baterai"],
  load: ["load", "out"],
};

const CHART_TYPE_ALIASES = {
  power: ["power"],
  chargePower: ["chargePower", "charge_power", "chargepower"],
  vaPower: ["vaPower", "va_power", "vapower"],
};

const CHART_ALLOWED_SEGMENTS = ["day", "month", "year", "lifetime"];

const CHART_SERIES_CONFIG = {
  production: { category: "pv", type: "chargePower" },
  load: { category: "out", type: "power" },
  upsLoad: { category: "out", type: "vaPower" },
  grid: { category: "grid", type: "power" },
  battery: { category: "baterai", type: "power" },
};

const DEFAULT_MOCK_CHART_POINTS_PER_DAY = 180;

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[-_\s]+/g, "")
    .toLowerCase();

const matchesAlias = (value, aliases) => {
  const normalizedValue = normalizeText(value);
  return aliases.some((alias) => normalizeText(alias) === normalizedValue);
};

const padChartTwo = (value) => String(value).padStart(2, "0");

const formatDbTimestamp = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
}) => {
  const milliseconds =
    millisecond > 0 ? `.${String(millisecond).padStart(3, "0")}` : "";

  return `${year}-${padChartTwo(month)}-${padChartTwo(day)} ${padChartTwo(
    hour
  )}:${padChartTwo(minute)}:${padChartTwo(second)}${milliseconds}`;
};

const getChartDateRange = (segment, date) => {
  if (!CHART_ALLOWED_SEGMENTS.includes(segment)) {
    throw new Error("Invalid_Chart_Segment");
  }

  if (segment === "lifetime") {
    return {};
  }

  if (segment === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      throw new Error("Invalid_Chart_Date");
    }

    return {
      start: `${date} 00:00:00`,
      end: `${date} 23:59:59.999`,
    };
  }

  if (segment === "month") {
    if (!/^\d{4}-\d{2}$/.test(String(date || ""))) {
      throw new Error("Invalid_Chart_Date");
    }

    const [year, month] = String(date).split("-").map(Number);

    return {
      start: formatDbTimestamp({ year, month, day: 1 }),
      end: formatDbTimestamp({
        year,
        month,
        day: new Date(year, month, 0).getDate(),
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999,
      }),
    };
  }

  if (!/^\d{4}$/.test(String(date || ""))) {
    throw new Error("Invalid_Chart_Date");
  }

  const year = Number(date);

  return {
    start: formatDbTimestamp({ year, month: 1, day: 1 }),
    end: formatDbTimestamp({
      year,
      month: 12,
      day: 31,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    }),
  };
};

const formatChartRow = (row) => ({
  id: row.id,
  device_id: row.device_id,
  category: row.category,
  type: row.type,
  value: row.value === null || row.value === undefined ? null : Number(row.value),
  created_at: row.created_at,
});

const buildChartSeries = (rows) => {
  const productionRows = [];
  const pvPowerRows = [];
  const loadRows = [];
  const upsLoadRows = [];
  const gridRows = [];
  const batteryRows = [];

  rows.forEach((row) => {
    const formattedRow = formatChartRow(row);

    if (matchesAlias(row.category, CHART_CATEGORY_ALIASES.pv)) {
      if (matchesAlias(row.type, CHART_TYPE_ALIASES.chargePower)) {
        productionRows.push(formattedRow);
      }

      if (matchesAlias(row.type, CHART_TYPE_ALIASES.power)) {
        pvPowerRows.push(formattedRow);
      }
    }

    if (
      matchesAlias(row.category, CHART_CATEGORY_ALIASES.load) &&
      matchesAlias(row.type, CHART_TYPE_ALIASES.power)
    ) {
      loadRows.push(formattedRow);
    }

    if (
      matchesAlias(row.category, CHART_CATEGORY_ALIASES.load) &&
      matchesAlias(row.type, CHART_TYPE_ALIASES.vaPower)
    ) {
      upsLoadRows.push(formattedRow);
    }

    if (
      matchesAlias(row.category, CHART_CATEGORY_ALIASES.grid) &&
      matchesAlias(row.type, CHART_TYPE_ALIASES.power)
    ) {
      gridRows.push(formattedRow);
    }

    if (
      matchesAlias(row.category, CHART_CATEGORY_ALIASES.battery) &&
      matchesAlias(row.type, CHART_TYPE_ALIASES.power)
    ) {
      batteryRows.push(formattedRow);
    }
  });

  return {
    production: productionRows.length ? productionRows : pvPowerRows,
    load: loadRows.length ? loadRows : upsLoadRows,
    upsLoad: upsLoadRows.length ? upsLoadRows : loadRows,
    grid: gridRows,
    battery: batteryRows,
  };
};

const getSeriesCounts = (series) =>
  Object.keys(CHART_SERIES_CONFIG).reduce((counts, key) => {
    counts[key] = Array.isArray(series[key]) ? series[key].length : 0;
    return counts;
  }, {});

const hasChartSeriesData = (series) =>
  Object.values(getSeriesCounts(series)).some((count) => count > 0);

const isMockChartEnabled = () => process.env.MOCK_CHART_ENABLED === "true";

const getMockPointsPerDay = () => {
  const value = Number(process.env.MOCK_CHART_POINTS_PER_DAY);

  if (!Number.isInteger(value) || value <= 0) {
    return DEFAULT_MOCK_CHART_POINTS_PER_DAY;
  }

  return value;
};

const hashSeed = (value) => {
  let hash = 2166136261;
  const text = String(value);

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createSeededRandom = (seedText) => {
  let state = hashSeed(seedText) || 1;

  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
};

const roundTwo = (value) => Number(value.toFixed(2));

const addNoise = (value, range, random) => {
  const noise = (random() - 0.5) * range;
  return value + noise;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const padTwo = (value) => String(value).padStart(2, "0");

const formatLocalTimestamp = ({ year, month, day, hour = 0, minute = 0, second = 0 }) =>
  `${year}-${padTwo(month)}-${padTwo(day)}T${padTwo(hour)}:${padTwo(minute)}:${padTwo(second)}`;

const buildMockDatePoints = (segment, date) => {
  if (segment === "day") {
    const pointCount = getMockPointsPerDay();
    const maxIndex = Math.max(pointCount - 1, 1);
    const [year, month, day] = String(date).split("-").map(Number);

    return Array.from({ length: pointCount }, (_, index) => {
      const seconds = Math.round((index / maxIndex) * 86399);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return {
        created_at: formatLocalTimestamp({
          year,
          month,
          day,
          hour: hours,
          minute: minutes,
          second: secs,
        }),
        dayProgress: seconds / 86399,
      };
    });
  }

  if (segment === "month") {
    const [year, month] = String(date).split("-").map(Number);
    const dayCount = getDaysInMonth(year, month);

    return Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      return {
        created_at: formatLocalTimestamp({ year, month, day, hour: 12 }),
        dayProgress: 0.5,
      };
    });
  }

  if (segment === "year") {
    const year = Number(date);

    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const monthProgress = index / 11;
      const seasonalSun = Math.sin(Math.PI * monthProgress);
      return {
        created_at: formatLocalTimestamp({ year, month, day: 15, hour: 12 }),
        dayProgress: 0.5,
        seasonalSun,
      };
    });
  }

  const endYear = /^\d{4}$/.test(String(date || "")) ? Number(date) : 2026;

  return Array.from({ length: 5 }, (_, index) => {
    const year = endYear - 4 + index;
    return {
      created_at: formatLocalTimestamp({ year, month: 7, day: 1, hour: 12 }),
      dayProgress: 0.5,
      lifetimeProgress: index / 4,
    };
  });
};

const getProductionValue = (point, random) => {
  const daylightProgress = (point.dayProgress - 0.25) / 0.5;

  if (daylightProgress <= 0 || daylightProgress >= 1) {
    return 0;
  }

  const daylight = Math.sin(Math.PI * daylightProgress);
  const shaped = daylight ** 1.8;
  const seasonal = point.seasonalSun === undefined ? 1 : 0.45 + point.seasonalSun * 0.55;
  return roundTwo(clamp(addNoise(shaped * 5 * seasonal, 0.25, random), 0, 5));
};

const getMockValue = (seriesKey, point, random) => {
  if (seriesKey === "production") {
    return getProductionValue(point, random);
  }

  const wave = (Math.sin(Math.PI * 2 * point.dayProgress - Math.PI / 3) + 1) / 2;

  if (seriesKey === "battery") {
    return roundTwo(clamp(addNoise((wave - 0.5) * 4, 0.35, random), -2, 2));
  }

  if (seriesKey === "grid") {
    return roundTwo(clamp(addNoise(0.5 + wave * 4.5, 0.45, random), 0.5, 5));
  }

  return roundTwo(clamp(addNoise(0.5 + wave * 2.5, 0.25, random), 0.5, 3));
};

const buildMockChartSeries = ({ plantId, segment, date }) => {
  const points = buildMockDatePoints(segment, date);
  const series = {};

  Object.entries(CHART_SERIES_CONFIG).forEach(([seriesKey, config]) => {
    const random = createSeededRandom(`${plantId}:${segment}:${date || ""}:${seriesKey}`);

    series[seriesKey] = points.map((point) => ({
      category: config.category,
      type: config.type,
      value: getMockValue(seriesKey, point, random),
      created_at: point.created_at,
    }));
  });

  return series;
};

// Fungsi Simpan Data Device ke Database
const saveDeviceData = async (data) => {
  try {
    const rows = Array.isArray(data) ? data : [data];

    // MAP KE FORMAT DB
    const formatted = rows.map((d) => {
      const createdAt = normalizeCreatedAt(d.createdAt || d.timestamp);

      return {
        device_id: d.deviceId,
        category: d.category,
        type: d.type,
        value: d.value,
        ...(createdAt ? { created_at: createdAt } : {}),
      };
    });

    await db("device_data").insert(formatted);

  } catch (err) {
    console.error("❌ DB Insert Error:", err.message);
  }
};

// Fungsi Ambil Data Device untuk API Endpoint
const getDeviceData = async (filters) => {
  try {
    let query = db("device_data").select("*");
    let countData = 1;

    // FILTER DEVICE_ID
    if (filters.deviceIds) {
      query = query.whereIn("device_id", filters.deviceIds);
    }

    // FILTER KATEGORI
    if (filters.category) {
      query = query.where("category", filters.category);
    }

    // FILTER TYPE (SINGLE / MULTIPLE)
    if (filters.types?.length) {
      query = query.whereIn("type", filters.types);
      countData = filters.types.length*filters.deviceIds.length;
    }

    // FILTER RANGE HARI
    if (filters.startDate && filters.endDate) {
      query = query.whereBetween("created_at", [
        filters.startDate,
        filters.endDate,
      ]);
    }

    // SORT DATA TERBARU
    if (filters.latestBy === "inserted") {
      query = query.orderBy("id", "desc");
    } else {
      query = query.orderBy("created_at", "desc");
    }

    // DEFAULT LIMIT
    query = query.limit(filters.limit || countData);

    return await query;

  } catch (err) {console.error("❌ DB Fetch Error:", err.message);
    return [];
  }
};

// Fungsi Ambil Data Harian untuk Dashboard
const getDailyData = async ({ deviceId, date, category, types }) => {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59");

    let query = db("device_data")
        .whereIn("device_id", deviceId)
        .whereBetween("created_at", [start, end]);

    if (category) {
        query = query.where("category", category);
    }

    if (types && types.length > 0) {
        query = query.whereIn("type", types);
    }

    return await query.orderBy("created_at", "asc");
};

// Fungsi Ambil Data Bulanan untuk Dashboard
const getMonthlyData = async ({ deviceId, month, category, types }) => {
    const start = `${month}-01`;
    const end = `${month}-31`;
    
    let query = db("device_data")
        .select(
            db.raw("TO_CHAR(created_at, 'YYYY-MM-DD') as date"),
            "category",
            "type",
            db.raw("SUM(value::numeric) as sum"),
            db.raw("ROUND(AVG(value::numeric), 2) as avg"), 
            db.raw("MAX(value::numeric) as max"), 
            db.raw("MIN(value::numeric) as min")
        ).whereIn("device_id", deviceId)
        .whereBetween("created_at", [start, end]);

    if (category) {
        query = query.where("category", category);
    }

    if (types && types.length > 0) {
        query = query.whereIn("type", types);
    }

    return await query
        .groupBy("date", "category", "type")
        .orderBy(["date", "category", "type"]);
};

// Fungsi Ambil Data Tahunan untuk Dashboard
const getYearlyData = async ({ deviceId, year, category, types }) => {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    let query = db("device_data")
        .select(
            db.raw("TO_CHAR(created_at, 'YYYY-MM') as month"),
            "category",
            "type",
            db.raw("SUM(value::numeric) as sum"),
            db.raw("ROUND(AVG(value::numeric), 2) as avg"), 
            db.raw("MAX(value::numeric) as max"), 
            db.raw("MIN(value::numeric) as min")
        ).whereIn("device_id", deviceId)
        .whereBetween("created_at", [start, end]);

    if (category) {
        query = query.where("category", category);
    }

    if (types && types.length > 0) {
        query = query.whereIn("type", types);
    }

    return await query
        .groupBy("month", "category", "type")
        .orderBy(["month", "category", "type"]);
};

// Fungsi Ambil Data Lifetime untuk Dashboard
const getLifetimeData = async ({ deviceId, category, types }) => {
    let query = db("device_data")
        .select(
            db.raw("TO_CHAR(created_at, 'YYYY') as year"),
            "category",
            "type",
            db.raw("SUM(value::numeric) as sum"),
            db.raw("ROUND(AVG(value::numeric), 2) as avg"), 
            db.raw("MAX(value::numeric) as max"), 
            db.raw("MIN(value::numeric) as min")
        ).whereIn("device_id", deviceId);

    if (category) {
        query = query.where("category", category);
    }

    if (types && types.length > 0) {
        query = query.whereIn("type", types);
    }

    return await query
        .groupBy("year", "category", "type")
        .orderBy(["year", "category", "type"]);
};

const getChartData = async ({ plantId, deviceIds, segment, date }) => {
  const { start, end } = getChartDateRange(segment, date);
  const categories = Object.values(CHART_CATEGORY_ALIASES).flat();
  const types = Object.values(CHART_TYPE_ALIASES).flat();

  let query = db("device_data")
    .select("id", "device_id", "category", "type", "value", "created_at")
    .whereIn("device_id", deviceIds)
    .whereIn("category", categories)
    .whereIn("type", types);

  if (start && end) {
    query = query.whereBetween("created_at", [start, end]);
  }

  const rows = await query.orderBy([
    { column: "created_at", order: "asc" },
    { column: "id", order: "asc" },
  ]);

  const data = buildChartSeries(rows);
  const range = start && end ? { start, end } : null;

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

// const formatByType = (rows, key) => {
//   const result = {};

//   rows.forEach((row) => {
//     if (!result[row.type]) {
//       result[row.type] = [];
//     }

//     result[row.type].push({
//       [key]: row.date || row.month || row.year,
//       value: Number(row.value || row.total),
//     });
//   });

//   return result;
// };

// CHECK DEVICE → PLANT → USER

const checkDeviceAccess = async (userId, deviceId) => {
  const data = await db("plant_devices as pd")
    .join("user_plants as up", "pd.plant_id", "up.plant_id")
    .where("pd.device_id", deviceId)
    .where("up.user_id", userId)
    .first();

  return !!data;
};
const getDeviceIdData = async (userId, plantId) => {
  const devices = await db("plant_devices")
    .where("plant_id", plantId)
    .select("device_id");
  
  if (devices.length === 0) {
    throw new Error("Data_Not_Found");
  }

  const allowedDevices = [];
  for (const item of devices) {
    const isAllowed = await checkDeviceAccess(userId, item.device_id);
    if (isAllowed) {
      allowedDevices.push(item);
    }
  }

  if (allowedDevices.length === 0) {
     throw new Error("Access_Denied"); 
  }

  return allowedDevices;
};

module.exports = {
    saveDeviceData,
    getDeviceData,
    getDailyData,
    getMonthlyData,
    getYearlyData,
    getLifetimeData,
    getChartData,
    // formatByType,
    checkDeviceAccess,
    getDeviceIdData,
};
