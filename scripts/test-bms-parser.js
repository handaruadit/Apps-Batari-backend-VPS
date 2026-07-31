const { parseBmsPayloadRows } = require("../src/mqtt/bms.payload.parser");

const payloadValid = {
  device_id: "BMS_Jiabaida",
  voltage: 52.99,
  current: -10,
  soc: 49,
  waktu: "2026-07-31T08:00:00+07:00",
};

const payloadWithoutTime = {
  device_id: "BMS_Jiabaida",
  voltage: "52.99",
  current: "-10",
  soc: "49",
};

const payloadInvalid = {
  device_id: "",
  voltage: "bukan angka",
  current: null,
  soc: 120,
};

// Waktu ketika pesan diterima MQTT
const receivedAt = "2026-07-31T08:30:00+07:00";

console.log("\n=== PARSER PAYLOAD VALID ===");

console.dir(parseBmsPayloadRows(payloadValid), {
  depth: null,
});

console.log("\n=== PARSER FALLBACK WAKTU ===");

console.dir(parseBmsPayloadRows(payloadWithoutTime, receivedAt), {
  depth: null,
});

console.log("\n=== PARSER PAYLOAD TIDAK VALID ===");

console.dir(parseBmsPayloadRows(payloadInvalid), {
  depth: null,
});
