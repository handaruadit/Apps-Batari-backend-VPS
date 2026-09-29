//===== (Imports) ======
const db = require("../../config/db");

//===== (checkDeviceAccess) ======
const checkDeviceAccess = async (userId, deviceId, plantId) => {
  const data = await db("plant_devices as pd")
    .join("user_plants as up", "pd.plant_id", "up.plant_id")
    .where("pd.device_id", deviceId)
    .where("up.user_id", userId)
    .modify((query) => {
      if (plantId) {
        query.where("pd.plant_id", plantId);
      }
    })
    .first();

  return !!data;
};

//===== (getDeviceIdData) ======
const getDeviceIdData = async (userId, plantId) => {
  let resolvedPlantId = plantId;
  let isDeyeStation = Number(plantId) >= 100000;
  let integration = null;

  // 1. Try finding if plantId is mapped in deye_integrations (plant_id <-> station_id)
  try {
    integration = await db("deye_integrations")
      .where("plant_id", String(plantId))
      .orWhere("station_id", String(plantId))
      .first("plant_id", "station_id");

    if (integration) {
      if (integration.plant_id) {
        resolvedPlantId = integration.plant_id;
      }
      isDeyeStation = true;
    }
  } catch (_intErr) {
    // Ignore integration lookup failure
  }

  // 2. Try finding if plantId is actually a station ID in plant_devices (exact match only!)
  let matchingDevice = null;
  if (isDeyeStation) {
    matchingDevice = await db("plant_devices")
      .where("device_id", `DEYE_STATION_${plantId}`)
      .orWhere("device_id", String(plantId))
      .first("plant_id", "device_id");

    if (matchingDevice && matchingDevice.plant_id) {
      resolvedPlantId = matchingDevice.plant_id;
    }
  }

  // 3. Query devices for the plant
  let devices = await db("plant_devices")
    .where("plant_id", resolvedPlantId)
    .select("device_id");

  if (devices.length === 0 && matchingDevice) {
    devices = [{ device_id: matchingDevice.device_id }];
  }

  // Only provide default Deye station device representation for authentic Deye stations
  if (devices.length === 0 && (isDeyeStation || Number(plantId) >= 100000)) {
    const deyeStationId = integration?.station_id || plantId;
    devices = [{ device_id: `DEYE_STATION_${deyeStationId}` }];
  }

  console.log("Resolved PLANT_ID =", resolvedPlantId, "from input =", plantId);
  console.log("DEVICES =", devices);

  return devices;
};

//===== (Exports) ======
module.exports = {
  checkDeviceAccess,
  getDeviceIdData,
};
