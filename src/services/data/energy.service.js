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
      label: String(item.day),
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

//===== (getLifetimeChartData) ======
const getLifetimeChartData = async ({ deviceIds }) => {
  const currentYear = new Date().getFullYear();
  const startYear = 2023;
  const years = Array.from({ length: Math.max(1, currentYear - startYear + 1) }, (_, i) => startYear + i);

  const yearlyItems = await Promise.all(
    years.map(async (y) => {
      try {
        const yearData = await getYearlyChartData({ deviceIds, year: String(y) });
        const yearItems = yearData.items || [];
        const pv = yearItems.reduce((acc, it) => acc + (it.pv || 0), 0);
        const grid = yearItems.reduce((acc, it) => acc + (it.grid || 0), 0);
        const battery = yearItems.reduce((acc, it) => acc + (it.battery || 0), 0);
        const pvGenerate = yearItems.reduce((acc, it) => acc + (it.pvGenerate || 0), 0);
        const exportKwh = yearItems.reduce((acc, it) => acc + (it.export || 0), 0);
        const charge = yearItems.reduce((acc, it) => acc + (it.charge || 0), 0);
        const totalConsumption = yearItems.reduce((acc, it) => acc + (it.totalConsumption || 0), 0);
        const totalProduction = yearItems.reduce((acc, it) => acc + (it.totalProduction || 0), 0);

        return {
          year: y,
          label: String(y),
          pv: Number(pv.toFixed(2)),
          grid: Number(grid.toFixed(2)),
          battery: Number(battery.toFixed(2)),
          pvGenerate: Number(pvGenerate.toFixed(2)),
          export: Number(exportKwh.toFixed(2)),
          charge: Number(charge.toFixed(2)),
          totalConsumption: Number(totalConsumption.toFixed(2)),
          totalProduction: Number(totalProduction.toFixed(2)),
        };
      } catch {
        return {
          year: y,
          label: String(y),
          pv: 0,
          grid: 0,
          battery: 0,
          pvGenerate: 0,
          export: 0,
          charge: 0,
          totalConsumption: 0,
          totalProduction: 0,
        };
      }
    })
  );

  return {
    unit: CHART_ENERGY_UNIT,
    source: CHART_ENERGY_SOURCE,
    items: yearlyItems,
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
    const loadRows = chooseEnergyRows(
      rows,
      CHART_CATEGORY_ALIASES.load,
      CHART_TYPE_ALIASES.power,
    );

    return buildEnergyPayload({
      consumptionKwh: integrateRowsToKwh(loadRows.length ? loadRows : pvRows),
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
        choosePvGenerateEnergyRows(rows, loadRows),
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
  getLifetimeChartData,
  getLatestEnergyData,
};
