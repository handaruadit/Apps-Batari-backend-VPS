//===== (Imports) ======
const { Server } = require("socket.io");

//===== (Socket State) ======
let io;

//===== (initSocket) ======
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    //===== (join_device Event) ======
    socket.on("join_device", (deviceId) => {
      socket.join(deviceId);
      console.log(`📥 ${socket.id} join device ${deviceId}`);
    });

    //===== (disconnect Event) ======
    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });
};

//===== (getIO) ======
const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized!");
  }
  return io;
};

//===== (Exports) ======
module.exports = {
  initSocket,
  getIO,
};
