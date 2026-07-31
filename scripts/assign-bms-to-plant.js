const db = require("../src/config/db");

const { assignDeviceToPlant } = require("../src/services/plantDevice.service");

const DEVICE_ID = "BMS_JIABAIDA";
const PLANT_ID = 3;

const run = async () => {
  try {
    const plant = await db("plants").where("id", PLANT_ID).first("id", "name");

    if (!plant) {
      throw new Error(`Plant dengan ID ${PLANT_ID} tidak ditemukan.`);
    }

    const existingMapping = await db("plant_devices")
      .where("device_id", DEVICE_ID)
      .first();

    if (existingMapping) {
      if (Number(existingMapping.plant_id) === Number(PLANT_ID)) {
        console.log(`${DEVICE_ID} sudah terhubung ke plant ${plant.name}.`);

        console.table([existingMapping]);
        return;
      }

      throw new Error(
        `${DEVICE_ID} sudah terhubung ke Plant ID ${existingMapping.plant_id}.`,
      );
    }

    const result = await assignDeviceToPlant(DEVICE_ID, PLANT_ID, null);

    console.log(`${DEVICE_ID} berhasil dihubungkan ke plant ${plant.name}.`);

    console.table([
      {
        id: result.id,
        device_id: result.device_id,
        plant_id: result.plant_id,
        plant_name: plant.name,
        created_at: result.created_at,
      },
    ]);
  } catch (error) {
    console.error("Gagal menghubungkan BMS ke plant:", error.message);
  } finally {
    await db.destroy();
  }
};

run();
