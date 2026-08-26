const db = require("../../config/db");
const { getStationDeviceId } = require("./deye.mapper");

const createDeyeRepository = (database = db) => ({
  async getImportSnapshot() {
    const [plants, integrations] = await Promise.all([
      database("plants").select("id", "name").orderBy("id", "asc"),
      database("deye_integrations")
        .select("plant_id", "station_id", "source_device_id")
        .orderBy("id", "asc"),
    ]);
    return { plants, integrations };
  },

  async getIntegrationByStationId(stationId) {
    return database("deye_integrations")
      .where({ station_id: stationId })
      .first();
  },

  async getEnabledIntegrations() {
    return database("deye_integrations")
      .where({ enabled: true })
      .orderBy("id", "asc");
  },

  async registerIntegration({
    plantId,
    stationId,
    primaryDeviceSn = null,
    enabled = true,
  }) {
    const sourceDeviceId = getStationDeviceId(stationId);

    return database.transaction(async (trx) => {
      const plant = await trx("plants").where({ id: plantId }).first("id");
      if (!plant) throw new Error("Plant_Not_Found");

      const existing = await trx("deye_integrations")
        .where({ station_id: stationId })
        .first();
      if (existing && Number(existing.plant_id) !== Number(plantId)) {
        throw new Error("Deye_Station_Already_Assigned");
      }

      await trx("registered_devices")
        .insert({ device_id: sourceDeviceId, updated_at: trx.fn.now() })
        .onConflict("device_id")
        .merge({ updated_at: trx.fn.now() });

      const assignedDevice = await trx("plant_devices")
        .where({ device_id: sourceDeviceId })
        .first();
      if (assignedDevice && Number(assignedDevice.plant_id) !== Number(plantId)) {
        throw new Error("Deye_Station_Already_Assigned");
      }
      if (!assignedDevice) {
        await trx("plant_devices").insert({
          plant_id: plantId,
          device_id: sourceDeviceId,
        });
      }

      const values = {
        plant_id: plantId,
        station_id: stationId,
        source_device_id: sourceDeviceId,
        primary_device_sn: primaryDeviceSn || null,
        enabled: Boolean(enabled),
        updated_at: trx.fn.now(),
      };

      const [integration] = await trx("deye_integrations")
        .insert(values)
        .onConflict("station_id")
        .merge({
          primary_device_sn: values.primary_device_sn,
          enabled: values.enabled,
          updated_at: values.updated_at,
        })
        .returning("*");
      return integration;
    });
  },

  //========== Plant Mapping ==========

  async importStation({ ownerUserId, station, devices }) {
    const stationId = Number(station?.stationId);
    const stationName = String(station?.stationName || "").trim();
    if (!Number.isSafeInteger(stationId) || stationId <= 0 || !stationName) {
      throw new Error("Invalid_Deye_Station");
    }

    return database.transaction(async (trx) => {
      const owner = await trx("users").where({ id: ownerUserId }).first("id");
      if (!owner) throw new Error("Deye_Owner_User_Not_Found");

      let integration = await trx("deye_integrations")
        .where({ station_id: stationId })
        .forUpdate()
        .first();
      let plant;
      let plantStatus = "existing";

      if (integration) {
        plant = await trx("plants").where({ id: integration.plant_id }).first();
        if (!plant) throw new Error("Plant_Not_Found");
      } else {
        const latitude = Number(station.locationLat);
        const longitude = Number(station.locationLng);
        const pvCapacity = Number(station.capacity);
        [plant] = await trx("plants")
          .insert({
            name: stationName,
            location: String(station.locationAddress || "Lokasi belum tersedia"),
            latitude: Number.isFinite(latitude) ? latitude : 0,
            longitude: Number.isFinite(longitude) ? longitude : 0,
            timezone: station.regionTimezone || "Asia/Jakarta",
            system_type: "Deye Cloud",
            pv_capacity: Number.isFinite(pvCapacity) ? pvCapacity : 0,
            battery_capacity: 0,
            electricity_price: 0,
            currency: "Rp",
            total_saving: 0,
          })
          .returning("*");
        plantStatus = "created";
      }

      await trx("user_plants")
        .insert({ user_id: ownerUserId, plant_id: plant.id, role: "owner" })
        .onConflict(["user_id", "plant_id"])
        .ignore();

      const sourceDeviceId = getStationDeviceId(stationId);
      await trx("registered_devices")
        .insert({ device_id: sourceDeviceId, updated_at: trx.fn.now() })
        .onConflict("device_id")
        .merge({ updated_at: trx.fn.now() });

      const sourceAssignment = await trx("plant_devices")
        .where({ device_id: sourceDeviceId })
        .first();
      if (sourceAssignment && Number(sourceAssignment.plant_id) !== Number(plant.id)) {
        throw new Error("Deye_Device_Already_Assigned");
      }
      if (!sourceAssignment) {
        await trx("plant_devices").insert({
          plant_id: plant.id,
          device_id: sourceDeviceId,
        });
      }

      const integrationValues = {
        plant_id: plant.id,
        station_id: stationId,
        source_device_id: sourceDeviceId,
        station_name: stationName,
        station_status: station.status == null ? null : String(station.status),
        station_capacity: Number.isFinite(Number(station.capacity))
          ? Number(station.capacity)
          : null,
        enabled: true,
        updated_at: trx.fn.now(),
      };

      if (integration) {
        [integration] = await trx("deye_integrations")
          .where({ id: integration.id })
          .update({
            station_name: integrationValues.station_name,
            station_status: integrationValues.station_status,
            station_capacity: integrationValues.station_capacity,
            enabled: true,
            updated_at: integrationValues.updated_at,
          })
          .returning("*");
      } else {
        [integration] = await trx("deye_integrations")
          .insert(integrationValues)
          .returning("*");
      }

      //========== Device Sync ==========

      let insertedDevices = 0;
      let updatedDevices = 0;
      for (const device of devices || []) {
        const deviceSn = String(device?.deviceSn || "").trim();
        if (!deviceSn) continue;

        const existingInventory = await trx("deye_devices")
          .where({ device_sn: deviceSn })
          .first();
        if (
          existingInventory &&
          Number(existingInventory.integration_id) !== Number(integration.id)
        ) {
          throw new Error("Deye_Device_Station_Conflict");
        }

        const assignedDevice = await trx("plant_devices")
          .where({ device_id: deviceSn })
          .first();
        if (assignedDevice && Number(assignedDevice.plant_id) !== Number(plant.id)) {
          throw new Error("Deye_Device_Already_Assigned");
        }

        await trx("registered_devices")
          .insert({ device_id: deviceSn, updated_at: trx.fn.now() })
          .onConflict("device_id")
          .merge({ updated_at: trx.fn.now() });
        if (!assignedDevice) {
          await trx("plant_devices").insert({
            plant_id: plant.id,
            device_id: deviceSn,
          });
        }

        const inventoryValues = {
          integration_id: integration.id,
          device_sn: deviceSn,
          deye_device_id: Number.isSafeInteger(Number(device.deviceId))
            ? Number(device.deviceId)
            : null,
          device_type: device.deviceType || null,
          connect_status: Number.isFinite(Number(device.connectStatus))
            ? Number(device.connectStatus)
            : null,
          product_id: device.productId || null,
          last_seen: device.collectionTime
            ? new Date(Number(device.collectionTime) * 1000)
            : null,
          updated_at: trx.fn.now(),
        };

        if (existingInventory) {
          await trx("deye_devices")
            .where({ id: existingInventory.id })
            .update(inventoryValues);
          updatedDevices += 1;
        } else {
          await trx("deye_devices").insert(inventoryValues);
          insertedDevices += 1;
        }
      }

      return {
        status: "success",
        stationId,
        stationName,
        plantId: plant.id,
        plantStatus,
        devicesInserted: insertedDevices,
        devicesUpdated: updatedDevices,
      };
    });
  },

  async saveTelemetryIfNewer({ stationId, sourceTimestamp, telemetry }) {
    const incomingTime = new Date(sourceTimestamp);
    if (Number.isNaN(incomingTime.getTime()) || !Array.isArray(telemetry) || !telemetry.length) {
      throw new Error("Invalid_Deye_Telemetry");
    }

    return database.transaction(async (trx) => {
      const integration = await trx("deye_integrations")
        .where({ station_id: stationId, enabled: true })
        .forUpdate()
        .first();
      if (!integration) throw new Error("Deye_Integration_Not_Found");

      const previousTime = integration.last_source_timestamp
        ? new Date(integration.last_source_timestamp)
        : null;
      if (previousTime && incomingTime <= previousTime) {
        return { status: "skipped", reason: "duplicate_or_older", rows: [] };
      }

      const rows = telemetry.map((item) => ({
        device_id: integration.source_device_id,
        category: item.category,
        type: item.type,
        value: item.value,
        created_at: incomingTime,
      }));
      const inserted = await trx("device_data").insert(rows).returning("*");

      await trx("deye_integrations")
        .where({ id: integration.id })
        .update({
          last_source_timestamp: incomingTime,
          last_synced_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      return { status: "inserted", reason: null, rows: inserted };
    });
  },

  async getTelemetryAtTimestamp(deviceId, sourceTimestamp) {
    return database("device_data")
      .where({ device_id: deviceId, created_at: new Date(sourceTimestamp) })
      .orderBy(["category", "type"]);
  },
});

module.exports = createDeyeRepository();
module.exports.createDeyeRepository = createDeyeRepository;
