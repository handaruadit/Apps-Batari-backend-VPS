//===== (Imports) ======
const {
  CHART_CATEGORY_ALIASES,
  CHART_TYPE_ALIASES,
  CHART_ALLOWED_SEGMENTS,
  CHART_SERIES_CONFIG,
  DEFAULT_MOCK_CHART_POINTS_PER_DAY,
  MOCK_CHART_SERIES_KEYS,
} = require("./constants");
const {
  matchesAlias,
  formatPowerValueForResponse,
} = require("./telemetry.formatter");

//===== (padChartTwo) ======
const padChartTwo = (value) => String(value).padStart(2, "0");

//===== (formatDbTimestamp) ======
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

//===== (getChartDateRange) ======
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

//===== (formatChartRow) ======
const formatChartRow = (row) => ({
  id: row.id,
  device_id: row.device_id,
  category: row.category,
  type: row.type,
  value: formatPowerValueForResponse(row),
  created_at: row.created_at,
});

//===== (buildChartSeries) ======
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
    pvGenerate: pvGenerateRows.length
      ? pvGenerateRows
      : productionRows.length
        ? productionRows
        : pvPowerRows,
    export: exportRows,
    charge: chargeRows,
  };
};

//===== (getSeriesCounts) ======
const getSeriesCounts = (series) =>
  Object.keys(CHART_SERIES_CONFIG).reduce((counts, key) => {
    counts[key] = Array.isArray(series[key]) ? series[key].length : 0;
    return counts;
  }, {});

//===== (hasChartSeriesData) ======
const hasChartSeriesData = (series) =>
  Object.values(getSeriesCounts(series)).some((count) => count > 0);

//===== (isMockChartEnabled) ======
const isMockChartEnabled = () => process.env.MOCK_CHART_ENABLED === "true";

//===== (getMockPointsPerDay) ======
const getMockPointsPerDay = () => {
  const value = Number(process.env.MOCK_CHART_POINTS_PER_DAY);

  if (!Number.isInteger(value) || value <= 0) {
    return DEFAULT_MOCK_CHART_POINTS_PER_DAY;
  }

  return value;
};

//===== (hashSeed) ======
const hashSeed = (value) => {
  let hash = 2166136261;
  const text = String(value);

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

//===== (createSeededRandom) ======
const createSeededRandom = (seedText) => {
  let state = hashSeed(seedText) || 1;

  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
};

//===== (roundTwo) ======
const roundTwo = (value) => Number(value.toFixed(2));

//===== (addNoise) ======
const addNoise = (value, range, random) => {
  const noise = (random() - 0.5) * range;
  return value + noise;
};

//===== (clamp) ======
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

//===== (getDaysInMonth) ======
const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

//===== (padTwo) ======
const padTwo = (value) => String(value).padStart(2, "0");

//===== (formatLocalTimestamp) ======
const formatLocalTimestamp = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) =>
  `${year}-${padTwo(month)}-${padTwo(day)}T${padTwo(hour)}:${padTwo(minute)}:${padTwo(second)}`;

//===== (buildMockDatePoints) ======
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

//===== (getProductionValue) ======
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

//===== (getMockValue) ======
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

//===== (buildMockChartSeries) ======
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

//===== (Exports) ======
module.exports = {
  formatDbTimestamp,
  getChartDateRange,
  buildChartSeries,
  getSeriesCounts,
  hasChartSeriesData,
  isMockChartEnabled,
  getDaysInMonth,
  padTwo,
  buildMockChartSeries,
};
