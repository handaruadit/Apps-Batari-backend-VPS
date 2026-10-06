//===== (Imports) ======
const db = require("../config/db");
const {
  getRoleFlags,
  normalizeAccessRole,
} = require("./plantAccess.service");
const deyeService = require("../integrations/deye/deye.service");
const deyeRepository = require("../integrations/deye/deye.repository");

const isValidUuid = (str) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(str || "")
  );

// Super admin emails that should automatically get owner access on every new plant
const SUPER_ADMIN_EMAILS = [
  "idewanyomanbayusw@gmail.com",
  "admin@batarienergy.com",
];

/**
 * Ensures all super admin accounts have owner access to a given plant.
 * Uses onConflict to safely skip if already assigned.
 * @param {object} trx - Knex transaction object
 * @param {number|string} plantId - The plant ID
 * @param {string|null} excludeUserId - User ID to skip (already inserted as owner)
 */
const ensureSuperAdminAccess = async (trx, plantId, excludeUserId = null) => {
  try {
    const superAdmins = await trx("users")
      .whereIn("email", SUPER_ADMIN_EMAILS)
      .select("id", "email");

    for (const admin of superAdmins) {
      // Skip the user who already got owner access from the caller
      if (excludeUserId && String(admin.id) === String(excludeUserId)) continue;

      await trx("user_plants")
        .insert({ user_id: admin.id, plant_id: plantId, role: "owner" })
        .onConflict(["user_id", "plant_id"])
        .ignore();
    }
  } catch (err) {
    // Non-critical: log but don't block plant creation
    console.warn(`[ensureSuperAdminAccess] Failed to auto-assign super admins to plant ${plantId}:`, err.message);
  }
};

let lastDeyeSyncCheck = 0;
const DEYE_SYNC_CHECK_INTERVAL_MS = 60 * 1000; // Check at most once every minute

const syncMissingDeyeStations = async () => {
  const now = Date.now();
  if (now - lastDeyeSyncCheck < DEYE_SYNC_CHECK_INTERVAL_MS) return;
  lastDeyeSyncCheck = now;

  try {
    const rawStations = await deyeService.listStations();
    if (!Array.isArray(rawStations) || rawStations.length === 0) return;

    const existingIntegrations = await db("deye_integrations").select("station_id");
    const existingStationIds = new Set(existingIntegrations.map((i) => Number(i.station_id)));

    const missing = rawStations.filter((st) => {
      const sId = Number(st.stationId || st.id);
      return sId && !existingStationIds.has(sId);
    });

    if (missing.length === 0) return;

    console.log(`[Deye AutoSync] Found ${missing.length} unintegrated Deye station(s). Syncing into PostgreSQL plants...`);

    const adminUser = await db("users")
      .whereIn("email", ["idewanyomanbayusw@gmail.com", "idewbayu14@gmail.com", "admin@batarienergy.com"])
      .first("id");
    const ownerUserId = adminUser ? adminUser.id : (await db("users").first("id"))?.id;
    if (!ownerUserId) {
      console.warn("[Deye AutoSync] No user found to assign as plant owner.");
      return;
    }

    const repo = deyeRepository();
    for (const st of missing) {
      try {
        let devices = [];
        try {
          devices = await deyeService.getStationDevices(st.stationId || st.id);
        } catch {}

        await repo.importStation({
          ownerUserId,
          station: {
            stationId: Number(st.stationId || st.id),
            stationName: st.stationName || st.name || `Deye Station ${st.stationId || st.id}`,
            locationAddress: st.locationAddress || st.address || st.location || "Lokasi belum tersedia",
            locationLat: Number(st.locationLat || st.latitude || 0),
            locationLng: Number(st.locationLng || st.longitude || 0),
            regionTimezone: st.regionTimezone || st.timezone || "Asia/Jakarta",
            capacity: Number(st.capacity || st.installedCapacity || 0),
          },
          devices: Array.isArray(devices) ? devices : [],
        });
        console.log(`[Deye AutoSync] Successfully imported station ${st.stationId || st.id} (${st.stationName || st.name}) into plants table.`);
      } catch (err) {
        console.warn(`[Deye AutoSync] Failed to import station ${st.stationId || st.id}:`, err.message);
      }
    }
  } catch (err) {
    console.warn("[Deye AutoSync] Error checking missing Deye stations:", err.message);
  }
};

