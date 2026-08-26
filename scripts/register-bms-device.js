const db = require("../src/config/db");

const DEVICE_ID = "BMS_Jiabaida";

const normalizeDeviceId = (deviceId) =>
  String(deviceId || "")
    .trim()
    .toUpperCase();

const registerBmsDevice = async () => {
  try {
    const deviceId = normalizeDeviceId(DEVICE_ID);

    const [device] = await db("registered_devices")
      .insert({
        device_id: deviceId,
        updated_at: db.fn.now(),
      })
      .onConflict("device_id")
      .merge({
        updated_at: db.fn.now(),
      })
      .returning(["id", "device_id", "created_at", "updated_at"]);

    console.log("Device BMS berhasil didaftarkan:");

    console.table([device]);
  } catch (error) {
    console.error("Gagal mendaftarkan BMS:", error.message);
  } finally {
    await db.destroy();
  }
};

registerBmsDevice();
