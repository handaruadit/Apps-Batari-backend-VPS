const db = require("../src/config/db");

const checkBmsData = async () => {
  try {
    const rows = await db("device_data")
      .where({
        device_id: "BMS_Jiabaida",
        category: "baterai",
      })
      .whereIn("type", ["voltage", "current", "soc", "power"])
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(20);

    if (rows.length === 0) {
      console.log("Belum ada data BMS di database.");

      return;
    }

    console.log(`Ditemukan ${rows.length} data BMS:\n`);

    console.table(
      rows.map((row) => ({
        id: row.id,
        device_id: row.device_id,
        category: row.category,
        type: row.type,
        value: row.value,
        created_at: row.created_at,
      })),
    );
  } catch (error) {
    console.error("Gagal membaca database:", error.message);
  } finally {
    await db.destroy();
  }
};

checkBmsData();
