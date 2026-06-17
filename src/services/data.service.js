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
  productionFlow: ["production", "productionFlow", "production_flow"],
};

const CHART_TYPE_ALIASES = {
  power: ["power"],
  chargePower: ["chargePower", "charge_power", "chargepower"],
  vaPower: ["vaPower", "va_power", "vapower"],
  pvGenerate: ["pvGenerate", "pv_generate", "pvgenerate"],
  export: ["export", "exportPower", "export_power", "exportpower"],
  charge: ["charge", "chargePowerOut", "charge_power_out", "chargepowerout"],
};

const CHART_ALLOWED_SEGMENTS = ["day", "month", "year", "lifetime"];
const CHART_ENERGY_UNIT = "kWh";
const CHART_ENERGY_SOURCE = "backend-daily-kwh";
const POWER_WATT_INFERENCE_ABS_MIN = 20;

const CHART_SERIES_CONFIG = {
  production: { category: "pv", type: "chargePower" },
  load: { category: "out", type: "power" },
  upsLoad: { category: "out", type: "vaPower" },
  grid: { category: "grid", type: "power" },
  battery: { category: "baterai", type: "power" },
  pvGenerate: { category: "production", type: "pvGenerate" },
  export: { category: "production", type: "export" },
  charge: { category: "production", type: "charge" },
};

const DEFAULT_MOCK_CHART_POINTS_PER_DAY = 180;
const MOCK_CHART_SERIES_KEYS = [
  "production",
  "load",
  "upsLoad",
  "grid",
  "battery",
];

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[-_\s]+/g, "")
    .toLowerCase();

const matchesAlias = (value, aliases) => {
  const normalizedValue = normalizeText(value);
  return aliases.some((alias) => normalizeText(alias) === normalizedValue);
};

const getRowUnit = (row) =>
  row?.unit ?? row?.units ?? row?.measurement_unit ?? row?.measurementUnit;

const isWattUnit = (unit) => matchesAlias(unit, ["w", "watt", "watts"]);
const isKilowattUnit = (unit) =>
  matchesAlias(unit, ["kw", "kilowatt", "kilowatts"]);

const shouldTreatPowerValueAsWatt = (value, row) => {
  const unit = getRowUnit(row);

  if (isWattUnit(unit)) {
    return true;
  }

  if (isKilowattUnit(unit)) {
    return false;
  }

  return Math.abs(value) >= POWER_WATT_INFERENCE_ABS_MIN;
};

const normalizePowerKw = (value, row = {}) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return shouldTreatPowerValueAsWatt(number, row) ? number / 1000 : number;
};

const roundPowerKw = (value) => {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return 0;
  }

  if (Math.abs(num) < 0.0005) {
    return 0;
  }

  return Number(num.toFixed(3));
};

const isPowerResponseRow = (row) => {
  if (!row) return false;

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.pv) &&
    (matchesAlias(row.type, CHART_TYPE_ALIASES.power) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.chargePower))
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.load) &&
    (matchesAlias(row.type, CHART_TYPE_ALIASES.power) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.vaPower))
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.grid) &&
    matchesAlias(row.type, CHART_TYPE_ALIASES.power)
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.battery) &&
    matchesAlias(row.type, CHART_TYPE_ALIASES.power)
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.productionFlow) &&
    (matchesAlias(row.type, CHART_TYPE_ALIASES.pvGenerate) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.export) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.charge))
  ) {
    return true;
  }

  return false;
};

const formatPowerValueForResponse = (row) => {
  if (!isPowerResponseRow(row)) {
    return row?.value;
  }

  return roundPowerKw(normalizePowerKw(row?.value, row));
};

const formatDeviceDataForResponse = (row) => ({
  ...row,
  value: formatPowerValueForResponse(row),
});

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
    hour,
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
  value: formatPowerValueForResponse(row),
  created_at: row.created_at,
});

