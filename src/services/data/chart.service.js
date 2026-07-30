//===== (Imports) ======
const { CHART_ENERGY_SOURCE } = require("./constants");
const {
  getChartDateRange,
  buildChartSeries,
  getSeriesCounts,
  hasChartSeriesData,
  isMockChartEnabled,
  buildMockChartSeries,
} = require("./chart.utils");
const { getChartRows } = require("./data.repository");
const {
  getMonthlyChartData,
  getYearlyChartData,
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

  const { start, end } = getChartDateRange(segment, date);
  const rows = await getChartRows({ deviceIds, start, end });
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

//===== (Exports) ======
module.exports = {
  getChartData,
};
