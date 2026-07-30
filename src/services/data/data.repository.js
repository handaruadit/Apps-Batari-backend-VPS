//===== (Imports) ======
const db = require("../../config/db");
const {
  CHART_CATEGORY_ALIASES,
  CHART_TYPE_ALIASES,
} = require("./constants");
const { normalizeCreatedAt } = require("./telemetry.formatter");

//===== (saveDeviceData) ======
const saveDeviceData = async (data) => {
  try {
    const rows = Array.isArray(data) ? data : [data];
    const formatted = rows.map((item) => {
      const createdAt = normalizeCreatedAt(item.createdAt || item.timestamp);

      return {
        device_id: item.deviceId,
        category: item.category,
        type: item.type,
        value: item.value,
        ...(createdAt ? { created_at: createdAt } : {}),
      };
    });

    await db("device_data").insert(formatted);
  } catch (err) {
    console.error("❌ DB Insert Error:", err.message);
  }
};

//===== (findBatteryDeviceIdForPlant) ======
const findBatteryDeviceIdForPlant = async (plantName, preferredDeviceId) => {
  const plant = await db("plants").where("name", plantName).first("id");

  if (!plant) {
    console.warn(`Battery power skipped: plant not found for ${plantName}`);
    return null;
  }

  const devices = await db("plant_devices")
    .where("plant_id", plant.id)
    .select("device_id");

  if (devices.length === 0) {
    console.warn(`Battery power skipped: plant_devices empty for ${plantName}`);
    return null;
  }

  if (preferredDeviceId) {
    const mappedDevice = devices.find(
      (device) => device.device_id === preferredDeviceId,
    );

    if (!mappedDevice) {
      console.warn(
        `Battery power skipped: device ${preferredDeviceId} is not mapped to plant ${plantName}`,
      );
      return null;
    }

    return preferredDeviceId;
  }

  const deviceIds = devices.map((device) => device.device_id);
  const existingBatteryDevice = await db("device_data")
    .whereIn("device_id", deviceIds)
    .where({ category: "baterai", type: "power" })
    .orderBy("created_at", "desc")
    .first("device_id");

  return existingBatteryDevice?.device_id || deviceIds[0];
};

//===== (saveBatteryPowerForPlant) ======
const saveBatteryPowerForPlant = async ({ plantName, deviceId, powerKw }) => {
  try {
    const value = Number(powerKw);
    if (!Number.isFinite(value)) {
      return null;
    }

    const targetDeviceId = await findBatteryDeviceIdForPlant(
      plantName,
      deviceId,
    );
    if (!targetDeviceId) {
      return null;
    }

    const [row] = await db("device_data")
      .insert({
        device_id: targetDeviceId,
        category: "baterai",
        type: "power",
        value,
      })
      .returning("*");

    return row;
  } catch (err) {
    console.error("DB Battery Power Insert Error:", err.message);
    return null;
  }
};

//===== (getDeviceData) ======
const getDeviceData = async (filters) => {
  try {
    let query = db("device_data").select("*");
    let countData = 1;

    if (filters.deviceIds) {
      query = query.whereIn("device_id", filters.deviceIds);
    }

    if (filters.category) {
      query = query.where("category", filters.category);
    }

    if (filters.types?.length) {
      query = query.whereIn("type", filters.types);
      countData = filters.types.length * filters.deviceIds.length;
    }

    if (filters.startDate && filters.endDate) {
      query = query.whereBetween("created_at", [
        filters.startDate,
        filters.endDate,
      ]);
    }

    if (filters.latestBy === "inserted") {
      query = query.orderBy("id", "desc");
    } else {
      query = query.orderBy("created_at", "desc");
    }

    query = query.limit(filters.limit || countData);

    return await query;
  } catch (err) {
    console.error("❌ DB Fetch Error:", err.message);
    return [];
  }
};

