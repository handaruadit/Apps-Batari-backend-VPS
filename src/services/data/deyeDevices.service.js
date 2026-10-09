const deyeService = require("../../integrations/deye/deye.service");
const deyeClient = require("../../integrations/deye/deye.client");

// In-memory hardware devices cache (5 minutes TTL - physical inverter topology rarely changes)
const stationDevicesListCache = new Map();

async function getCachedStationDevices(stationId) {
  const now = Date.now();
  const numId = Number(stationId);
  const cached = stationDevicesListCache.get(numId);
  if (cached && now - cached.timestamp < 300000 && Array.isArray(cached.devList) && cached.devList.length > 0) {
    return cached.devList;
  }
  const devList = await deyeService.getStationDevices(stationId);
  if (Array.isArray(devList) && devList.length > 0) {
    stationDevicesListCache.set(numId, { timestamp: now, devList });
  }
  return devList || [];
}

async function fetchDeyeStationDevicesWithLatest(
  stationId,
  stationMeta,
  lastUpdateIso,
  pvTotal,
  energySummaryTotal,
) {
  try {
    const devList = await getCachedStationDevices(stationId);
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

      // 1. Solar DC Power (Watts) -> sum of all active PV strings (DCPowerPV1..8 / dcPowerPv1..8)
      let sumDcPowerW = 0;
      for (let s = 1; s <= 8; s++) {
        const w = getNum([`dcPowerPv${s}`, `DCPowerPV${s}`]);
        if (w > 0) sumDcPowerW += w;
      }
      const rawSolarW =
        sumDcPowerW > 0
          ? sumDcPowerW
          : getNum([
              "TotalSolarPower",
              "totalDcInputPower",
              "dcPowerPv1",
              "DCPowerPV1",
            ]);

      // AC Output Power (Watts)
      let sumAcPowerW = 0;
      for (let l = 1; l <= 3; l++) {
        const w = getNum([`InverterOutputPowerL${l}`, `inverterOutputPowerL${l}`]);
        if (w > 0) sumAcPowerW += w;
      }
      const rawAcW =
        sumAcPowerW > 0
          ? sumAcPowerW
          : getNum([
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

      // 2. Daily Production (kWh)
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

      // Consumption / Load (Watts & kWh) - Akumulasi Load reguler + UPS Load
      let sumLoadW = 0;
      for (let l = 1; l <= 3; l++) {
        const w = getNum([`LoadPowerL${l}`, `loadPowerL${l}`]);
        if (w > 0) sumLoadW += w;
      }
      if (sumLoadW === 0) {
        sumLoadW = getNum(["LoadPower", "loadPower", "TotalLoadPower"]);
      }
      const upsLoadW = getNum([
        "UPSLoadPower",
        "upsLoadPower",
        "TotalUPSLoadPower",
        "upsPower",
        "UPSPower",
      ]);
      const totalConsParamW = getNum([
        "TotalConsumptionPower",
        "totalConsumptionPower",
        "ConsumptionPower",
        "consumptionPower",
      ]);

      const sumCombinedW = sumLoadW + upsLoadW;
      const rawConsW = sumCombinedW > 0 ? sumCombinedW : totalConsParamW;
      const consKw = Number((rawConsW / 1000).toFixed(2));
      const loadOnlyKw = Number((sumLoadW / 1000).toFixed(2));
      const upsOnlyKw = Number((upsLoadW / 1000).toFixed(2));
      const dailyConsKwh = getNum(["DailyConsumption"]);
      const dailyEnergyPurchased = getNum([
        "DailyEnergyPurchased",
        "DailyEnergyPurchase",
        "dailyEnergyPurchased",
      ]);
      const dailyGridFeedIn = getNum([
        "DailyGridFeedIn",
        "dailyGridFeedIn",
        "DailyEnergySell",
      ]);
      const dailyChargingEnergy = getNum([
        "DailyChargingEnergy",
        "dailyChargingEnergy",
      ]);
      const dailyDischargingEnergy = getNum([
        "DailyDischargingEnergy",
        "dailyDischargingEnergy",
      ]);
      const totalConsKwh = getNum([
        "TotalConsumption",
        "totalConsumption",
      ]);
      const totalEnergyBuy = getNum(["TotalEnergyBuy"]);
      const totalEnergySell = getNum(["TotalEnergySell"]);
      const totalChargeEnergy = getNum(["TotalChargeEnergy"]);
      const totalDischargeEnergy = getNum(["TotalDischargeEnergy"]);

      // Grid (Watts)
      const rawGridW = getNum([
        "TotalGridPower",
        "totalGridPower",
        "TotalExternalCTPower",
      ]);
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
        "BatteryCurrent1",
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
          value: Math.abs(battKw),
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
          value: Math.abs(battCurrent),
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
          category: "out",
          type: "loadPower",
          value: loadOnlyKw,
          created_at: lastUpdateIso,
        },
        {
          category: "out",
          type: "upsLoad",
          value: upsOnlyKw,
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
        loadPower: loadOnlyKw,
        upsLoadPower: upsOnlyKw,
        dailyConsumption: Number(Number(dailyConsKwh).toFixed(2)),
        dailyEnergyPurchased: Number(Number(dailyEnergyPurchased).toFixed(2)),
        dailyGridFeedIn: Number(Number(dailyGridFeedIn).toFixed(2)),
        dailyChargingEnergy: Number(Number(dailyChargingEnergy).toFixed(2)),
        dailyDischargingEnergy: Number(Number(dailyDischargingEnergy).toFixed(2)),
        totalConsumption: Number(Number(totalConsKwh).toFixed(2)),
        totalEnergyBuy: Number(Number(totalEnergyBuy).toFixed(2)),
        totalEnergySell: Number(Number(totalEnergySell).toFixed(2)),
        totalChargeEnergy: Number(Number(totalChargeEnergy).toFixed(2)),
        totalDischargeEnergy: Number(Number(totalDischargeEnergy).toFixed(2)),
        gridPower: gridKw,
        batteryPower: Math.abs(battKw),
        batterySoc: battSoc,
        batteryVoltage: battVoltage,
        batteryCurrent: Math.abs(battCurrent),
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
