const deyeClient = require("./deye.client");
const deyeRepository = require("./deye.repository");
const { mapStationLatest, toIsoTimestamp } = require("./deye.mapper");

const PAGE_SIZE = 50;

const stationListItems = (data) =>
  Array.isArray(data?.stationList) ? data.stationList : [];

const stationDeviceItems = (data) =>
  Array.isArray(data?.deviceListItems) ? data.deviceListItems : [];

const normalizeStation = (station) => ({
  ...station,
  stationId: Number(station.stationId ?? station.id),
  stationName: station.stationName ?? station.name ?? null,
  status: station.status ?? station.connectionStatus ?? null,
  capacity: station.capacity ?? station.installedCapacity ?? null,
});

const fetchAllPages = async ({ client, path, body, selectItems }) => {
  const items = [];

  for (let page = 1; ; page += 1) {
    const data = await client.post(path, { ...body, page, size: PAGE_SIZE });
    const pageItems = selectItems(data);
    items.push(...pageItems);
    const total = Number(data?.total);

    if (
      pageItems.length < PAGE_SIZE ||
      (Number.isFinite(total) && items.length >= total)
    ) {
      return items;
    }
  }
};

const createDeyeService = ({
  client = deyeClient,
  repository = deyeRepository,
  logger = console,
} = {}) => ({
  async testAuthentication() {
    await client.getAccessToken();
    return { authenticated: true };
  },

  async listStations() {
    const stations = await fetchAllPages({
      client,
      path: "/v1.0/station/list",
      body: {},
      selectItems: stationListItems,
    });
    return stations.map(normalizeStation);
  },

  async getStationLatest(stationId) {
    return client.post("/v1.0/station/latest", { stationId: Number(stationId) });
  },

  async getStationDevices(stationId) {
    const normalizedStationId = Number(stationId);
    const devices = await fetchAllPages({
      client,
      path: "/v1.0/station/device",
      body: { stationIds: [normalizedStationId] },
      selectItems: stationDeviceItems,
    });
    return devices.filter(
      (device) => Number(device.stationId) === normalizedStationId,
    );
  },

  async getMeasurePoints(deviceSn) {
    return client.post("/v1.0/device/measurePoints", {
      deviceSn,
      deviceType: "INVERTER",
    });
  },

  async getDeviceLatest(deviceSn) {
    return client.post("/v1.0/device/latest", { deviceList: [deviceSn] });
  },

  async registerIntegration(input) {
    return repository.registerIntegration(input);
  },

  //========== Plant Mapping ==========

  async previewStationImport() {
    const stations = await this.listStations();
    const snapshot = await repository.getImportSnapshot();
    const integrations = new Map(
      snapshot.integrations.map((item) => [String(item.station_id), item]),
    );
    const plantNames = new Map();

    snapshot.plants.forEach((plant) => {
      const key = String(plant.name || "").trim().toLocaleLowerCase();
      if (!plantNames.has(key)) plantNames.set(key, []);
      plantNames.get(key).push(plant);
    });

    const results = [];
    for (const station of stations) {
      const existing = integrations.get(String(station.stationId));
      const exactCandidates = plantNames.get(
        String(station.stationName || "").trim().toLocaleLowerCase(),
      ) || [];
      let devices = [];
      let error = null;

      try {
        devices = await this.getStationDevices(station.stationId);
      } catch (deviceError) {
        error = deviceError.message;
      }

      results.push({
        station,
        devices,
        action: existing
          ? "reuse"
          : exactCandidates.length === 1
            ? "candidate"
            : exactCandidates.length > 1
              ? "ambiguous"
              : "create",
        plantId: existing?.plant_id ?? null,
        candidatePlants: exactCandidates.map(({ id, name }) => ({ id, name })),
        error,
      });
    }

    return {
      stations: results,
      summary: {
        total: results.length,
        reuse: results.filter((item) => item.action === "reuse").length,
        create: results.filter((item) => item.action === "create").length,
        candidate: results.filter((item) => item.action === "candidate").length,
        ambiguous: results.filter((item) => item.action === "ambiguous").length,
        failed: results.filter((item) => item.error).length,
        devices: results.reduce((sum, item) => sum + item.devices.length, 0),
      },
    };
  },

  //========== Device Sync ==========

  async importStations({ ownerUserId, dryRun = true, preview: suppliedPreview } = {}) {
    const preview = suppliedPreview || await this.previewStationImport();
    if (dryRun) return { dryRun: true, ...preview };
    if (!ownerUserId) throw new Error("Deye_Owner_User_ID_Required");
    if (preview.summary.failed || preview.summary.candidate || preview.summary.ambiguous) {
      throw new Error("Deye_Import_Preview_Not_Safe");
    }

    const results = [];
    for (const item of preview.stations) {
      try {
        results.push(await repository.importStation({
          ownerUserId,
          station: item.station,
          devices: item.devices,
        }));
      } catch (error) {
        logger.error(`[deye] station ${item.station.stationId} import failed: ${error.message}`);
        results.push({
          stationId: item.station.stationId,
          stationName: item.station.stationName,
          status: "failed",
          error: error.message,
        });
      }
    }

    return {
      dryRun: false,
      total: results.length,
      success: results.filter((item) => item.status !== "failed").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    };
  },

  async syncStationOnce(stationId) {
    const integration = await repository.getIntegrationByStationId(stationId);
    if (!integration || !integration.enabled) {
      throw new Error("Deye_Integration_Not_Found");
    }

    const raw = await client.post("/v1.0/station/latest", {
      stationId: Number(stationId),
    });
    const sourceTimestamp = toIsoTimestamp(raw.lastUpdateTime);
    if (!sourceTimestamp) {
      return {
        stationId: Number(stationId),
        sourceTimestamp: null,
        telemetry: [],
        status: "skipped",
        reason: "no_source_timestamp",
        rows: [],
      };
    }
    const telemetry = mapStationLatest(
      stationId,
      raw,
      integration.source_device_id,
    );
    const saved = await repository.saveTelemetryIfNewer({
      stationId,
      sourceTimestamp,
      telemetry,
    });

    return { stationId: Number(stationId), sourceTimestamp, telemetry, ...saved };
  },

  async syncAllEnabled() {
    const integrations = await repository.getEnabledIntegrations();
    const results = [];

    for (const integration of integrations) {
      try {
        results.push(await this.syncStationOnce(integration.station_id));
      } catch (error) {
        logger.error(`[deye] station ${integration.station_id} sync failed: ${error.message}`);
        results.push({ stationId: integration.station_id, status: "failed", error: error.message });
      }
    }
    return results;
  },

  async syncAllSummary() {
    const results = await this.syncAllEnabled();
    return {
      total: results.length,
      success: results.filter((item) => item.status !== "failed").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    };
  },

  async verifyPersistedTelemetry(deviceId, sourceTimestamp) {
    return repository.getTelemetryAtTimestamp(deviceId, sourceTimestamp);
  },
});

module.exports = createDeyeService();
module.exports.createDeyeService = createDeyeService;
