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

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[-_\s]+/g, "")
    .toLowerCase();

const matchesAlias = (value, aliases) => {
  const normalizedValue = normalizeText(value);
  return aliases.some((alias) => normalizeText(alias) === normalizedValue);
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
      start: new Date(`${date}T00:00:00`),
      end: new Date(`${date}T23:59:59.999`),
    };
  }

  if (segment === "month") {
    if (!/^\d{4}-\d{2}$/.test(String(date || ""))) {
      throw new Error("Invalid_Chart_Date");
    }

    const [year, month] = String(date).split("-").map(Number);

    return {
      start: new Date(year, month - 1, 1, 0, 0, 0, 0),
      end: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }

  if (!/^\d{4}$/.test(String(date || ""))) {
    throw new Error("Invalid_Chart_Date");
  }

  const year = Number(date);

  return {
    start: new Date(year, 0, 1, 0, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
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

const getChartData = async ({ deviceIds, segment, date }) => {
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

  return buildChartSeries(rows);
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
