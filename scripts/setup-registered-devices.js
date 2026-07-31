const db = require("../src/config/db");

const setupRegisteredDevices = async () => {
  try {
    const exists = await db.schema.hasTable("registered_devices");

    if (exists) {
      console.log("Tabel registered_devices sudah tersedia.");
      return;
    }

    await db.schema.createTable("registered_devices", (table) => {
      table.bigIncrements("id").primary();

      table.text("device_id").notNullable().unique();

      table
        .timestamp("created_at", {
          useTz: true,
        })
        .notNullable()
        .defaultTo(db.fn.now());

      table
        .timestamp("updated_at", {
          useTz: true,
        })
        .notNullable()
        .defaultTo(db.fn.now());
    });

    console.log("Tabel registered_devices berhasil dibuat.");
  } catch (error) {
    console.error("Gagal membuat registered_devices:", error.message);
  } finally {
    await db.destroy();
  }
};

setupRegisteredDevices();
