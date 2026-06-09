require("dotenv").config();

const http = require("http");
const app = require("./app");
const { initSocket } = require("./sockets/socket");
const { startAutomaticPlantDataSender } = require("./services/mockPlantData.service");

// init MQTT
require("./config/mqtt");

const server = http.createServer(app);

// init websocket
initSocket(server);
// startAutomaticPlantDataSender();

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server API berjalan di http://${HOST}:${PORT}`);
});
