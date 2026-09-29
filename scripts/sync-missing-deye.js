require("../src/config/env");

const db = require("../src/config/db");
const deyeService = require("../src/integrations/deye/deye.service");
const deyeRepository = require("../src/integrations/deye/deye.repository");

async function main() {
  console.log("=== Checking missing Deye stations in PostgreSQL ===");

  const rawStations = await deyeService.listStations();
  console.log(`Total stations in Deye Cloud API: ${rawStations.length}`);

  const existingIntegrations = await db("deye_integrations").select("station_id", "plant_id");
  const existingStationIds = new Set(existingIntegrations.map((i) => Number(i.station_id)));
  console.log(`Total integrated stations in PostgreSQL: ${existingIntegrations.length}`);

  const missing = rawStations.filter((st) => {
    const sId = Number(st.stationId || st.id);
    return sId && !existingStationIds.has(sId);
  });

  if (missing.length === 0) {
    console.log("All Deye Cloud stations are already mapped in PostgreSQL! No actions needed.");
    await db.destroy();
    return;
  }

  console.log(`Found ${missing.length} unintegrated station(s):`);
  missing.forEach((st) => console.log(` - ID: ${st.stationId || st.id} | Name: ${st.stationName || st.name}`));

  const adminUser = await db("users")
    .whereIn("email", ["idewanyomanbayusw@gmail.com", "idewbayu14@gmail.com", "admin@batarienergy.com"])
    .first("id");
  const ownerUserId = adminUser ? adminUser.id : (await db("users").first("id"))?.id;

  if (!ownerUserId) {
    console.error("No admin user found to assign as plant owner!");
    await db.destroy();
    process.exit(1);
  }

  console.log(`Assigning newly imported stations to owner user ID: ${ownerUserId}`);

  const repo = deyeRepository();
  for (const st of missing) {
    try {
      let devices = [];
      try {
        devices = await deyeService.getStationDevices(st.stationId || st.id);
      } catch (err) {
        console.warn(`Could not get devices for station ${st.stationId || st.id}:`, err.message);
      }

      const result = await repo.importStation({
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
      console.log(`Successfully imported station ${st.stationId || st.id}: plant_id=${result.id}`);
    } catch (err) {
      console.error(`Failed to import station ${st.stationId || st.id}:`, err.message);
    }
  }

  console.log("=== Synchronization completed ===");
  await db.destroy();
}

main().catch(async (err) => {
  console.error("FATAL ERROR:", err);
  await db.destroy();
  process.exit(1);
});
