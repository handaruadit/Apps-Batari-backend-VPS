require("../src/config/env");
const deyeService = require("../src/integrations/deye/deye.service");
const { mapStationLatest } = require("../src/integrations/deye/deye.mapper");

const run = async () => {
  const stationId = Number(process.env.DEYE_STATION_ID);
  const deviceSn = String(process.env.DEYE_DEVICE_SN || "").trim();

  await deyeService.testAuthentication();
  const stations = await deyeService.listStations();
  const latest = await deyeService.getStationLatest(stationId);
  const devices = await deyeService.getStationDevices(stationId);
  const telemetry = mapStationLatest(stationId, latest);

  let measurePoints = null;
  let deviceLatest = null;
  if (deviceSn) {
    measurePoints = await deyeService.getMeasurePoints(deviceSn);
    deviceLatest = await deyeService.getDeviceLatest(deviceSn);
  }

  console.log(JSON.stringify({
    authentication: "success",
    stationListCount: Number(stations.total || stations.stationList?.length || 0),
    stationLatestTimestamp: latest.lastUpdateTime,
    stationDeviceCount: Number(devices.total || devices.deviceListItems?.length || 0),
    measurePointCount: measurePoints?.pointList?.length ?? measurePoints?.dataList?.length ?? null,
    deviceLatestCount: deviceLatest?.deviceDataList?.length ?? null,
    telemetry,
  }, null, 2));
};

run().catch((error) => {
  console.error(`DEYE_PROBE_FAILED: ${error.message}`);
  process.exitCode = 1;
});
