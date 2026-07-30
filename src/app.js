//===== (Imports) ======
const express = require("express");
const cors = require("cors");

//===== (Application) ======
const app = express();

//===== (Global Middleware) ======
app.use(cors());
app.use(express.json());

//===== (Routes) ======
app.use("/api/auth", require("./api/auth.routes"));
app.use("/api/data", require("./api/data.routes"));
app.use("/api/plant", require("./api/plant.routes"));
app.use("/api/mqtt", require("./api/mqtt.routes"));

//===== (Exports) ======
module.exports = app;
