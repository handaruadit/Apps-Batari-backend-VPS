const db = require("../src/config/db");

const DEVICE_ID = "BMS_JIABAIDA";

const checkBmsPlant = async () => {
  try {
    const plants = await db("plants")
      .select("id", "name", "location", "system_type")
      .orderBy("id", "asc");

    console.log("\n=== DAFTAR PLANT ===");

    if (plants.length === 0) {
      console.log("Belum ada plant.");
    } else {
      console.table(plants);
    }

    const registeredDevice = await db("registered_devices")
      .where("device_id", DEVICE_ID)
      .first();

    console.log("\n=== REGISTERED DEVICE ===");

    if (!registeredDevice) {
      console.log(`${DEVICE_ID} belum terdaftar di registered_devices.`);
    } else {
      console.table([registeredDevice]);
    }

    const plantDevice = await db("plant_devices")
      .leftJoin("plants", "plant_devices.plant_id", "plants.id")
      .where("plant_devices.device_id", DEVICE_ID)
      .select(
        "plant_devices.id",
        "plant_devices.device_id",
        "plant_devices.plant_id",
        "plants.name as plant_name",
        "plant_devices.created_at",
      )
      .first();

    console.log("\n=== HUBUNGAN DEVICE DENGAN PLANT ===");

    if (!plantDevice) {
      console.log(`${DEVICE_ID} belum terhubung ke plant mana pun.`);
    } else {
      console.table([plantDevice]);
    }

    const latestData = await db("device_data")
      .where({
        device_id: DEVICE_ID,
        category: "baterai",
      })
      .whereIn("type", ["voltage", "current", "soc", "power"])
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(4);

    console.log("\n=== DATA BMS TERBARU ===");

    if (latestData.length === 0) {
      console.log("Belum ada data BMS.");
    } else {
      console.table(
        latestData.map((row) => ({
          id: row.id,
          device_id: row.device_id,
          type: row.type,
          value: row.value,
          created_at: row.created_at,
        })),
      );
    }
  } catch (error) {
    console.error("\nGagal memeriksa hubungan BMS:", error.message);
  } finally {
    await db.destroy();
  }
};

checkBmsPlant();
