//===== (Environment) ======
require("./env");

//===== (Imports) ======
const knex = require("knex");

//===== (Database Connection) ======
const db = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
});

//===== (Exports) ======
module.exports = db;
