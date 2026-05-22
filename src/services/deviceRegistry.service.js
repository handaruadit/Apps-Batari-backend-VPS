const db = require("../config/db");

const normalizeDeviceId = (deviceId) => String(deviceId || "").trim().toUpperCase();

const getRegisteredDevices = async () => {
  const rows = await db("registered_devices")
    .select("device_id as deviceId", "created_at as createdAt")
    .orderBy("device_id", "asc");

  return rows;
};

const registerDevice = async (deviceId) => {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    throw new Error("Device_ID_Required");
  }

  const [device] = await db("registered_devices")
    .insert({
      device_id: normalizedDeviceId,
      updated_at: db.fn.now(),
    })
    .onConflict("device_id")
    .merge({
      updated_at: db.fn.now(),
    })
    .returning(["device_id", "created_at"]);

  return device
    ? { deviceId: device.device_id, createdAt: device.created_at }
    : { deviceId: normalizedDeviceId };
};

const isRegisteredDevice = async (deviceId) => {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    return false;
  }

  const device = await db("registered_devices")
    .where({ device_id: normalizedDeviceId })
    .first("device_id");

  return !!device;
};

module.exports = {
  getRegisteredDevices,
  isRegisteredDevice,
  normalizeDeviceId,
  registerDevice,
};
