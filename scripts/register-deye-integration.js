require("../src/config/env");
const db = require("../src/config/db");
const deyeService = require("../src/integrations/deye/deye.service");

const run = async () => {
  const plantId = Number(process.env.DEYE_PLANT_ID);
  const stationId = Number(process.env.DEYE_STATION_ID);

  if (!Number.isSafeInteger(plantId) || plantId <= 0) {
    throw new Error("DEYE_PLANT_ID must identify the target BySense plant");
  }

  const integration = await deyeService.registerIntegration({
    plantId,
    stationId,
    primaryDeviceSn: process.env.DEYE_DEVICE_SN || null,
    enabled: true,
  });
  console.log(JSON.stringify({
    plantId: integration.plant_id,
    stationId: integration.station_id,
    sourceDeviceId: integration.source_device_id,
    primaryDeviceSn: integration.primary_device_sn,
    enabled: integration.enabled,
  }, null, 2));
};

run()
  .catch((error) => {
    console.error(`DEYE_REGISTER_FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
