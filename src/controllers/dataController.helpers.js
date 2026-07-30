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
  sendDeviceAccessDenied,
};
