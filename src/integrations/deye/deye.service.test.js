const { createDeyeService } = require("./deye.service");

describe("deye.service", () => {
  const integration = {
    id: 1,
    station_id: 61_419_275,
    source_device_id: "DEYE_STATION_61419275",
    enabled: true,
  };
  const raw = {
    success: true,
    generationPower: 4210,
    consumptionPower: 2830,
    gridPower: 950,
    batteryPower: -430,
    batterySOC: 87,
    lastUpdateTime: 1_786_601_888,
  };

  const createDependencies = () => ({
    client: {
      getAccessToken: jest.fn().mockResolvedValue("hidden-token"),
      post: jest.fn().mockResolvedValue(raw),
    },
    repository: {
      getIntegrationByStationId: jest.fn().mockResolvedValue(integration),
      getEnabledIntegrations: jest.fn().mockResolvedValue([integration]),
      saveTelemetryIfNewer: jest.fn().mockResolvedValue({
        status: "inserted",
        reason: null,
        rows: [{ id: 1 }],
      }),
      registerIntegration: jest.fn(),
      getTelemetryAtTimestamp: jest.fn(),
      getImportSnapshot: jest.fn().mockResolvedValue({
        plants: [],
        integrations: [],
      }),
      importStation: jest.fn(),
    },
    logger: { error: jest.fn() },
  });

  test("fetches, maps, validates, and passes source timestamp to repository", async () => {
    const dependencies = createDependencies();
    const service = createDeyeService(dependencies);
    const result = await service.syncStationOnce(61_419_275);

    expect(dependencies.client.post).toHaveBeenCalledWith(
      "/v1.0/station/latest",
      { stationId: 61_419_275 },
    );
    expect(dependencies.repository.saveTelemetryIfNewer).toHaveBeenCalledWith(
      expect.objectContaining({
        stationId: 61_419_275,
        sourceTimestamp: "2026-08-13T06:18:08.000Z",
        telemetry: expect.arrayContaining([
          expect.objectContaining({ deviceId: "DEYE_STATION_61419275" }),
        ]),
      }),
    );
    expect(result.status).toBe("inserted");
  });

  test("reports a repeated source timestamp as skipped", async () => {
    const dependencies = createDependencies();
    dependencies.repository.saveTelemetryIfNewer.mockResolvedValue({
      status: "skipped",
      reason: "duplicate_or_older",
      rows: [],
    });
    const result = await createDeyeService(dependencies).syncStationOnce(61_419_275);
    expect(result).toMatchObject({ status: "skipped", rows: [] });
  });

  test("skips safely when Deye returns no source timestamp", async () => {
    const dependencies = createDependencies();
    dependencies.client.post.mockResolvedValue({ generationPower: 1000 });

    await expect(
      createDeyeService(dependencies).syncStationOnce(61_419_275),
    ).resolves.toMatchObject({
      status: "skipped",
      reason: "no_source_timestamp",
      rows: [],
    });
    expect(dependencies.repository.saveTelemetryIfNewer).not.toHaveBeenCalled();
  });

  test("isolates a cloud failure so other enabled integrations can continue", async () => {
    const dependencies = createDependencies();
    dependencies.repository.getEnabledIntegrations.mockResolvedValue([
      integration,
      { ...integration, station_id: 2, source_device_id: "DEYE_STATION_2" },
    ]);
    dependencies.repository.getIntegrationByStationId
      .mockResolvedValueOnce(integration)
      .mockResolvedValueOnce({ ...integration, station_id: 2, source_device_id: "DEYE_STATION_2" });
    dependencies.client.post
      .mockRejectedValueOnce(new Error("cloud unavailable"))
      .mockResolvedValueOnce({ ...raw, lastUpdateTime: 1_786_601_889 });

    const results = await createDeyeService(dependencies).syncAllEnabled();
    expect(results[0]).toMatchObject({ status: "failed" });
    expect(results[1]).toMatchObject({ status: "inserted" });
    expect(dependencies.logger.error).toHaveBeenCalledTimes(1);
  });

  test("normalizes actual station fields and keeps station ids stable", async () => {
    const dependencies = createDependencies();
    dependencies.client.post.mockResolvedValue({
      total: 1,
      stationList: [{
        id: 123,
        name: "Deye Plant",
        connectionStatus: "ONLINE",
        installedCapacity: 12.5,
      }],
    });

    const [station] = await createDeyeService(dependencies).listStations();
    expect(station).toMatchObject({
      stationId: 123,
      stationName: "Deye Plant",
      status: "ONLINE",
      capacity: 12.5,
    });
  });

  test("filters device responses to their requested station", async () => {
    const dependencies = createDependencies();
    dependencies.client.post.mockResolvedValue({
      total: 2,
      deviceListItems: [
        { stationId: 10, deviceSn: "RIGHT" },
        { stationId: 11, deviceSn: "WRONG" },
      ],
    });

    const devices = await createDeyeService(dependencies).getStationDevices(10);
    expect(devices).toEqual([{ stationId: 10, deviceSn: "RIGHT" }]);
  });

  test("preview reuses confirmed mappings and never guesses ambiguous names", async () => {
    const dependencies = createDependencies();
    dependencies.repository.getImportSnapshot.mockResolvedValue({
      plants: [
        { id: 1, name: "Existing" },
        { id: 2, name: "Duplicate" },
        { id: 3, name: "Duplicate" },
      ],
      integrations: [{ station_id: 10, plant_id: 1 }],
    });
    dependencies.client.post.mockImplementation(async (path) => {
      if (path === "/v1.0/station/list") {
        return {
          total: 3,
          stationList: [
            { id: 10, name: "Mapped" },
            { id: 11, name: "Duplicate" },
            { id: 12, name: "New" },
          ],
        };
      }
      return { total: 0, deviceListItems: [] };
    });

    const preview = await createDeyeService(dependencies).previewStationImport();
    expect(preview.summary).toMatchObject({ reuse: 1, ambiguous: 1, create: 1 });
    expect(preview.stations[1].plantId).toBeNull();
  });

  test("import isolates one station transaction failure", async () => {
    const dependencies = createDependencies();
    dependencies.repository.importStation
      .mockResolvedValueOnce({ status: "success", stationId: 1 })
      .mockRejectedValueOnce(new Error("conflict"));
    const preview = {
      summary: { failed: 0, candidate: 0, ambiguous: 0 },
      stations: [
        { station: { stationId: 1 }, devices: [] },
        { station: { stationId: 2 }, devices: [] },
      ],
    };

    const result = await createDeyeService(dependencies).importStations({
      ownerUserId: "owner",
      dryRun: false,
      preview,
    });
    expect(result).toMatchObject({ total: 2, success: 1, failed: 1 });
    expect(result.results[1]).toMatchObject({ stationId: 2, status: "failed" });
  });
});
