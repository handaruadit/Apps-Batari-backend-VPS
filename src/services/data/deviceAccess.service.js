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
  const plantAccess = await db("user_plants")
    .where({ user_id: userId, plant_id: plantId })
    .first("role");

  if (!plantAccess) {
    throw new Error("Access_Denied");
  }

  const devices = await db("plant_devices")
    .where("plant_id", plantId)
    .select("device_id");

  if (devices.length === 0) {
    throw new Error("Data_Not_Found");
  }

  console.log("PLANT_ID =", plantId);
  console.log("DEVICES =", devices);

  return devices;
};

//===== (Exports) ======
module.exports = {
  checkDeviceAccess,
  getDeviceIdData,
};
