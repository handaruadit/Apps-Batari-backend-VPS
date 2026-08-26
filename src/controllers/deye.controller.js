const deyeService = require("../integrations/deye/deye.service");

const requireAdmin = (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ status: "error", message: "Admin access required" });
    return false;
  }
  return true;
};

const sendError = (res, error) => {
  const knownStatus = {
    Plant_Not_Found: 404,
    Deye_Integration_Not_Found: 404,
    Deye_Station_Already_Assigned: 409,
    Invalid_Deye_Station_ID: 400,
    Invalid_Deye_Source_Timestamp: 502,
    Invalid_Deye_Telemetry: 502,
  }[error.message];

  return res.status(knownStatus || error.statusCode || 500).json({
    status: "error",
    message: error.message,
  });
};

const handler = (action) => async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const data = await action(req);
    res.json({ status: "success", data });
  } catch (error) {
    sendError(res, error);
  }
};

const testAuthentication = handler(() => deyeService.testAuthentication());
const listStations = handler(() => deyeService.listStations());
const getStationLatest = handler((req) => deyeService.getStationLatest(req.params.stationId));
const getStationDevices = handler((req) => deyeService.getStationDevices(req.params.stationId));
const getMeasurePoints = handler((req) => deyeService.getMeasurePoints(req.params.deviceSn));
const getDeviceLatest = handler((req) => deyeService.getDeviceLatest(req.params.deviceSn));
const syncStationOnce = handler((req) => deyeService.syncStationOnce(req.params.stationId));
const syncAll = handler(() => deyeService.syncAllSummary());
const registerIntegration = handler((req) => deyeService.registerIntegration(req.body));

module.exports = {
  getDeviceLatest,
  getMeasurePoints,
  getStationDevices,
  getStationLatest,
  listStations,
  registerIntegration,
  syncAll,
  syncStationOnce,
  testAuthentication,
};
