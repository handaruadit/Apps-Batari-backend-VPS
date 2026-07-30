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

//===== (Start Server) ======
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server API berjalan di http://${HOST}:${PORT}`);
});