const buildChartSeries = (rows) => {
  const productionRows = [];
  const pvPowerRows = [];
  const loadRows = [];
  const upsLoadRows = [];
  const gridRows = [];
  const batteryRows = [];
  const pvGenerateRows = [];
  const exportRows = [];
  const chargeRows = [];

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

    if (matchesAlias(row.category, CHART_CATEGORY_ALIASES.productionFlow)) {
      if (matchesAlias(row.type, CHART_TYPE_ALIASES.pvGenerate)) {
        pvGenerateRows.push(formattedRow);
      }

      if (matchesAlias(row.type, CHART_TYPE_ALIASES.export)) {
        exportRows.push(formattedRow);
      }

      if (matchesAlias(row.type, CHART_TYPE_ALIASES.charge)) {
        chargeRows.push(formattedRow);
      }
    }
  });

  return {
    production: productionRows.length ? productionRows : pvPowerRows,
    load: loadRows.length ? loadRows : upsLoadRows,
    upsLoad: upsLoadRows.length ? upsLoadRows : loadRows,
    grid: gridRows,
    battery: batteryRows,
    pvGenerate: pvGenerateRows,
    export: exportRows,
    charge: chargeRows,
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
const roundEnergyKwh = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number(number.toFixed(5));
};
const positiveKwh = (value) => roundEnergyKwh(Math.abs(Number(value) || 0));
const roundChartEnergy = roundEnergyKwh;

const addNoise = (value, range, random) => {
  const noise = (random() - 0.5) * range;
  return value + noise;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const padTwo = (value) => String(value).padStart(2, "0");

const formatLocalTimestamp = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) =>
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
  const seasonal =
    point.seasonalSun === undefined ? 1 : 0.45 + point.seasonalSun * 0.55;
  return roundTwo(clamp(addNoise(shaped * 5 * seasonal, 0.25, random), 0, 5));
};

const getMockValue = (seriesKey, point, random) => {
  if (seriesKey === "production") {
    return getProductionValue(point, random);
  }

  const wave =
    (Math.sin(Math.PI * 2 * point.dayProgress - Math.PI / 3) + 1) / 2;

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
    if (!MOCK_CHART_SERIES_KEYS.includes(seriesKey)) {
      series[seriesKey] = [];
      return;
    }

    const random = createSeededRandom(
      `${plantId}:${segment}:${date || ""}:${seriesKey}`,
    );

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
      countData = filters.types.length * filters.deviceIds.length;
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
  } catch (err) {
    console.error("❌ DB Fetch Error:", err.message);
    return [];
  }
};

const ENERGY_TIME_ZONE = "Asia/Jakarta";

const getNumberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getTimeZoneDateParts = (
  date = new Date(),
  timeZone = ENERGY_TIME_ZONE,
) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value,
    month: parts.find((part) => part.type === "month")?.value,
    day: parts.find((part) => part.type === "day")?.value,
  };
};

const getTodayEnergyDateRange = () => {
  const { year, month, day } = getTimeZoneDateParts();
  const dateText = `${year}-${month}-${day}`;

  return {
    start: `${dateText} 00:00:00`,
    end: `${dateText} 23:59:59.999`,
  };
};

const getRowTimestamp = (row) => {
  const value = row?.created_at;
  const date =
    value instanceof Date
      ? value
      : new Date(String(value ?? "").replace(" ", "T"));

  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const getMetricRows = (rows, categoryAliases, typeAliases) =>
  rows.filter(
    (item) =>
      matchesAlias(item.category, categoryAliases) &&
      matchesAlias(item.type, typeAliases) &&
      getNumberOrNull(item.value) !== null &&
      getRowTimestamp(item) !== null,
  );

const chooseEnergyRows = (
  rows,
  categoryAliases,
  preferredTypeAliases,
  fallbackTypeAliases,
) => {
  const preferredRows = getMetricRows(
    rows,
    categoryAliases,
    preferredTypeAliases,
  );

  if (!fallbackTypeAliases) {
    return preferredRows;
  }

  const fallbackRows = getMetricRows(
    rows,
    categoryAliases,
    fallbackTypeAliases,
  );

  if (preferredRows.length >= 2 || fallbackRows.length === 0) {
    return preferredRows;
  }

  if (fallbackRows.length >= 2) {
    return fallbackRows;
  }

  return preferredRows.length ? preferredRows : fallbackRows;
};

const integrateRowsToKwh = (rows) => {
  if (!Array.isArray(rows) || rows.length < 2) {
    return 0;
  }

  const rowsByDevice = rows.reduce((items, row) => {
    const key = row.device_id || "unknown";

    if (!items[key]) {
      items[key] = [];
    }

    items[key].push(row);
    return items;
  }, {});

  const total = Object.values(rowsByDevice).reduce((sum, deviceRows) => {
    const sortedRows = deviceRows
      .map((row) => ({
        value: isPowerResponseRow(row)
          ? normalizePowerKw(row.value, row)
          : getNumberOrNull(row.value),
        timestamp: getRowTimestamp(row),
        id: Number(row.id || 0),
      }))
      .filter((row) => row.value !== null && row.timestamp !== null)
      .sort(
        (left, right) => left.timestamp - right.timestamp || left.id - right.id,
      );

    if (sortedRows.length < 2) {
      return sum;
    }

    let deviceKwh = 0;

    for (let index = 1; index < sortedRows.length; index += 1) {
      const previous = sortedRows[index - 1];
      const current = sortedRows[index];
      const intervalHours = (current.timestamp - previous.timestamp) / 3600000;

      if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
        continue;
      }

      deviceKwh += ((previous.value + current.value) / 2) * intervalHours;
    }

    return sum + deviceKwh;
  }, 0);

  return Number.isFinite(total) ? roundEnergyKwh(total) : 0;
};

