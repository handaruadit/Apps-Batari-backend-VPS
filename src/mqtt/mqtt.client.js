//===== (Imports) ======
const mqtt = require("mqtt");
const {
  bmsMqttConfig,
  createClientOptions,
  createConnectUrl,
  isBmsMqttConfigured,
  primaryMqttConfig,
} = require("./mqtt.config");
const {
  registerBmsMqttHandlers,
  registerPrimaryMqttHandlers,
} = require("./mqtt.handlers");

//===== (summarizeMqttConfig) ======
const summarizeMqttConfig = (label, config) => {
  console.log(`${label} config`, {
    protocol: config.protocol,
    host: config.host,
    port: config.port,
    topic: config.topic,
    clientId: config.clientId,
    usernameSet: Boolean(config.username),
  });
};

//===== (Primary MQTT Client) ======
const client = mqtt.connect(
  createConnectUrl(primaryMqttConfig),
  createClientOptions(primaryMqttConfig),
);

//===== (BMS MQTT Client) ======
const bmsClient = isBmsMqttConfigured()
  ? mqtt.connect(
      createConnectUrl(bmsMqttConfig),
      createClientOptions(bmsMqttConfig),
    )
  : null;

//===== (MQTT Configuration Summary) ======
summarizeMqttConfig("MQTT", {
  ...primaryMqttConfig,
  topic: "app/+/baterai, app/+/inverter",
});
summarizeMqttConfig("BMS MQTT", bmsMqttConfig);

//===== (MQTT Event Registration) ======
registerPrimaryMqttHandlers(client);
registerBmsMqttHandlers(bmsClient);

//===== (publishMessage) ======
const publishMessage = (topic, message) => {
  if (!client.connected) {
    console.log("MQTT not connected");
    return;
  }

  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error("Publish error:", err);
    } else {
      console.log(`Published to ${topic}`);
      console.log(`Message: ${message}`);
    }
  });
};

//===== (Exports) ======
module.exports = {
  client,
  bmsClient,
  publishMessage,
};
