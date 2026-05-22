const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// routes
app.use("/api/auth", require("./api/auth.routes"));
app.use("/api/data", require("./api/data.routes"));
app.use("/api/plant", require("./api/plant.routes"));
app.use("/api/mqtt", require("./api/mqtt.routes"));
app.use("/api/admin", require("./api/admin.routes"));

module.exports = app;