const getDailyKwhFromRows = (rows) => {
  const pvRows = chooseEnergyRows(
    rows,
    CHART_CATEGORY_ALIASES.pv,
    CHART_TYPE_ALIASES.chargePower,
    CHART_TYPE_ALIASES.power,
  );
  const pvKwh = positiveKwh(integrateRowsToKwh(pvRows));
  const gridKwh = positiveKwh(
    integrateRowsToKwh(
      chooseEnergyRows(
        rows,
        CHART_CATEGORY_ALIASES.grid,
        CHART_TYPE_ALIASES.power,
      ),
    ),
  );
  const batteryKwh = positiveKwh(
    integrateRowsToKwh(
      chooseEnergyRows(
        rows,
        CHART_CATEGORY_ALIASES.battery,
        CHART_TYPE_ALIASES.power,
      ),
    ),
  );
  const pvGenerateKwh = positiveKwh(
    integrateRowsToKwh(
      chooseEnergyRows(
        rows,
        CHART_CATEGORY_ALIASES.productionFlow,
        CHART_TYPE_ALIASES.pvGenerate,
      ),
    ),
  );
  const exportKwh = positiveKwh(
    integrateRowsToKwh(
      chooseEnergyRows(
        rows,
        CHART_CATEGORY_ALIASES.productionFlow,
        CHART_TYPE_ALIASES.export,
      ),
    ),
  );
  const chargeKwh = positiveKwh(
    integrateRowsToKwh(
      chooseEnergyRows(
        rows,
        CHART_CATEGORY_ALIASES.productionFlow,
        CHART_TYPE_ALIASES.charge,
      ),
    ),
  );

  return {
    pvKwh,
    gridKwh,
    batteryKwh,
    pvGenerateKwh,
    exportKwh,
    chargeKwh,
    totalConsumptionKwh: roundEnergyKwh(pvKwh + gridKwh + batteryKwh),
    totalProductionKwh: roundEnergyKwh(pvGenerateKwh + exportKwh + chargeKwh),
  };
};

const toChartUnit = (kwh) =>
  roundChartEnergy(Math.abs(Number(kwh) || 0));

const buildChartEnergyItem = (energy) => ({
  pv: toChartUnit(energy.pvKwh),
  grid: toChartUnit(energy.gridKwh),
  battery: toChartUnit(energy.batteryKwh),
  pvGenerate: toChartUnit(energy.pvGenerateKwh),
  export: toChartUnit(energy.exportKwh),
  charge: toChartUnit(energy.chargeKwh),
  totalConsumption: toChartUnit(energy.totalConsumptionKwh),
  totalProduction: toChartUnit(energy.totalProductionKwh),
});

const sumDailyKwh = (dailyItems) =>
  dailyItems.reduce(
    (total, item) => ({
      pvKwh: total.pvKwh + item.pvKwh,
      gridKwh: total.gridKwh + item.gridKwh,
      batteryKwh: total.batteryKwh + item.batteryKwh,
      pvGenerateKwh: total.pvGenerateKwh + item.pvGenerateKwh,
      exportKwh: total.exportKwh + item.exportKwh,
      chargeKwh: total.chargeKwh + item.chargeKwh,
      totalConsumptionKwh: total.totalConsumptionKwh + item.totalConsumptionKwh,
      totalProductionKwh: total.totalProductionKwh + item.totalProductionKwh,
    }),
    {
      pvKwh: 0,
      gridKwh: 0,
      batteryKwh: 0,
      pvGenerateKwh: 0,
      exportKwh: 0,
      chargeKwh: 0,
      totalConsumptionKwh: 0,
      totalProductionKwh: 0,
    },
  );

