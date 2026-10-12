//===== (Imports) ======
const db = require("../config/db");
const deyeService = require("../integrations/deye/deye.service");
const { getStationDeviceId } = require("../integrations/deye/deye.mapper");

//===== (Super Admin Emails) ======
const SUPER_ADMIN_EMAILS = [
  "idewanyomanbayusw@gmail.com",
  "admin@batarienergy.com",
];

const ensurePlantColumns = async () => {
  try {
    const hasTilt = await db.schema.hasColumn("plants", "tilt");
    if (!hasTilt) {
      await db.schema.alterTable("plants", (table) => {
        table.decimal("tilt", 5, 2).defaultTo(12.0);
      });
      console.log("[Plant Audit] ✅ Kolom 'tilt' berhasil ditambahkan ke tabel plants.");
    }
    const hasAzimuth = await db.schema.hasColumn("plants", "azimuth");
    if (!hasAzimuth) {
      await db.schema.alterTable("plants", (table) => {
        table.decimal("azimuth", 5, 2).defaultTo(0.0);
      });
      console.log("[Plant Audit] ✅ Kolom 'azimuth' berhasil ditambahkan ke tabel plants.");
    }
  } catch (colErr) {
    console.warn(`[Plant Audit] Schema ensurePlantColumns notice: ${colErr.message}`);
  }
};

const enrichPlantLocations = async () => {
  const CORRECT_LOCATIONS = [
    { stationId: 61419275, namePattern: '%Jeruk Purut%', city: 'Jakarta Selatan', province: 'DKI Jakarta' },
    { stationId: 61994341, namePattern: '%Aditya%', city: 'Jakarta Barat', province: 'DKI Jakarta' },
    { stationId: 62136529, namePattern: '%Vinka%', city: 'Jakarta Timur', province: 'DKI Jakarta', lat: -6.2250, lng: 106.8845 },
    { stationId: 62004725, namePattern: '%asti%', city: 'Tangerang Selatan', province: 'Banten' },
    { stationId: 62093529, namePattern: '%Dion%', city: 'Tangerang Selatan', province: 'Banten' },
    { stationId: 62358966, namePattern: '%Timbangan 2%', city: 'Cilegon', province: 'Banten' },
    { stationId: 62664914, namePattern: '%Timbangan 3%', city: 'Cilegon', province: 'Banten' },
    { stationId: 62000532, namePattern: '%Ridwan%', city: 'Cirebon', province: 'Jawa Barat' },
    { stationId: 62435287, namePattern: '%Tonny%', city: 'Cirebon', province: 'Jawa Barat' },
    { stationId: 62030330, namePattern: '%sabar%', city: 'Depok', province: 'Jawa Barat' },
    { stationId: 62090724, namePattern: '%Novi%', city: 'Depok', province: 'Jawa Barat' },
    { stationId: 62041148, namePattern: '%Odih%', city: 'Cimahi', province: 'Jawa Barat' },
    { stationId: 62053634, namePattern: '%tibra%', city: 'Bandung Barat', province: 'Jawa Barat' },
    { stationId: 62448210, namePattern: '%Cisarua%', city: 'Bandung Barat', province: 'Jawa Barat' },
    { stationId: 62086818, namePattern: '%Iwan%', city: 'Bandung', province: 'Jawa Barat' },
    { stationId: 62112496, namePattern: '%Hanggara%', city: 'Bandung', province: 'Jawa Barat' },
    { stationId: 62293855, namePattern: "%SA'ADATUDDAROIN%", city: 'Bandung', province: 'Jawa Barat' },
    { stationId: 62506492, namePattern: '%Buah Batu%', city: 'Bandung', province: 'Jawa Barat' },
    { stationId: 61788646, namePattern: '%Hendrianto%', city: 'Banyumas', province: 'Jawa Tengah' },
    { stationId: 61819126, namePattern: '%Istiqom%', city: 'Kudus', province: 'Jawa Tengah' },
    { stationId: 62399930, namePattern: '%Safira%', city: 'Tegal', province: 'Jawa Tengah' },
    { stationId: 62566371, namePattern: '%dimas%', city: 'Gresik', province: 'Jawa Timur' },
    { stationId: 61719930, namePattern: '%PJT%', city: 'Malang', province: 'Jawa Timur' },
    { stationId: 61820345, namePattern: '%Debby%', city: 'Malang', province: 'Jawa Timur' },
    { stationId: 61897926, namePattern: '%sanny%', city: 'Tabanan', province: 'Bali' },
    { stationId: 62433430, namePattern: '%Menjangan%', city: 'Buleleng', province: 'Bali' },
    { stationId: 61582048, namePattern: '%Muharam%', city: 'Makassar', province: 'Sulawesi Selatan' },
    { stationId: 61618898, namePattern: '%Betoambari%', city: 'Bau-Bau', province: 'Sulawesi Tenggara' },
    { stationId: 61760634, namePattern: '%Bau-Bau Stand-alone%', city: 'Bau-Bau', province: 'Sulawesi Tenggara' },
    { stationId: 62163831, namePattern: '%guruh%', city: 'Palembang', province: 'Sumatera Selatan' },
    { stationId: 62178565, namePattern: '%Norman%', city: 'Padang', province: 'Sumatera Barat' },
  ];

  try {
    for (const item of CORRECT_LOCATIONS) {
      const updateData = { city: item.city, province: item.province };
      if (item.lat && item.lng) {
        updateData.latitude = item.lat;
        updateData.longitude = item.lng;
      }
      await db("plants")
        .whereIn("id", function () {
          this.select("plant_id")
            .from("deye_integrations")
            .where("station_id", item.stationId);
        })
        .orWhere("name", "ilike", item.namePattern)
        .update(updateData);
    }
    console.log("[Plant Audit] ✅ Metadata kota dan provinsi 31 stasiun berhasil disinkronkan ke PostgreSQL.");
  } catch (err) {
    console.warn(`[Plant Audit] Notice sync plant locations: ${err.message}`);
  }
};

