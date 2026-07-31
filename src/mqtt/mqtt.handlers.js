//===== (Imports) ======
const { getIO } = require("../sockets/socket");
const { saveDeviceData } = require("../services/data.service");
const {
  bmsMqttConfig,
  primaryMqttConfig,
} = require("./mqtt.config");
const {
  parsePayloadRows,
  previewPayload,
  topicMatchesSubscription,
} = require("./payload.parser");
// const { handleBmsBatteryPower } = require("./bms.service");
const { parseBmsPayloadRows } = require("./bms.payload.parser");

//===== (registerPrimaryMqttHandlers) ======
const registerPrimaryMqttHandlers = (client) => {
  //===== (Primary Connect Handler) ======
  client.on("connect", () => {
    console.log("MQTT Connected");
    try {
      client.subscribe(primaryMqttConfig.topics, (err) => {
        if (err) {
          console.error("MQTT Subscribe Error:", err.message);
          return;
        }

        console.log(
          "Subscribed to All device data: app/+/baterai, app/+/inverter",
        );
      });
    } catch (err) {
      console.error("MQTT Subscribe Error:", err.message);
    }
  });

  //===== (Primary Error Handler) ======
  client.on("error", (err) => {
    console.error("MQTT Error:", err.message);
  });

  //===== (Primary Reconnect Handler) ======
  client.on("reconnect", () => {
    console.log("Reconnecting MQTT...");
  });

  //===== (Primary Close Handler) ======
  client.on("close", () => {
    console.warn("MQTT connection closed");
  });

  //===== (Primary Offline Handler) ======
  client.on("offline", () => {
    console.warn("MQTT client offline");
  });

  //===== (Primary Message Handler) ======
  client.on("message", async (topic, message) => {
    try {
      console.log(
        `MQTT message received: topic=${topic}, bytes=${message.length}`,
      );
      if (bmsMqttConfig.debugEnabled) {
        console.log("MQTT payload preview:", previewPayload(message));
      }

      const payload = JSON.parse(message.toString());
      const parsedData = parsePayloadRows(payload);
      if (parsedData.length === 0) return;

      const deviceId = parsedData[0].deviceId;

      try {
        const io = getIO();
        io.to(deviceId).emit("mqtt_message", parsedData);
      } catch (err) {
        console.error("WEBSOCKET Error:", err.message);
      }

      await saveDeviceData(parsedData);
      console.log("Parsed Data:", parsedData.length, "rows");
    } catch (err) {
      console.error("MQTT ERROR:", err.message);
    }
  });
};

//===== (registerBmsMqttHandlers) ======
const registerBmsMqttHandlers = (bmsClient) => {
  if (!bmsClient) {
    console.warn("BMS MQTT disabled: BMS_MQTT_* env is incomplete");
    return;
  }

  //===== (BMS Connect Handler) ======
  bmsClient.on("connect", () => {
    console.log("BMS MQTT Connected");
    bmsClient.subscribe(bmsMqttConfig.topic, (err) => {
      if (err) {
        console.error("BMS MQTT Subscribe Error:", err.message);
        return;
      }

      console.log(`Subscribed to BMS device data: ${bmsMqttConfig.topic}`);
    });
  });

  //===== (BMS Error Handler) ======
  bmsClient.on("error", (err) => {
    console.error("BMS MQTT Error:", err.message);
  });

  //===== (BMS Reconnect Handler) ======
  bmsClient.on("reconnect", () => {
    console.log("Reconnecting BMS MQTT...");
  });

  //===== (BMS Close Handler) ======
  bmsClient.on("close", () => {
    console.warn("BMS MQTT connection closed");
  });

  //===== (BMS Offline Handler) ======
  bmsClient.on("offline", () => {
    console.warn("BMS MQTT client offline");
  });

  //===== (BMS Message Handler) ======
  // bmsClient.on("message", async (topic, message) => {
  //   try {
  //     console.log(
  //       `BMS MQTT message received: topic=${topic}, bytes=${message.length}`,
  //     );
  //     if (bmsMqttConfig.debugEnabled) {
  //       console.log("BMS MQTT payload preview:", previewPayload(message));
  //     }

  //     if (!topicMatchesSubscription(bmsMqttConfig.topic, topic)) {
  //       console.warn(
  //         `BMS MQTT topic ignored: ${topic} does not match ${bmsMqttConfig.topic}`,
  //       );
  //       return;
  //     }

  //     let payload;
  //     try {
  //       payload = JSON.parse(message.toString());
  //     } catch (err) {
  //       console.error(`BMS MQTT payload JSON parse failed: ${err.message}`);
  //       return;
  //     }

  //     const parsedData = parsePayloadRows(payload);
  //     if (parsedData.length === 0) {
  //       console.warn("BMS MQTT payload ignored: no parsable rows");
  //       return;
  //     }

  //     await handleBmsBatteryPower(parsedData);
  //     console.log("Parsed Data:", parsedData.length, "rows");
  //   } catch (err) {
  //     console.error("BMS MQTT ERROR:", err.message);
  //   }
  // });

  //===== (BMS Message Handler) ======
  bmsClient.on("message", async (topic, message) => {
    try {
      console.log(
        `BMS MQTT message received: topic=${topic}, bytes=${message.length}`,
      );

      if (!topicMatchesSubscription(bmsMqttConfig.topic, topic)) {
        console.warn(`BMS MQTT topic ignored: ${topic}`);

        return;
      }

      const payloadText = message.toString();

      if (bmsMqttConfig.debugEnabled) {
        console.log("BMS MQTT payload:", previewPayload(message));
      }

      const normalizedPayload = payloadText.trim().toLowerCase();

      if (topic.endsWith("/status")) {
        if (normalizedPayload === "online" || normalizedPayload === "offline") {
          console.log(`BMS Device Status: ${normalizedPayload}`);
        } else {
          console.warn(`BMS status tidak dikenal: ${payloadText}`);
        }

        return;
      }

      if (!topic.endsWith("/data")) {
        console.warn(`BMS topic diabaikan karena bukan topic data: ${topic}`);

        return;
      }

      let payload;

      try {
        payload = JSON.parse(payloadText);
      } catch (error) {
        console.error(`BMS payload bukan JSON yang valid: ${error.message}`);

        return;
      }

      const result = parseBmsPayloadRows(payload, Date.now());

      if (!result.valid) {
        console.warn("BMS payload tidak valid:");

        result.errors.forEach((error) => {
          console.warn(`- ${error}`);
        });

        return;
      }

      console.log(`BMS payload berhasil diproses: ${result.rows.length} baris`);

      console.dir(result.rows, {
        depth: null,
      });

      const insertedRows = await saveDeviceData(result.rows);

      if (insertedRows.length !== result.rows.length) {
        console.error(
          `BMS DB gagal: hanya ${insertedRows.length} dari ${result.rows.length} baris tersimpan`,
        );

        return;
      }

      console.log(`BMS DB berhasil: ${insertedRows.length} baris tersimpan`);

      console.table(
        insertedRows.map((row) => ({
          id: row.id,
          device_id: row.device_id,
          category: row.category,
          type: row.type,
          value: row.value,
          created_at: row.created_at,
        })),
      );
    } catch (error) {
      console.error("BMS MQTT ERROR:", error.message);
    }
  });
};;;

//===== (Exports) ======
module.exports = {
  registerPrimaryMqttHandlers,
  registerBmsMqttHandlers,
};
