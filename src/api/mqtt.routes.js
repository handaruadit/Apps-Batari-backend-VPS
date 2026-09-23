//===== (Imports) ======
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");

const { publishMessage } = require("../config/mqtt");

//===== (Publish MQTT Message) ======
router.post("/publish", auth, (req, res) => {
  const { topic, message } = req.body;

  if (!topic || !message) {
    return res.status(400).json({
      status: "error",
      message: "topic and message required",
    });
  }

  publishMessage(topic, message);

  res.json({
    status: "success",
    topic,
    message,
  });
});

//===== (Exports) ======
module.exports = router;