const getDailyKwhItems = async ({ deviceIds, year, month }) => {
  const daysInMonth = getDaysInMonth(year, month);
  const start = formatDbTimestamp({ year, month, day: 1 });
  const end = formatDbTimestamp({
    year,
    month,
    day: daysInMonth,
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  });
  const categories = Object.values(CHART_CATEGORY_ALIASES).flat();
  const types = Object.values(CHART_TYPE_ALIASES).flat();
  const rows = await db("device_data")
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

  const rowsByDate = rows.reduce((items, row) => {
    if (!items[row.chart_day]) {
      items[row.chart_day] = [];
    }

    items[row.chart_day].push(row);
    return items;
  }, {});

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${padTwo(month)}-${padTwo(day)}`;

    return {
      day,
      date,
      ...getDailyKwhFromRows(rowsByDate[date] || []),
    };
  });
};

const getMonthlyChartData = async ({ deviceIds, month }) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw new Error("Invalid_Chart_Date");
  }

  const [yearNumber, monthNumber] = String(month).split("-").map(Number);
  const dailyItems = await getDailyKwhItems({
    deviceIds,
    year: yearNumber,
    month: monthNumber,
  });

  return {
    unit: CHART_ENERGY_UNIT,
    source: CHART_ENERGY_SOURCE,
    items: dailyItems.map((item) => ({
      day: item.day,
      date: item.date,
      ...buildChartEnergyItem(item),
    })),
  };
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const getYearlyChartData = async ({ deviceIds, year }) => {
  if (!/^\d{4}$/.test(String(year || ""))) {
    throw new Error("Invalid_Chart_Date");
  }

  const yearNumber = Number(year);
  const monthlyItems = await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const month = index + 1;
      const dailyItems = await getDailyKwhItems({
        deviceIds,
        year: yearNumber,
        month,
      });
      const monthlyKwh = sumDailyKwh(dailyItems);

      return {
        month,
        label: MONTH_LABELS[index],
        ...buildChartEnergyItem(monthlyKwh),
      };
    }),
  );

  return {
    unit: CHART_ENERGY_UNIT,
    source: CHART_ENERGY_SOURCE,
    items: monthlyItems,
  };
};

const buildEnergyPayload = ({
  consumptionKwh,
  batteryKwh,
  gridKwh,
  pvGenerateKwh = 0,
  exportKwh = 0,
  chargeKwh = 0,
}) => {
  const safeConsumptionKwh = roundEnergyKwh(consumptionKwh || 0);
  const safeBatteryKwh = roundEnergyKwh(batteryKwh || 0);
  const safeGridKwh = roundEnergyKwh(gridKwh || 0);
  const safePvGenerateKwh = roundEnergyKwh(pvGenerateKwh || 0);
  const safeExportKwh = roundEnergyKwh(exportKwh || 0);
  const safeChargeKwh = roundEnergyKwh(chargeKwh || 0);
  const totalKwh = roundEnergyKwh(
    safeConsumptionKwh + safeBatteryKwh + safeGridKwh,
  );
  const totalProductionKwh = roundEnergyKwh(
    safePvGenerateKwh + safeExportKwh + safeChargeKwh,
  );
  const hasTotal = totalKwh !== 0;
  const hasProductionTotal = totalProductionKwh !== 0;

  return {
    energy: {
      consumptionKwh: safeConsumptionKwh,
      batteryKwh: safeBatteryKwh,
      gridKwh: safeGridKwh,
      totalKwh,
    },
    energyPercent: {
      batteryPercent: hasTotal
        ? roundTwo((safeBatteryKwh / totalKwh) * 100)
        : 0,
      consumptionPercent: hasTotal
        ? roundTwo((safeConsumptionKwh / totalKwh) * 100)
        : 0,
      gridPercent: hasTotal ? roundTwo((safeGridKwh / totalKwh) * 100) : 0,
    },
    productionEnergy: {
      pvGenerateKwh: safePvGenerateKwh,
      exportKwh: safeExportKwh,
      chargeKwh: safeChargeKwh,
      totalProductionKwh,
    },
    productionEnergyPercent: {
      pvGeneratePercent: hasProductionTotal
        ? roundTwo((safePvGenerateKwh / totalProductionKwh) * 100)
        : 0,
      exportPercent: hasProductionTotal
        ? roundTwo((safeExportKwh / totalProductionKwh) * 100)
        : 0,
      chargePercent: hasProductionTotal
        ? roundTwo((safeChargeKwh / totalProductionKwh) * 100)
        : 0,
    },
  };
};

const getLatestEnergyData = async ({ deviceIds }) => {
  const emptyEnergy = buildEnergyPayload({
    consumptionKwh: 0,
    batteryKwh: 0,
    gridKwh: 0,
  });

  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return emptyEnergy;
  }

  try {
    const categories = Object.values(CHART_CATEGORY_ALIASES).flat();
    const types = Object.values(CHART_TYPE_ALIASES).flat();
    const { start, end } = getTodayEnergyDateRange();
    const rows = await db("device_data")
      .select("id", "device_id", "category", "type", "value", "created_at")
      .whereIn("device_id", deviceIds)
      .whereIn("category", categories)
      .whereIn("type", types)
      .whereBetween("created_at", [start, end])
      .orderBy([
        { column: "created_at", order: "asc" },
        { column: "id", order: "asc" },
      ]);
    const pvRows = chooseEnergyRows(
      rows,
      CHART_CATEGORY_ALIASES.pv,
      CHART_TYPE_ALIASES.chargePower,
      CHART_TYPE_ALIASES.power,
    );

    return buildEnergyPayload({
      consumptionKwh: integrateRowsToKwh(pvRows),
      batteryKwh: integrateRowsToKwh(
        chooseEnergyRows(
          rows,
          CHART_CATEGORY_ALIASES.battery,
          CHART_TYPE_ALIASES.power,
        ),
      ),
      gridKwh: integrateRowsToKwh(
        chooseEnergyRows(
          rows,
          CHART_CATEGORY_ALIASES.grid,
          CHART_TYPE_ALIASES.power,
        ),
      ),
      pvGenerateKwh: integrateRowsToKwh(
        chooseEnergyRows(
          rows,
          CHART_CATEGORY_ALIASES.productionFlow,
          CHART_TYPE_ALIASES.pvGenerate,
        ),
      ),
      exportKwh: integrateRowsToKwh(
        chooseEnergyRows(
          rows,
          CHART_CATEGORY_ALIASES.productionFlow,
          CHART_TYPE_ALIASES.export,
        ),
      ),
      chargeKwh: integrateRowsToKwh(
        chooseEnergyRows(
          rows,
          CHART_CATEGORY_ALIASES.productionFlow,
          CHART_TYPE_ALIASES.charge,
        ),
      ),
    });
  } catch (err) {
    console.error("Error building latest energy data:", err.message);
    return emptyEnergy;
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
      db.raw("MIN(value::numeric) as min"),
    )
    .whereIn("device_id", deviceId);

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

const checkDeviceAccess = async (userId, deviceId, plantId) => {
  const data = await db("plant_devices as pd")
    .join("user_plants as up", "pd.plant_id", "up.plant_id")
    .where("pd.device_id", deviceId)
    .where("up.user_id", userId)
    .modify((query) => {
      if (plantId) {
        query.where("pd.plant_id", plantId);
      }
    })
    .first();

  return !!data;
};
const getDeviceIdData = async (userId, plantId) => {
  const plantAccess = await db("user_plants")
    .where({ user_id: userId, plant_id: plantId })
    .first("role");

  if (!plantAccess) {
    throw new Error("Access_Denied");
  }

  const devices = await db("plant_devices")
    .where("plant_id", plantId)
    .select("device_id");

  if (devices.length === 0) {
    throw new Error("Data_Not_Found");
  }

  console.log("PLANT_ID =", plantId);
  console.log("DEVICES =", devices);

  return devices;
};

module.exports = {
  saveDeviceData,
  saveBatteryPowerForPlant,
  roundPowerKw,
  formatDeviceDataForResponse,
  getDeviceData,
  getDailyData,
  getMonthlyData,
  getYearlyData,
  getLifetimeData,
  getChartData,
  getMonthlyChartData,
  getYearlyChartData,
  getLatestEnergyData,
  // formatByType,
  checkDeviceAccess,
  getDeviceIdData,
};
