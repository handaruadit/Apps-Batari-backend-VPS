const db = require("../src/config/db");

const normalizeBmsDeviceId = async () => {
  try {
    const updatedCount = await db("device_data")
      .where("device_id", "BMS_Jiabaida")
      .update({
        device_id: "BMS_JIABAIDA",
      });

    console.log(`${updatedCount} data lama berhasil dinormalisasi.`);
  } catch (error) {
    console.error("Gagal menormalisasi Device ID:", error.message);
  } finally {
    await db.destroy();
  }
};

normalizeBmsDeviceId();
