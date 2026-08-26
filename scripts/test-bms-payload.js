const { validateBmsPayload } = require("../src/mqtt/bms.payload.contract");

const payloadValid = {
  device_id: "BMS_Jiabaida",
  voltage: 52.99,
  current: -10,
  soc: 49,
  waktu: "2026-07-31T08:00:00+07:00",
};

const payloadWrapped = {
  source: "jbd_bms",
  timestamp: "2026-07-31T01:00:00.000Z",
  data: {
    device_id: "BMS_Jiabaida",
    voltage: "52.99",
    current: "-10",
    soc: "49",
  },
};

const payloadInvalid = {
  device_id: "",
  voltage: "bukan angka",
  current: null,
  soc: 120,
  created_at: "waktu tidak valid",
};

console.log("\n=== PAYLOAD BIASA ===");
console.log(validateBmsPayload(payloadValid));

console.log("\n=== PAYLOAD DENGAN DATA WRAPPER ===");
console.log(validateBmsPayload(payloadWrapped));

console.log("\n=== PAYLOAD TIDAK VALID ===");
console.log(validateBmsPayload(payloadInvalid));
