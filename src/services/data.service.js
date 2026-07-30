//===== (Imports) ======
const {
  saveDeviceData,
  saveBatteryPowerForPlant,
  getDeviceData,
  getDailyData,
  getMonthlyData,
  getYearlyData,
  getLifetimeData,
} = require("./data/data.repository");
const {
  roundPowerKw,
  formatDeviceDataForResponse,
} = require("./data/telemetry.formatter");
const { getChartData } = require("./data/chart.service");
const {
  getMonthlyChartData,
  getYearlyChartData,
  getLatestEnergyData,
} = require("./data/energy.service");
const {
  checkDeviceAccess,
  getDeviceIdData,
} = require("./data/deviceAccess.service");

//===== (Exports) ======
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
  checkDeviceAccess,
  getDeviceIdData,
};
