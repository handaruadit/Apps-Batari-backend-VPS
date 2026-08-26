//===== (Imports) ======
const { saveBatteryPowerForPlant } = require("../services/data.service");

const { bmsMqttConfig } = require("./mqtt.config");

const { calculateBatteryPowerKw } = require("./bms.power");

//===== (Konfigurasi BMS Power) ======
const BMS_POWER_CATEGORY = "baterai";
const BMS_POWER_TYPE = "power";
const bmsLatest = {};

//===== (getPayloadDeviceIds) ======
const getPayloadDeviceIds = (parsedData) => [
  ...new Set(parsedData.map((row) => row.deviceId).filter(Boolean)),
];

//===== (getBmsMeasurementRows) ======
const getBmsMeasurementRows = (parsedData) =>
  parsedData.filter(
    (row) =>
      row.deviceId === bmsMqttConfig.deviceId &&
      (row.type === "voltage" || row.type === "current") &&
      row.value !== null &&
      row.value !== undefined &&
      Number.isFinite(Number(row.value)),
  );

// //===== (calculateBatteryPowerKw) ======
// const calculateBatteryPowerKw = (voltage, current) =>
//   (voltage * current) / 1000;

//===== (handleBmsBatteryPower) ======
const handleBmsBatteryPower = async (parsedData) => {
  const payloadDeviceIds = getPayloadDeviceIds(parsedData);
  console.log(
    `BMS parsed device_id: ${payloadDeviceIds.join(", ") || "unknown"}`,
  );

  if (!payloadDeviceIds.includes(bmsMqttConfig.deviceId)) {
    console.warn(
      `BMS payload ignored: device_id ${
        payloadDeviceIds.join(", ") || "unknown"
      } does not match ${bmsMqttConfig.deviceId}`,
    );
    return;
  }

  const bmsRows = getBmsMeasurementRows(parsedData);
  if (bmsRows.length === 0) return;

  if (!bmsLatest[bmsMqttConfig.deviceId]) {
    bmsLatest[bmsMqttConfig.deviceId] = {};
  }

  bmsRows.forEach((row) => {
    bmsLatest[bmsMqttConfig.deviceId][row.type] = Number(row.value);
  });

  console.log("BMS voltage/current detected");

  const { voltage, current } = bmsLatest[bmsMqttConfig.deviceId];
  if (!Number.isFinite(voltage) || !Number.isFinite(current)) return;

  const powerKw = calculateBatteryPowerKw(voltage, current);
  const saved = await saveBatteryPowerForPlant({
    plantName: bmsMqttConfig.targetPlantName,
    deviceId: bmsMqttConfig.targetDeviceId,
    powerKw,
  });

  if (saved) {
    console.log(
      `BMS Battery Power: ${powerKw} kW -> ${BMS_POWER_CATEGORY}/${BMS_POWER_TYPE}`,
    );
    console.log(
      `Saved BMS Battery power for plant ${bmsMqttConfig.targetPlantName} device ${saved.device_id}`,
    );
  } else {
    console.warn(
      `BMS Battery power was not saved for plant ${bmsMqttConfig.targetPlantName}`,
    );
  }
};

//===== (Exports) ======
module.exports = {
  calculateBatteryPowerKw,
  handleBmsBatteryPower,
};
