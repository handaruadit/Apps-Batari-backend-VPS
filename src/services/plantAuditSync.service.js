//===== (Imports) ======
const db = require("../config/db");
const deyeService = require("../integrations/deye/deye.service");
const { getStationDeviceId } = require("../integrations/deye/deye.mapper");

//===== (Super Admin Emails) ======
const SUPER_ADMIN_EMAILS = [
  "idewanyomanbayusw@gmail.com",
  "admin@batarienergy.com",
];

/**
 * Audits all operational stations from Deye Cloud API against the PostgreSQL database.
 * If any stations are missing or unintegrated, automatically registers them
 * into plants, deye_integrations, registered_devices, plant_devices, and user_plants.
 */
const auditAndSyncDeyePlants = async () => {
  console.log("[Plant Audit] 🔍 Memulai audit stasiun Deye Cloud vs PostgreSQL database...");

  try {
    const rawStations = await deyeService.listStations();
    if (!Array.isArray(rawStations) || rawStations.length === 0) {
      console.log("[Plant Audit] ⚠️ Tidak ada stasiun yang diterima dari API Deye Cloud.");
      return { totalDeye: 0, verifiedExisting: 0, newlySynced: 0 };
    }

    console.log(`[Plant Audit] 📡 Berhasil mengambil ${rawStations.length} stasiun dari API Deye Cloud.`);

    // 1. Ambil ID akun Super Admin
    const superAdmins = await db("users")
      .whereIn("email", SUPER_ADMIN_EMAILS)
      .select("id", "email");

    if (superAdmins.length === 0) {
      console.warn("[Plant Audit] ⚠️ Akun Super Admin tidak ditemukan di tabel users.");
    }

    // 2. Ambil data integrasi dan plants yang sudah ada
    const existingIntegrations = await db("deye_integrations").select("station_id", "plant_id");
    const integrationMap = new Map();
    existingIntegrations.forEach((item) => {
      integrationMap.set(Number(item.station_id), Number(item.plant_id));
    });

    const allPlants = await db("plants").select("id", "name");
    const plantIdSet = new Set(allPlants.map((p) => Number(p.id)));

    let newlySyncedCount = 0;
    let verifiedCount = 0;
    const auditDetails = [];

    for (const st of rawStations) {
      const stationId = Number(st.stationId || st.id);
      if (!stationId || stationId < 1000000) continue;

      const stationName = String(st.stationName || st.name || `Station #${stationId}`).trim();
      let linkedPlantId = integrationMap.get(stationId);

      // Verifikasi apakah linkedPlantId benar-benar ada di tabel plants
      const plantExists = linkedPlantId && plantIdSet.has(linkedPlantId);

      if (plantExists) {
        // Pastikan kedua Super Admin tercatat sebagai Owner di tabel user_plants
        for (const sa of superAdmins) {
          await db("user_plants")
            .insert({ user_id: sa.id, plant_id: linkedPlantId, role: "owner" })
            .onConflict(["user_id", "plant_id"])
            .ignore()
            .catch(() => {});
        }
        verifiedCount += 1;
        auditDetails.push({ stationId, stationName, plantId: linkedPlantId, status: "already_integrated" });
        continue;
      }

      // Stasiun belum ada di database atau belum terhubung di deye_integrations
      console.log(`[Plant Audit] ⚙️ Menyinkronkan stasiun Deye #${stationId} (${stationName}) ke PostgreSQL...`);

      // Cek apakah stasiun dengan nama serupa sudah pernah dibuat manual di tabel plants
      const existingByName = allPlants.find(
        (p) => (p.name || "").trim().toLowerCase() === stationName.toLowerCase()
      );

      let finalPlantId = existingByName ? existingByName.id : null;

      if (!finalPlantId) {
        const location = String(st.locationAddress || st.address || "Lokasi belum tersedia");
        const lat = Number(st.locationLat || st.latitude || 0);
        const lng = Number(st.locationLng || st.longitude || 0);
        const tz = st.regionTimezone || st.timezone || "Asia/Jakarta";
        const cap = Number(st.capacity || st.installedCapacity || 0);

        const [createdPlant] = await db("plants")
          .insert({
            name: stationName,
            location,
            latitude: Number.isFinite(lat) ? lat : 0,
            longitude: Number.isFinite(lng) ? lng : 0,
            timezone: tz,
            system_type: "Deye Cloud",
            pv_capacity: Number.isFinite(cap) ? cap : 0,
            battery_capacity: 0,
            electricity_price: 0,
            currency: "Rp",
            total_saving: 0,
          })
          .returning("*");

        finalPlantId = createdPlant.id;
        plantIdSet.add(Number(finalPlantId));
        allPlants.push({ id: finalPlantId, name: stationName });
      }

      // Source device ID wajib sesuai constraint: 'DEYE_STATION_' || station_id
      const sourceDeviceId = getStationDeviceId(stationId);

      // 1. Daftarkan di registered_devices
      await db("registered_devices")
        .insert({ device_id: sourceDeviceId, updated_at: db.fn.now() })
        .onConflict("device_id")
        .merge({ updated_at: db.fn.now() });

      // 2. Hubungkan ke plant_devices
      const assignedDevice = await db("plant_devices")
        .where({ device_id: sourceDeviceId })
        .first();
      if (!assignedDevice) {
        await db("plant_devices")
          .insert({ plant_id: finalPlantId, device_id: sourceDeviceId })
          .catch(() => {});
      }

      // 3. Daftarkan di deye_integrations
      await db("deye_integrations")
        .insert({
          plant_id: finalPlantId,
          station_id: stationId,
          source_device_id: sourceDeviceId,
          station_name: stationName,
          enabled: true,
          updated_at: db.fn.now(),
        })
        .onConflict("station_id")
        .merge({ plant_id: finalPlantId, updated_at: db.fn.now() });

      integrationMap.set(stationId, finalPlantId);

      // 4. Daftarkan hak akses Super Admin sebagai Owner
      for (const sa of superAdmins) {
        await db("user_plants")
          .insert({ user_id: sa.id, plant_id: finalPlantId, role: "owner" })
          .onConflict(["user_id", "plant_id"])
          .ignore()
          .catch(() => {});
      }

      newlySyncedCount += 1;
      auditDetails.push({ stationId, stationName, plantId: finalPlantId, status: "newly_synced" });
      console.log(`[Plant Audit] ✅ Sukses sinkronisasi #${stationId} (${stationName}) -> plant_id=${finalPlantId}`);
    }

    console.log(`[Plant Audit] 🏁 Audit selesai: Total ${rawStations.length} stasiun Deye | ${verifiedCount} terverifikasi | ${newlySyncedCount} baru disinkronkan.`);
    return {
      totalDeye: rawStations.length,
      verifiedExisting: verifiedCount,
      newlySynced: newlySyncedCount,
      details: auditDetails,
    };
  } catch (err) {
    console.error(`[Plant Audit] ❌ Audit gagal:`, err.message);
    throw err;
  }
};

module.exports = {
  auditAndSyncDeyePlants,
  SUPER_ADMIN_EMAILS,
};