/**
 * Audits all operational stations from Deye Cloud API against the PostgreSQL database.
 * If any stations are missing or unintegrated, automatically registers them
 * into plants, deye_integrations, registered_devices, plant_devices, and user_plants.
 */
const auditAndSyncDeyePlants = async () => {
  console.log("[Plant Audit] 🔍 Memulai audit stasiun Deye Cloud vs PostgreSQL database...");

  // 1. Pastikan kolom baru 'tilt' dan 'azimuth' sudah ada di tabel plants
  await ensurePlantColumns();

  // 2. Otomatis sinkronkan kota dan provinsi stasiun ke tabel plants
  await enrichPlantLocations();

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
        // Pastikan enabled = true jika sebelumnya pernah dinonaktifkan
        await db("deye_integrations")
          .where({ station_id: stationId })
          .update({ enabled: true, updated_at: db.fn.now() })
          .catch(() => {});

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

    // 3. Rekonsiliasi Stasiun Deye yang dihapus/dicabut dari Deye Cloud (Soft Deactivation - Opsi B)
    // Syarat ketat: Hanya rekonsiliasi jika API Deye terbukti sukses mengembalikan stasiun valid (> 0)
    const liveStationIdSet = new Set(
      rawStations
        .map((st) => Number(st.stationId || st.id))
        .filter((id) => id && id >= 1000000)
    );

    let deactivatedCount = 0;
    for (const item of existingIntegrations) {
      const sId = Number(item.station_id);
      if (sId && !liveStationIdSet.has(sId)) {
        console.log(`[Plant Audit] ⏸️ Stasiun #${sId} (plant_id=${item.plant_id}) tidak ditemukan di Deye Cloud API. Menandai enabled=false (Soft Deactivation)...`);
        await db("deye_integrations")
          .where({ station_id: sId })
          .update({ enabled: false, updated_at: db.fn.now() })
          .catch(() => {});
        deactivatedCount += 1;
        auditDetails.push({ stationId: sId, plantId: item.plant_id, status: "soft_deactivated" });
      }
    }

    console.log(`[Plant Audit] 🏁 Audit selesai: Total ${rawStations.length} stasiun Deye | ${verifiedCount} terverifikasi | ${newlySyncedCount} baru | ${deactivatedCount} dinonaktifkan.`);
    return {
      totalDeye: rawStations.length,
      verifiedExisting: verifiedCount,
      newlySynced: newlySyncedCount,
      deactivated: deactivatedCount,
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
