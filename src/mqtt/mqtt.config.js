//===== (Environment) ======
require("../config/env");

//===== (Primary MQTT Configuration) ======
const PRIMARY_MQTT_SUBSCRIPTIONS = [
  "app/+/baterai",
  "app/+/inverter",
];

const primaryMqttConfig = {
  protocol: process.env.MQTT_PROTOCOL,
  host: process.env.MQTT_HOST,
  port: process.env.MQTT_PORT,
  clientId: process.env.MQTT_CLIENT_ID,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  topics: PRIMARY_MQTT_SUBSCRIPTIONS,
};

//===== (BMS MQTT Configuration) ======
const bmsMqttConfig = {
  protocol: process.env.BMS_MQTT_PROTOCOL,
  host: process.env.BMS_MQTT_HOST,
  port: process.env.BMS_MQTT_PORT,
  clientId: process.env.BMS_MQTT_CLIENT_ID,
  username: process.env.BMS_MQTT_USERNAME || undefined,
  password: process.env.BMS_MQTT_PASSWORD || undefined,
  topic: process.env.BMS_MQTT_TOPIC,
  deviceId: process.env.BMS_DEVICE_ID || "BS26040012",
  targetPlantName:
    process.env.BMS_TARGET_PLANT_NAME || "Kantor Batari Energy",
  targetDeviceId: process.env.BMS_TARGET_DEVICE_ID || null,
  debugEnabled: process.env.BMS_MQTT_DEBUG === "true",
};

//===== (createConnectUrl) ======
const createConnectUrl = ({ protocol, host, port }) =>
  `${protocol}://${host}:${port}`;

//===== (createClientOptions) ======
const createClientOptions = (config) => ({
  clientId: config.clientId,
  username: config.username,
  password: config.password,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
});

//===== (isBmsMqttConfigured) ======
const isBmsMqttConfigured = () =>
  Boolean(
    bmsMqttConfig.protocol &&
      bmsMqttConfig.host &&
      bmsMqttConfig.port &&
      bmsMqttConfig.clientId &&
      bmsMqttConfig.topic,
  );

//===== (Exports) ======
module.exports = {
  PRIMARY_MQTT_SUBSCRIPTIONS,
  bmsMqttConfig,
  createClientOptions,
  createConnectUrl,
  isBmsMqttConfigured,
  primaryMqttConfig,
};
