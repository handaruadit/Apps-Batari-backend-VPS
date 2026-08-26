//===== (Load Environment Variables) ======
require("dotenv").config();

// Timestamp database lama memakai `timestamp without time zone`. Tetapkan TZ
// proses secara eksplisit agar parsing/serialisasi tidak bergantung pada OS.
process.env.TZ = process.env.APP_TIME_ZONE || "Asia/Jakarta";

//===== (Exports) ======
module.exports = process.env;
