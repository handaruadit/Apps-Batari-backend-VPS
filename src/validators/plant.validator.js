//===== (validatePlantCreatePayload) ======
const validatePlantCreatePayload = (payload) => {
  const requiredFields = [
    "name",
    "location",
    "latitude",
    "longitude",
    "system_type",
    "pv_capacity",
    "currency",
  ];

  for (const field of requiredFields) {
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      payload[field] === ""
    ) {
      return `${field} is required`;
    }
  }

  if (typeof payload.latitude !== "number" || Number.isNaN(payload.latitude)) {
    return "latitude must be a valid number";
  }
  if (payload.latitude < -90 || payload.latitude > 90) {
    return "latitude must be between -90 and 90";
  }

  if (
    typeof payload.longitude !== "number" ||
    Number.isNaN(payload.longitude)
  ) {
    return "longitude must be a valid number";
  }
  if (payload.longitude < -180 || payload.longitude > 180) {
    return "longitude must be between -180 and 180";
  }

  if (
    typeof payload.pv_capacity !== "number" ||
    Number.isNaN(payload.pv_capacity)
  ) {
    return "pv_capacity must be a valid number";
  }

  if (
    payload.battery_capacity !== undefined &&
    payload.battery_capacity !== null &&
    payload.battery_capacity !== "" &&
    (typeof payload.battery_capacity !== "number" ||
      Number.isNaN(payload.battery_capacity))
  ) {
    return "battery_capacity must be a valid number";
  }

  if (
    payload.electricity_price !== undefined &&
    payload.electricity_price !== null &&
    payload.electricity_price !== "" &&
    (typeof payload.electricity_price !== "number" ||
      Number.isNaN(payload.electricity_price))
  ) {
    return "electricity_price must be a valid number";
  }

  return null;
};

//===== (validateAssignDevicePayload) ======
const validateAssignDevicePayload = (payload) => {
  if (!payload.deviceId && !payload.device_id) return "deviceId is required";
  const plantId = payload.plant_id || payload.plantId;
  if (!plantId) return "plant_id is required";
  return null;
};

//===== (validateAssignUserPayload) ======
const validateAssignUserPayload = (payload) => {
  if (!payload.email) return "email is required";
  const plantId = payload.plant_id || payload.plantId;
  if (!plantId) return "plant_id is required";
  if (!payload.role) return "role is required";
  return null;
};

//===== (Exports) ======
module.exports = {
  validateAssignDevicePayload,
  validateAssignUserPayload,
  validatePlantCreatePayload,
};
