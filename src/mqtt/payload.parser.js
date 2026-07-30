//===== (previewPayload) ======
const previewPayload = (message, maxLength = 500) => {
  const raw = message.toString();
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
};

//===== (topicMatchesSubscription) ======
const topicMatchesSubscription = (subscription, topic) => {
  if (!subscription || !topic) return false;

  const subscriptionParts = String(subscription).split("/");
  const topicParts = String(topic).split("/");

  for (let index = 0; index < subscriptionParts.length; index += 1) {
    const part = subscriptionParts[index];

    if (part === "#") {
      return index === subscriptionParts.length - 1;
    }

    if (part === "+") {
      if (topicParts[index] === undefined) return false;
      continue;
    }

    if (part !== topicParts[index]) return false;
  }

  return subscriptionParts.length === topicParts.length;
};

//===== (parseValue) ======
const parseValue = (value) => {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") return value;

  if (typeof value === "boolean") return value ? 1 : 0;

  if (!isNaN(value)) return Number(value);

  return null;
};

//===== (parsePayloadRows) ======
const parsePayloadRows = (payload) => {
  const deviceId = payload.deviceId || payload.device_id;
  if (!deviceId) return [];

  if (payload.category && payload.type && payload.value !== undefined) {
    return [
      {
        deviceId,
        category: payload.category,
        type: payload.type,
        value: parseValue(payload.value),
        timestamp: payload.created_at
          ? new Date(payload.created_at).getTime()
          : Date.now(),
      },
    ];
  }

  const timestamp = Date.now();
  const parsedData = [];

  for (const category in payload) {
    if (category === "deviceId" || category === "device_id") continue;

    const data = payload[category];

    if (typeof data !== "object" || data === null) continue;

    for (const key in data) {
      const value = data[key];

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          parsedData.push({
            deviceId,
            category,
            type: `${key}_${index + 1}`,
            value: parseValue(item),
            timestamp,
          });
        });
      } else {
        parsedData.push({
          deviceId,
          category,
          type: key,
          value: parseValue(value),
          timestamp,
        });
      }
    }
  }

  return parsedData;
};

//===== (Exports) ======
module.exports = {
  previewPayload,
  topicMatchesSubscription,
  parseValue,
  parsePayloadRows,
};
