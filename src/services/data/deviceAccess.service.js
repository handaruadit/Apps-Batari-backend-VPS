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

  // 1. Try finding if plantId is actually a station ID (e.g. 61419275 or 62566371)
  const matchingDevice = await db("plant_devices")
    .where("device_id", `DEYE_STATION_${plantId}`)
    .orWhere("device_id", String(plantId))
    .orWhere("device_id", "like", `%${plantId}%`)
    .first("plant_id", "device_id");

  if (matchingDevice && matchingDevice.plant_id) {
    resolvedPlantId = matchingDevice.plant_id;
  }

  // 2. Check plant access for user
  const plantAccess = await db("user_plants")
    .where({ user_id: userId, plant_id: resolvedPlantId })
    .first("role");

  // 3. Query devices for the plant
  let devices = await db("plant_devices")
    .where("plant_id", resolvedPlantId)
    .select("device_id");

  if (devices.length === 0 && matchingDevice) {
    devices = [{ device_id: matchingDevice.device_id }];
  }

  if (devices.length === 0) {
    // If plantId is directly a deye station id, provide default device representation
    devices = [{ device_id: `DEYE_STATION_${plantId}` }];
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