//===== (getPlants) ======
const getPlants = async (userId, isAdmin = false) => {
  // Seamlessly check & sync any unintegrated Deye station (e.g. KBS Timbangan 3 or newly added ones)
  await syncMissingDeyeStations().catch(() => {});

  const safeUserId = isValidUuid(userId) ? userId : null;
  const query = isAdmin
    ? `
    SELECT
      p.*,
      di.station_id as deye_station_id,
      COALESCE(up.role, 'owner') as role,
      (
        SELECT MAX(sub.ts)
        FROM (
          SELECT MAX(d.created_at) as ts
          FROM plant_devices pd
          JOIN device_data d ON d.device_id = pd.device_id
          WHERE pd.plant_id = p.id
          UNION ALL
          SELECT di.last_source_timestamp as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT di.last_synced_at as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT dd.last_seen as ts
          FROM plant_devices pd
          JOIN deye_devices dd ON dd.device_sn = pd.device_id
          WHERE pd.plant_id = p.id
        ) sub
      ) as latest_data_at,
      EXISTS(
        SELECT 1 FROM plant_devices pd WHERE pd.plant_id = p.id
      ) as has_devices
    FROM plants p
    LEFT JOIN deye_integrations di ON di.plant_id = p.id
    LEFT JOIN user_plants up ON p.id = up.plant_id AND up.user_id = ?::uuid
    ORDER BY p.id ASC
    `
    : `
    SELECT
      p.*,
      di.station_id as deye_station_id,
      up.role,
      (
        SELECT MAX(sub.ts)
        FROM (
          SELECT MAX(d.created_at) as ts
          FROM plant_devices pd
          JOIN device_data d ON d.device_id = pd.device_id
          WHERE pd.plant_id = p.id
          UNION ALL
          SELECT di.last_source_timestamp as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT di.last_synced_at as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT dd.last_seen as ts
          FROM plant_devices pd
          JOIN deye_devices dd ON dd.device_sn = pd.device_id
          WHERE pd.plant_id = p.id
        ) sub
      ) as latest_data_at,
      EXISTS(
        SELECT 1 FROM plant_devices pd WHERE pd.plant_id = p.id
      ) as has_devices
    FROM plants p
    LEFT JOIN deye_integrations di ON di.plant_id = p.id
    JOIN user_plants up ON p.id = up.plant_id
    WHERE up.user_id = ?::uuid
    ORDER BY p.id ASC
    `;

  const result = await db.raw(query, [safeUserId]);

  return result.rows.map((plant) => {
    const roleFlags = getRoleFlags(plant.role);
    const hasRecentData = plant.latest_data_at
      ? Date.now() - new Date(plant.latest_data_at).getTime() <= 15 * 60 * 1000
      : false;
    const isOnline = Boolean(plant.has_devices && hasRecentData);

    return {
      ...plant,
      is_online: isOnline,
      connection_status: isOnline ? "Online" : "Offline",
      role: normalizeAccessRole(plant.role),
      accessRole: normalizeAccessRole(plant.role),
      canManage: isAdmin || roleFlags.canManage,
      canEdit: isAdmin || roleFlags.canEdit,
      canAddDatalogger: isAdmin || roleFlags.canAddDatalogger,
      canDelete: isAdmin || roleFlags.canDelete,
    };
  });
};

//===== (getPlantById) ======
const getPlantById = async (plantId) => {
  return db("plants")
    .select("id", "name", "location", "city", "province")
    .where({ id: plantId })
    .first();
};

//===== (updatePlant) ======
const updatePlant = async (plantId, data) => {
  const allowed = [
    "name",
    "location",
    "latitude",
    "longitude",
    "system_type",
    "pv_capacity",
    "battery_capacity",
    "electricity_price",
    "currency",
    "city",
    "province",
    "postal_code",
  ];
  const payload = {};
  for (const key of allowed) {
    if (data[key] !== undefined) payload[key] = data[key];
  }
  return await db("plants").where({ id: plantId }).update(payload);
};

//===== (deletePlant) ======
const deletePlant = async (plantId) => {
  return db.transaction(async (trx) => {
    await trx("user_plants").where({ plant_id: plantId }).del();
    await trx("plant_devices").where({ plant_id: plantId }).del();
    await trx("device_access_permissions").where({ plant_id: plantId }).del();
    await trx("deye_integrations").where({ plant_id: plantId }).del();
    return trx("plants").where({ id: plantId }).del();
  });
};

//===== (create) ======
const create = async (data, userId) => {
  return await db.transaction(async (trx) => {
    const [plant] = await trx("plants").insert(data).returning("*");
    await trx("user_plants").insert({
      user_id: userId,
      plant_id: plant.id,
      role: "owner",
    });

    // Auto-assign all super admin accounts as owner of the new plant
    await ensureSuperAdminAccess(trx, plant.id, userId);

    return [plant];
  });
};

//===== (Exports) ======
module.exports = {
  create,
  deletePlant,
  getPlantById,
  getPlants,
  updatePlant,
};
