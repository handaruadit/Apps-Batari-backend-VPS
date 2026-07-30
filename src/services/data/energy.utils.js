//===== (Imports) ======
const {
  CHART_CATEGORY_ALIASES,
  CHART_TYPE_ALIASES,
  ENERGY_TIME_ZONE,
} = require("./constants");
const {
  matchesAlias,
  isPowerResponseRow,
  normalizePowerKw,
} = require("./telemetry.formatter");

//===== (roundTwo) ======
const roundTwo = (value) => Number(value.toFixed(2));

//===== (roundEnergyKwh) ======
const roundEnergyKwh = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number(number.toFixed(5));
};

//===== (positiveKwh) ======
const positiveKwh = (value) => roundEnergyKwh(Math.abs(Number(value) || 0));

//===== (getNumberOrNull) ======
const getNumberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

//===== (getTimeZoneDateParts) ======
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

//===== (getTodayEnergyDateRange) ======
const getTodayEnergyDateRange = () => {
  const { year, month, day } = getTimeZoneDateParts();
  const dateText = `${year}-${month}-${day}`;

  return {
    start: `${dateText} 00:00:00`,
    end: `${dateText} 23:59:59.999`,
  };
};

//===== (getRowTimestamp) ======
const getRowTimestamp = (row) => {
  const value = row?.created_at;
  const date =
    value instanceof Date
      ? value
      : new Date(String(value ?? "").replace(" ", "T"));

  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

//===== (getMetricRows) ======
const getMetricRows = (rows, categoryAliases, typeAliases) =>
  rows.filter(
    (item) =>
      matchesAlias(item.category, categoryAliases) &&
      matchesAlias(item.type, typeAliases) &&
      getNumberOrNull(item.value) !== null &&
      getRowTimestamp(item) !== null,
  );

//===== (chooseEnergyRows) ======
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

//===== (choosePvGenerateEnergyRows) ======
const choosePvGenerateEnergyRows = (rows, fallbackPvRows = null) => {
  const pvGenerateRows = chooseEnergyRows(
    rows,
    CHART_CATEGORY_ALIASES.productionFlow,
    CHART_TYPE_ALIASES.pvGenerate,
  );

  if (pvGenerateRows.length >= 2) {
    return pvGenerateRows;
  }

  const pvRows =
    fallbackPvRows ||
    chooseEnergyRows(
      rows,
      CHART_CATEGORY_ALIASES.pv,
      CHART_TYPE_ALIASES.chargePower,
      CHART_TYPE_ALIASES.power,
    );

  if (pvRows.length >= 2) {
    return pvRows;
  }

  return pvGenerateRows.length ? pvGenerateRows : pvRows;
};

//===== (integrateRowsToKwh) ======
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

//===== (getDailyKwhFromRows) ======
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
    integrateRowsToKwh(choosePvGenerateEnergyRows(rows, pvRows)),
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

//===== (toChartUnit) ======
const toChartUnit = (kwh) => roundEnergyKwh(Math.abs(Number(kwh) || 0));

//===== (buildChartEnergyItem) ======
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

//===== (sumDailyKwh) ======
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

//===== (buildEnergyPayload) ======
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

//===== (Exports) ======
module.exports = {
  roundEnergyKwh,
  getTodayEnergyDateRange,
  chooseEnergyRows,
  choosePvGenerateEnergyRows,
  integrateRowsToKwh,
  getDailyKwhFromRows,
  buildChartEnergyItem,
  sumDailyKwh,
  buildEnergyPayload,
};
