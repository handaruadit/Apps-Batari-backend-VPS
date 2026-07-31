const db = require("../src/config/db");

const checkUsers = async () => {
  try {
    const columns = await db("information_schema.columns")
      .where({
        table_schema: "public",
        table_name: "users",
      })
      .select("column_name")
      .orderBy("ordinal_position", "asc");

    console.log("\n=== KOLOM TABEL USERS ===");

    console.table(columns);

    const users = await db("users").select("*").orderBy("id", "asc");

    if (users.length === 0) {
      console.log("Belum ada akun di tabel users.");
      return;
    }

    // Jangan tampilkan password atau password hash
    const safeUsers = users.map((user) => {
      const {
        password,
        password_hash,
        passwordHash,
        reset_token,
        resetToken,
        ...safeData
      } = user;

      return safeData;
    });

    console.log(`\n=== DAFTAR ${safeUsers.length} USER ===`);

    console.table(safeUsers);
  } catch (error) {
    console.error("Gagal membaca akun:", error.message);
  } finally {
    await db.destroy();
  }
};

checkUsers();
