//===== (Load Environment Variables) ======
const path = require("path");
const dotenv = require("dotenv");

// Explicitly load .env from project root regardless of PM2 execution directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

// Timestamp database lama memakai `timestamp without time zone`. Tetapkan TZ
// proses secara eksplisit agar parsing/serialisasi tidak bergantung pada OS.
process.env.TZ = process.env.APP_TIME_ZONE || "Asia/Jakarta";

//===== (Exports) ======
module.exports = process.env;
