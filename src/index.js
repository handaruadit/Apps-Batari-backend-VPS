//===== (Environment) ======
require("./config/env");

//===== (Imports) ======
const http = require("http");
const app = require("./app");
const { initSocket } = require("./sockets/socket");
const { startAutomaticPlantDataSender } = require("./services/mockPlantData.service");

//===== (Initialize MQTT) ======
require("./config/mqtt");

const server = http.createServer(app);

//===== (Initialize WebSocket) ======
initSocket(server);

//===== (Optional MockPlant Sender) ======
// startAutomaticPlantDataSender();

//===== (Server Configuration) ======
const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0";

const { auditAndSyncDeyePlants } = require("./services/plantAuditSync.service");

//===== (Start Server) ======
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server API berjalan di http://${HOST}:${PORT}`);

  // Otomatis audit dan sinkronisasi seluruh stasiun Deye Cloud ke PostgreSQL saat server dinyalakan
  auditAndSyncDeyePlants().catch((err) => {
    console.warn(`[Plant Audit] Startup sync non-fatal error: ${err.message}`);
  });
});
