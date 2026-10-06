const db = require("../src/config/db");

const updateSuperAdminRoles = async () => {
  try {
    console.log("=== MEMPERBARUI ROLE SUPER ADMIN DI TABEL USERS ===");

    const targetEmails = [
      "admin@batarienergy.com",
      "idewanyomanbayusw@gmail.com",
    ];

    const updated = await db("users")
      .whereRaw("LOWER(email) IN (?, ?)", targetEmails)
      .update({
        role: "super_admin",
      })
      .returning(["id", "email", "role", "name"]);

    console.log("Berhasil memperbarui akun menjadi super_admin:");
    console.table(updated);

    const allSuperAdmins = await db("users")
      .whereIn("role", ["super_admin", "superadmin"])
      .select("id", "email", "role", "name");

    console.log("\n=== DAFTAR SELURUH AKUN SUPER ADMIN ===");
    console.table(allSuperAdmins);
  } catch (error) {
    console.error("Gagal memperbarui role:", error.message);
  } finally {
    await db.destroy();
  }
};

updateSuperAdminRoles();
