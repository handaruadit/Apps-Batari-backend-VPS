//===== (Imports) ======
const {
  validateAssignDevicePayload,
  validateAssignUserPayload,
  validatePlantCreatePayload,
} = require("./plant.validator");

//===== (Data Plant Valid) ======
const validPlant = {
  name: "Plant Utama",
  location: "Jakarta",
  latitude: -6.2,
  longitude: 106.8,
  system_type: "hybrid",
  pv_capacity: 10,
  currency: "IDR",
};

//===== (Validasi Pembuatan Plant) ======
describe("validatePlantCreatePayload", () => {
  test("menerima payload plant yang valid", () => {
    expect(validatePlantCreatePayload(validPlant)).toBeNull();
  });

  test("mempertahankan validasi field wajib", () => {
    expect(
      validatePlantCreatePayload({ ...validPlant, name: "" }),
    ).toBe("name is required");
  });

  test("mempertahankan batas latitude dan longitude", () => {
    expect(
      validatePlantCreatePayload({ ...validPlant, latitude: 91 }),
    ).toBe("latitude must be between -90 and 90");
    expect(
      validatePlantCreatePayload({ ...validPlant, longitude: 181 }),
    ).toBe("longitude must be between -180 and 180");
  });
});

//===== (Validasi Assignment) ======
describe("plant assignment validators", () => {
  test("menerima alias field device dan plant", () => {
    expect(
      validateAssignDevicePayload({ device_id: "BMS-01", plant_id: 1 }),
    ).toBeNull();
    expect(
      validateAssignDevicePayload({ deviceId: "BMS-01", plantId: 1 }),
    ).toBeNull();
  });

  test("mempertahankan validasi assignment user", () => {
    expect(
      validateAssignUserPayload({
        email: "user@example.com",
        plantId: 1,
        role: "viewer",
      }),
    ).toBeNull();
    expect(validateAssignUserPayload({})).toBe("email is required");
  });
});
