//===== (Imports) ======
const {
  CHART_CATEGORY_ALIASES,
  CHART_TYPE_ALIASES,
  CHART_ENERGY_UNIT,
  CHART_ENERGY_SOURCE,
  MONTH_LABELS,
} = require("./constants");
const {
  formatDbTimestamp,
  getDaysInMonth,
  padTwo,
} = require("./chart.utils");
const {
  getTodayEnergyDateRange,
  chooseEnergyRows,
  choosePvGenerateEnergyRows,
  integrateRowsToKwh,
  getDailyKwhFromRows,
  buildChartEnergyItem,
  sumDailyKwh,
  buildEnergyPayload,
} = require("./energy.utils");
const {
  getDailyKwhRows,
  getLatestEnergyRows,
} = require("./data.repository");

//===== (getDailyKwhItems) ======
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
  const rows = await getDailyKwhRows({ deviceIds, start, end });
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

//===== (getMonthlyChartData) ======
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

//===== (getYearlyChartData) ======
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

//===== (getLatestEnergyData) ======
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
    const { start, end } = getTodayEnergyDateRange();
    const rows = await getLatestEnergyRows({ deviceIds, start, end });
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
        choosePvGenerateEnergyRows(rows, pvRows),
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

//===== (Exports) ======
module.exports = {
  getMonthlyChartData,
  getYearlyChartData,
  getLatestEnergyData,
};
