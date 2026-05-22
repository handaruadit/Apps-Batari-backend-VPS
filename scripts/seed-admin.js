require("dotenv").config();
const db = require("../src/config/db");
const { seedAdminUser } = require("../src/services/auth.service");

const run = async () => {
  try {
    const admin = await seedAdminUser();
    console.log(`Admin ready: ${admin.email} (${admin.role})`);
  } catch (err) {
    console.error("Failed to seed admin user:", err.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
};

run();
