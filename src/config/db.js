//===== (Environment) ======
require("./env");

//===== (Imports) ======
const knex = require("knex");

//===== (Database Connection) ======
const databaseUrl = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");

const db = knex({
  client: "pg",
  connection: databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || "postgres",
        password: String(process.env.DB_PASSWORD || ""),
        database: process.env.DB_NAME || "apidb",
      },
});

//===== (Exports) ======
module.exports = db;
