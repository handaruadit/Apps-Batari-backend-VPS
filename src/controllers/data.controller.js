//===== (Compatibility Facade) ======
const dataChartController = require("./dataChart.controller");
const dataTelemetryController = require("./dataTelemetry.controller");
const manualPlantDataController = require("./manualPlantData.controller");

//===== (Exports) ======
module.exports = {
  fetchDeviceData: dataTelemetryController.fetchDeviceData,
  getDaily: dataTelemetryController.getDaily,
  getMonthly: dataTelemetryController.getMonthly,
  getYearly: dataTelemetryController.getYearly,
  getLifetime: dataTelemetryController.getLifetime,
  getChart: dataChartController.getChart,
  getMonthlyChart: dataChartController.getMonthlyChart,
  getYearlyChart: dataChartController.getYearlyChart,
  sendManualPlantData: manualPlantDataController.sendManualPlantData,
};
