//===== (Imports) ======
const db = require("../config/db");
const { formatDeviceDataForResponse } = require("./data.service");
const {
  normalizeDeviceId,
  registerDevice,
} = require("./deviceRegistry.service");

//===== (assignDeviceToPlant) ======
const assignDeviceToPlant = async (deviceId, plantId, userId) => {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    throw new Error("Device_ID_Required");
  }

  return db.transaction(async (trx) => {
    await registerDevice(normalizedDeviceId);

    const existingDevice = await trx("plant_devices")
      .where({ device_id: normalizedDeviceId, plant_id: plantId })
      .first();

    const plantDevice =
      existingDevice ||
      (
        await trx("plant_devices")
          .insert({
            device_id: normalizedDeviceId,
            plant_id: plantId,
          })
          .returning("*")
      )[0];
    return plantDevice;
  });
};

//===== (removePlantDevice) ======
const removePlantDevice = async (deviceId, plantId) => {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    throw new Error("Device_ID_Required");
  }

  const deletedCount = await db("plant_devices")
    .where({ device_id: normalizedDeviceId, plant_id: plantId })
    .del();

  if (!deletedCount) {
    throw new Error("Plant_Device_Not_Found");
  }

  return {
    plantId,
    deviceId: normalizedDeviceId,
  };
};

//===== (getPlantDevices) ======
const getPlantDevices = async (plantId) => {
  const devices = await db("plant_devices as pd")
    .leftJoin("deye_devices as dd", "dd.device_sn", "pd.device_id")
    .where("pd.plant_id", plantId)
    .select(
      "pd.*",
      "dd.device_type as deviceType",
      "dd.connect_status as connectStatus",
      "dd.product_id as productId",
      "dd.last_seen as lastSeen",
    )
    .orderBy("pd.device_id", "asc");

  for (const device of devices) {
    const latestRows = await db.raw(
      `
      SELECT DISTINCT ON (category, type)
        category,
        type,
        value,
        created_at
      FROM device_data
      WHERE device_id = ?
        AND category IN ('data_bms','baterai','setting_bms')
      ORDER BY category, type, created_at DESC
      `,
      [device.device_id],
    );

    device.latestData = latestRows.rows.map(formatDeviceDataForResponse);
  }

  return devices;
};

//===== (Exports) ======
module.exports = {
  assignDeviceToPlant,
  getPlantDevices,
  removePlantDevice,
};
