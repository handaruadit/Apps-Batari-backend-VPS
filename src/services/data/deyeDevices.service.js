const deyeService = require("../../integrations/deye/deye.service");
const deyeClient = require("../../integrations/deye/deye.client");

async function fetchDeyeStationDevicesWithLatest(
  stationId,
  stationMeta,
  lastUpdateIso,
  pvTotal,
  energySummaryTotal,
) {
  try {
    const devList = await deyeService.getStationDevices(stationId);
    if (!Array.isArray(devList) || devList.length === 0) {
      return [];
    }

    const inverters = devList.filter((d) => d.deviceType === "INVERTER");
    if (inverters.length === 0) {
      return [];
    }

    const inverterSns = inverters.map((d) => d.deviceSn);
    const deviceDataMap = new Map();
    try {
      const latestBatch = await deyeClient.post("/v1.0/device/latest", {
        deviceList: inverterSns,
      });
      if (Array.isArray(latestBatch?.deviceDataList)) {
        latestBatch.deviceDataList.forEach((item) => {
          if (item?.deviceSn && Array.isArray(item?.dataList)) {
            deviceDataMap.set(item.deviceSn, item.dataList);
          }
        });
      }
    } catch (batchErr) {
      console.warn(
        `[deyeDevices.service] getDeviceLatest batch error for ${stationId}:`,
        batchErr.message,
      );
    }

    return inverters.map((d, i) => {
      const dataList = deviceDataMap.get(d.deviceSn) || [];

      const getNum = (keys, fallback = 0) => {
        for (const k of keys) {
          const found = dataList.find(
            (it) => String(it.key).toLowerCase() === String(k).toLowerCase(),
          );
          if (
            found &&
            found.value != null &&
            String(found.value).trim() !== ""
          ) {
            const num = Number(found.value);
            if (Number.isFinite(num)) return num;
          }
        }
        return fallback;
      };

      // Solar DC Power (Watts) -> kW
      const rawSolarW = getNum([
        "TotalSolarPower",
        "totalDcInputPower",
        "dcPowerPv1",
      ]);
      const rawAcW = getNum([
        "TotalInverterOutputPower",
        "inverterOutputPowerL1l2",
        "ActivePower",
        "activePower",
      ]);
      const finalPowerKw =
        rawSolarW > 0
          ? Number((rawSolarW / 1000).toFixed(2))
          : rawAcW > 0
            ? Number((rawAcW / 1000).toFixed(2))
            : inverters.length > 0 && pvTotal > 0
              ? Number((pvTotal / inverters.length).toFixed(2))
              : 0;

      // Daily Production (kWh)
      const dailyProdKwh = getNum(
        [
          "DailyActiveProduction",
          "dailyProductionActive",
          "PVDailyPowerGenerationActive",
        ],
        inverters.length > 0 && energySummaryTotal?.productionTodayKwh > 0
          ? Number(
              (
                energySummaryTotal.productionTodayKwh / inverters.length
              ).toFixed(2),
            )
          : 0,
      );

      // Cumulative Total Production (kWh)
      const totalProdKwh = getNum([
        "TotalActiveProduction",
        "cumulativeProductionActive",
      ]);

      // Consumption / Load (Watts & kWh)
      const rawConsW = getNum(["TotalConsumptionPower", "upsLoadPower"]);
      const consKw = Number((rawConsW / 1000).toFixed(2));
      const dailyConsKwh = getNum(["DailyConsumption"]);

      // Grid (Watts)
      const rawGridW = getNum(["TotalGridPower", "totalGridPower"]);
      const gridKw = Number((rawGridW / 1000).toFixed(2));

      // Battery parameters
      const rawBattW = getNum(["BatteryPower", "batteryPower"]);
      const battKw = Number((rawBattW / 1000).toFixed(2));
      const battSoc = getNum(["SOC", "soc", "bmsSoc"]);
      const battVoltage = getNum([
        "BatteryVoltage",
        "batteryVoltage",
        "bmsVoltage",
      ]);
      const battCurrent = getNum([
        "BatteryTotalCurrent",
        "batteryCurrent",
        "bmsCurrent",
      ]);
      const battTemp = getNum([
        "Temperature- Battery",
        "temperatureBattery",
        "bmsTemperature",
      ]);

      const devName =
        inverters.length > 1
          ? `Inverter ${i + 1} (${d.deviceSn})`
          : `Inverter (${d.deviceSn})`;

      const statusStr = d.connectStatus === 1 ? "Online" : "Offline";

      const latestData = [
        {
          category: "pv",
          type: "chargePower",
          value: finalPowerKw,
          created_at: lastUpdateIso,
        },
        {
          category: "pv",
          type: "power",
          value: finalPowerKw,
          created_at: lastUpdateIso,
        },
        {
          category: "baterai",
          type: "power",
          value: battKw,
          created_at: lastUpdateIso,
        },
        {
          category: "baterai",
          type: "soc",
          value: battSoc,
          created_at: lastUpdateIso,
        },
        {
          category: "baterai",
          type: "voltage",
          value: battVoltage,
          created_at: lastUpdateIso,
        },
        {
          category: "baterai",
          type: "current",
          value: battCurrent,
          created_at: lastUpdateIso,
        },
        {
          category: "grid",
          type: "power",
          value: gridKw,
          created_at: lastUpdateIso,
        },
        {
          category: "out",
          type: "power",
          value: consKw,
          created_at: lastUpdateIso,
        },
        {
          category: "production",
          type: "pvGenerate",
          value: consKw,
          created_at: lastUpdateIso,
        },
      ];

      return {
        id: i + 1,
        device_id: d.deviceSn,
        sn: d.deviceSn,
        name: devName,
        type: "INVERTER",
        deviceType: "INVERTER",
        status: statusStr,
        connectStatus: d.connectStatus ?? 1,
        power: finalPowerKw,
        dailyEnergy: Number(Number(dailyProdKwh).toFixed(2)),
        totalEnergy: Number(Number(totalProdKwh).toFixed(2)),
        consumptionPower: consKw,
        dailyConsumption: Number(Number(dailyConsKwh).toFixed(2)),
        gridPower: gridKw,
        batteryPower: battKw,
        batterySoc: battSoc,
        batteryVoltage: battVoltage,
        batteryCurrent: battCurrent,
        batteryTemp: battTemp,
        lastSeen: lastUpdateIso,
        latestData,
      };
    });
  } catch (err) {
    console.warn(
      `[deyeDevices.service] fetchDeyeStationDevicesWithLatest error for ${stationId}:`,
      err.message,
    );
    return [];
  }
}

module.exports = {
  fetchDeyeStationDevicesWithLatest,
};
