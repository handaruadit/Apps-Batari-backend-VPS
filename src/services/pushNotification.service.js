//===== (Imports) ======
const axios = require("axios");
const db = require("../config/db");

// Expo Push API endpoint
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Ensure table user_push_tokens exists in PostgreSQL
let tableInitialized = false;
async function ensurePushTokenTable() {
  if (tableInitialized) return;
  try {
    const exists = await db.schema.hasTable("user_push_tokens");
    if (!exists) {
      await db.schema.createTable("user_push_tokens", (table) => {
        table.increments("id").primary();
        table.integer("user_id").unsigned().notNullable();
        table.string("push_token").notNullable().unique();
        table.string("platform").defaultTo("android");
        table.timestamps(true, true);
        table.index(["user_id"]);
        table.index(["push_token"]);
      });
      console.log("[push] Created table user_push_tokens successfully");
    }
    tableInitialized = true;
  } catch (err) {
    console.warn("[push] Table initialization warning:", err.message);
  }
}

//===== (savePushToken) ======
async function savePushToken({ userId, pushToken, platform = "android" }) {
  if (!userId || !pushToken) return false;
  await ensurePushTokenTable();

  try {
    const existing = await db("user_push_tokens").where({ push_token: pushToken }).first();
    if (existing) {
      await db("user_push_tokens")
        .where({ push_token: pushToken })
        .update({
          user_id: userId,
          platform,
          updated_at: db.fn.now(),
        });
    } else {
      await db("user_push_tokens").insert({
        user_id: userId,
        push_token: pushToken,
        platform,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    }
    return true;
  } catch (err) {
    console.error("[push] Failed to save push token:", err.message);
    return false;
  }
}

//===== (removePushToken) ======
async function removePushToken({ userId, pushToken }) {
  await ensurePushTokenTable();
  try {
    const query = db("user_push_tokens");
    if (pushToken) query.where({ push_token: pushToken });
    if (userId) query.where({ user_id: userId });
    await query.del();
    return true;
  } catch (err) {
    console.error("[push] Failed to remove push token:", err.message);
    return false;
  }
}

//===== (sendExpoPushNotifications) ======
// Sends payload to Expo Push REST API
async function sendExpoPushNotifications(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return { success: false, count: 0 };

  const validMessages = messages.filter((m) => m && m.to && String(m.to).startsWith("ExponentPushToken"));
  if (validMessages.length === 0) {
    return { success: false, count: 0, reason: "no_valid_tokens" };
  }

  try {
    const response = await axios.post(EXPO_PUSH_URL, validMessages, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    const data = response.data?.data;
    console.log(`[push] Sent ${validMessages.length} push notification(s) via Expo API`);
    return { success: true, count: validMessages.length, data };
  } catch (error) {
    console.error("[push] Expo push API call failed:", error.response?.data || error.message);
    return { success: false, count: 0, error: error.message };
  }
}

//===== (sendPushToUser) ======
async function sendPushToUser(userId, { title, body, data = {} }) {
  await ensurePushTokenTable();
  const tokens = await db("user_push_tokens").where({ user_id: userId }).select("push_token");
  if (!tokens || tokens.length === 0) {
    return { success: false, reason: "user_has_no_tokens" };
  }

  const messages = tokens.map((t) => ({
    to: t.push_token,
    sound: "default",
    title,
    body,
    data,
    channelId: "station-alerts",
    priority: "high",
  }));

  return sendExpoPushNotifications(messages);
}

// Track plant status transitions in memory to debounce & alert only on actual changes
const plantStatusCache = new Map();

//===== (notifyPlantStatusChange) ======
async function notifyPlantStatusChange({
  plantId,
  plantName = "Solar Plant",
  isOnline,
  language = "id",
}) {
  await ensurePushTokenTable();
  const idStr = String(plantId);
  const prevIsOnline = plantStatusCache.get(idStr);

  // If first time encountering, record state and return
  if (prevIsOnline === undefined) {
    plantStatusCache.set(idStr, isOnline);
    return { alerted: false, reason: "initial_state_recorded" };
  }

  // If no change, return
  if (prevIsOnline === isOnline) {
    return { alerted: false, reason: "no_state_change" };
  }

  // Update cache
  plantStatusCache.set(idStr, isOnline);

  const isEn = language === "en";
  const title = isOnline
    ? (isEn ? `Station Online: ${plantName}` : `Stasiun Online: ${plantName}`)
    : (isEn ? `Station Offline: ${plantName}` : `Stasiun Offline: ${plantName}`);

  const body = isOnline
    ? (isEn
        ? `Station '${plantName}' is back online and actively generating power.`
        : `Stasiun '${plantName}' kembali terhubung dan aktif menghasilkan daya.`)
    : (isEn
        ? `Station '${plantName}' has been disconnected from the network (Offline).`
        : `Stasiun '${plantName}' telah terputus dari jaringan (Offline).`);

  // Target all users associated with this plant OR all super admins
  let targetUserIds = [];
  try {
    const userPlantRows = await db("user_plants").where({ plant_id: plantId }).select("user_id");
    targetUserIds = userPlantRows.map((r) => r.user_id);
  } catch {
    // fallback to super admins
  }

  const superAdmins = await db("users")
    .whereIn("email", [
      "idewanyomanbayusw@gmail.com",
      "admin@batarienergy.com",
      "idewbayu14@gmail.com",
    ])
    .orWhere({ role: "super_admin" })
    .select("id");

  superAdmins.forEach((sa) => {
    if (!targetUserIds.includes(sa.id)) targetUserIds.push(sa.id);
  });

  if (targetUserIds.length === 0) {
    return { alerted: false, reason: "no_target_users" };
  }

  const tokens = await db("user_push_tokens")
    .whereIn("user_id", targetUserIds)
    .select("push_token");

  if (!tokens || tokens.length === 0) {
    return { alerted: false, reason: "no_tokens_registered" };
  }

  const messages = tokens.map((t) => ({
    to: t.push_token,
    sound: "default",
    title,
    body,
    data: {
      plantId: String(plantId),
      type: isOnline ? "station_online" : "station_offline",
    },
    channelId: "station-alerts",
    priority: "high",
  }));

  return sendExpoPushNotifications(messages);
}

//===== (Exports) ======
module.exports = {
  ensurePushTokenTable,
  savePushToken,
  removePushToken,
  sendExpoPushNotifications,
  sendPushToUser,
  notifyPlantStatusChange,
};