//===== (getDailyKwhRows) ======
const getDailyKwhRows = async ({ deviceIds, start, end }) => {
  const categories = Object.values(CHART_CATEGORY_ALIASES).flat();
  const types = Object.values(CHART_TYPE_ALIASES).flat();

  return db("device_data")
    .select(
      "id",
      "device_id",
      "category",
      "type",
      "value",
      "created_at",
      db.raw("TO_CHAR(created_at, 'YYYY-MM-DD') as chart_day"),
    )
    .whereIn("device_id", deviceIds)
    .whereIn("category", categories)
    .whereIn("type", types)
    .whereBetween("created_at", [start, end])
    .orderBy([
      { column: "created_at", order: "asc" },
      { column: "id", order: "asc" },
    ]);
};

//===== (getLatestEnergyRows) ======
const getLatestEnergyRows = async ({ deviceIds, start, end }) => {
  const categories = Object.values(CHART_CATEGORY_ALIASES).flat();
  const types = Object.values(CHART_TYPE_ALIASES).flat();

  return db("device_data")
    .select("id", "device_id", "category", "type", "value", "created_at")
    .whereIn("device_id", deviceIds)
    .whereIn("category", categories)
    .whereIn("type", types)
    .whereBetween("created_at", [start, end])
    .orderBy([
      { column: "created_at", order: "asc" },
      { column: "id", order: "asc" },
    ]);
};

//===== (getDailyData) ======
const getDailyData = async ({ deviceId, date, category, types }) => {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59`);

  let query = db("device_data")
    .whereIn("device_id", deviceId)
    .whereBetween("created_at", [start, end]);

  if (category) {
    query = query.where("category", category);
  }

  if (types && types.length > 0) {
    query = query.whereIn("type", types);
  }

  return query.orderBy("created_at", "asc");
};

//===== (getMonthlyData) ======
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
      db.raw("MIN(value::numeric) as min"),
    )
    .whereIn("device_id", deviceId)
    .whereBetween("created_at", [start, end]);

  if (category) {
    query = query.where("category", category);
  }

  if (types && types.length > 0) {
    query = query.whereIn("type", types);
  }

  return query
    .groupBy("date", "category", "type")
    .orderBy(["date", "category", "type"]);
};

//===== (getYearlyData) ======
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
      db.raw("MIN(value::numeric) as min"),
    )
    .whereIn("device_id", deviceId)
    .whereBetween("created_at", [start, end]);

  if (category) {
    query = query.where("category", category);
  }

  if (types && types.length > 0) {
    query = query.whereIn("type", types);
  }

  return query
    .groupBy("month", "category", "type")
    .orderBy(["month", "category", "type"]);
};

//===== (getLifetimeData) ======
const getLifetimeData = async ({ deviceId, category, types }) => {
  let query = db("device_data")
    .select(
      db.raw("TO_CHAR(created_at, 'YYYY') as year"),
      "category",
      "type",
      db.raw("SUM(value::numeric) as sum"),
      db.raw("ROUND(AVG(value::numeric), 2) as avg"),
      db.raw("MAX(value::numeric) as max"),
      db.raw("MIN(value::numeric) as min"),
    )
    .whereIn("device_id", deviceId);

  if (category) {
    query = query.where("category", category);
  }

  if (types && types.length > 0) {
    query = query.whereIn("type", types);
  }

  return query
    .groupBy("year", "category", "type")
    .orderBy(["year", "category", "type"]);
};

//===== (getChartRows) ======
const getChartRows = async ({ deviceIds, start, end }) => {
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

  return query.orderBy([
    { column: "created_at", order: "asc" },
    { column: "id", order: "asc" },
  ]);
};

//===== (Exports) ======
module.exports = {
  saveDeviceData,
  saveBatteryPowerForPlant,
  getDeviceData,
  getDailyKwhRows,
  getLatestEnergyRows,
  getDailyData,
  getMonthlyData,
  getYearlyData,
  getLifetimeData,
  getChartRows,
};
