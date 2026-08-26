//===== (sendDeviceAccessDenied) ======
const sendDeviceAccessDenied = (res) => {
  return res.status(403).json({
    success: false,
    message: "Anda tidak memiliki akses ke plant ini",
  });
};

//===== (isDeviceAccessDenied) ======
const isDeviceAccessDenied = (err) => err.message === "Access_Denied";

//===== (getDeviceIdValues) ======
const getDeviceIdValues = (devices) => {
  return devices.map((device) => device.device_id);
};

//===== (selectRequestedDeviceIds) ======
const selectRequestedDeviceIds = (devices, query = {}) => {
  const availableDeviceIds = getDeviceIdValues(devices).map((deviceId) =>
    String(deviceId),
  );
  const requestedDeviceIds = [query.device_id, query.deviceId]
    .map((deviceId) => String(deviceId || "").trim())
    .filter(Boolean);
  const uniqueRequestedDeviceIds = [...new Set(requestedDeviceIds)];

  if (uniqueRequestedDeviceIds.length === 0) {
    return availableDeviceIds;
  }

  if (uniqueRequestedDeviceIds.length !== 1) {
    throw new Error("Access_Denied");
  }

  const [requestedDeviceId] = uniqueRequestedDeviceIds;
  if (!availableDeviceIds.includes(requestedDeviceId)) {
    throw new Error("Access_Denied");
  }

  return [requestedDeviceId];
};

//===== (groupDataByCategoryAndType) ======
const groupDataByCategoryAndType = (data, formatItem) => {
  return data.reduce((accumulator, currentItem) => {
    const category = currentItem.category;
    if (!accumulator[category]) {
      accumulator[category] = {};
    }

    accumulator[category][currentItem.type] = formatItem
      ? formatItem(currentItem)
      : currentItem;
    return accumulator;
  }, {});
};

//===== (Exports) ======
module.exports = {
  getDeviceIdValues,
  groupDataByCategoryAndType,
  isDeviceAccessDenied,
  selectRequestedDeviceIds,
  sendDeviceAccessDenied,
};
