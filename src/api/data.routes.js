//===== (Imports) ======
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const {
    sendManualPlantData,
    fetchDeviceData, 
    getDaily, 
    getMonthly, 
    getYearly, 
    getLifetime,
    getChart,
    getMonthlyChart,
    getYearlyChart
 } = require("../controllers/data.controller");

//===== (MockPlant Manual Route) ======
router.post("/manual/send", auth, sendManualPlantData);

const deyeService = require("../integrations/deye/deye.service");

//===== (Station Endpoints for Web App — Direct from Live Deye Cloud) ======
//===== (Live Energy Cache from Deye Cloud Inverters) ======
let allStationsEnergyCache = { timestamp: 0, map: new Map() };

async function getLiveStationEnergyMap(stationIds = []) {
  const now = Date.now();
  // 3 minutes in-memory cache for ultra-fast response times & zero rate-limit issues
  if (allStationsEnergyCache.map.size > 0 && now - allStationsEnergyCache.timestamp < 180000) {
    return allStationsEnergyCache.map;
  }

  try {
    const deyeClient = require("../integrations/deye/deye.client");
    const chunkSize = 8;
    const stationChunks = [];
    for (let i = 0; i < stationIds.length; i += chunkSize) {
      stationChunks.push(stationIds.slice(i, i + chunkSize));
    }

    const deviceResponses = await Promise.all(
      stationChunks.map(chunk =>
        deyeClient.post("/v1.0/station/device", { stationIds: chunk, page: 1, size: 50 }).catch(() => null)
      )
    );

    let allDevices = [];
    for (const res of deviceResponses) {
      if (Array.isArray(res?.deviceListItems)) {
        allDevices.push(...res.deviceListItems);
      }
    }

    const inverters = allDevices.filter(d => d.deviceType === "INVERTER");
    const inverterSns = inverters.map(d => d.deviceSn);

    const invChunks = [];
    for (let i = 0; i < inverterSns.length; i += 10) {
      invChunks.push(inverterSns.slice(i, i + 10));
    }

    const dataResponses = await Promise.all(
      invChunks.map(chunk =>
        deyeClient.post("/v1.0/device/latest", { deviceList: chunk }).catch(() => null)
      )
    );

    let allDeviceData = [];
    for (const res of dataResponses) {
      if (Array.isArray(res?.deviceDataList)) {
        allDeviceData.push(...res.deviceDataList);
      }
    }

    const map = new Map();
    allDeviceData.forEach(d => {
      const inv = inverters.find(i => i.deviceSn === d.deviceSn);
      if (!inv) return;
      const stId = Number(inv.stationId);
      if (!map.has(stId)) map.set(stId, { daily: 0, total: 0 });
      const cur = map.get(stId);
      const daily = Number(
        d.dataList?.find(k =>
          k.key === "DailyActiveProduction" ||
          k.key === "dailyProductionActive" ||
          k.key === "PVDailyPowerGenerationActive"
        )?.value || 0
      );
      const total = Number(
        d.dataList?.find(k =>
          k.key === "TotalActiveProduction" ||
          k.key === "cumulativeProductionActive" ||
          k.key === "TotalEnergySell"
        )?.value || 0
      );
      cur.daily = Number((cur.daily + daily).toFixed(2));
      cur.total = Number((cur.total + total).toFixed(2));
    });

    if (map.size > 0) {
      allStationsEnergyCache = { timestamp: now, map };
    }
    return map;
  } catch (err) {
    console.warn("[data.routes] getLiveStationEnergyMap warning:", err.message);
    return allStationsEnergyCache.map;
  }
}

let allStationsMonthlyCache = { timestamp: 0, map: new Map() };
const ALL_STATIONS_MONTHLY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getLiveStationMonthlyMap(stationIds = []) {
  const now = Date.now();
  if (
    allStationsMonthlyCache.map.size > 0 &&
    now - allStationsMonthlyCache.timestamp < ALL_STATIONS_MONTHLY_CACHE_TTL_MS
  ) {
    return allStationsMonthlyCache.map;
  }

  try {
    const deyeClient = require("../integrations/deye/deye.client");
    const nowD = new Date();
    const currentYearMonth = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
    const chunkSize = 8;
    const stationChunks = [];
    for (let i = 0; i < stationIds.length; i += chunkSize) {
      stationChunks.push(stationIds.slice(i, i + chunkSize));
    }

    const map = new Map(allStationsMonthlyCache.map);
    for (const chunk of stationChunks) {
      const results = await Promise.all(
        chunk.map(async (stId) => {
          try {
            const res = await deyeClient.post("/v1.0/station/history", {
              stationId: Number(stId),
              granularity: 3,
              startAt: currentYearMonth,
              endAt: currentYearMonth,
            });
            const val = Number(res?.stationDataItems?.[0]?.generationValue || 0);
            return { id: Number(stId), monthlyKwh: Number(val.toFixed(2)) };
          } catch {
            return { id: Number(stId), monthlyKwh: 0 };
          }
        })
      );
      for (const r of results) {
        if (r.monthlyKwh > 0) {
          map.set(r.id, r.monthlyKwh);
        }
      }
    }

    if (map.size > 0) {
      allStationsMonthlyCache = { timestamp: now, map };
    }
    return map;
  } catch (err) {
    console.warn("[data.routes] getLiveStationMonthlyMap warning:", err.message);
    return allStationsMonthlyCache.map;
  }
}

let lastStationAuditTime = 0;
const STATION_AUDIT_INTERVAL_MS = 15 * 60 * 1000;

router.get("/stations", auth, async (req, res) => {
  try {
    const rawList = await deyeService.listStations();
    const stationIds = (rawList || [])
      .map(st => Number(st.stationId || st.id))
      .filter(id => id && id >= 1000000);

    // Periodic background audit & sync for any newly added Deye stations
    const now = Date.now();
    if (now - lastStationAuditTime > STATION_AUDIT_INTERVAL_MS) {
      lastStationAuditTime = now;
      const { auditAndSyncDeyePlants } = require("../services/plantAuditSync.service");
      auditAndSyncDeyePlants().catch(() => {});
    }

    // Retrieve authentic real-time daily & accumulative energy from Deye Cloud inverters
    // and authentic month-to-date energy from Deye Cloud station history
    const [liveEnergyMap, liveMonthlyMap] = await Promise.all([
      getLiveStationEnergyMap(stationIds),
      getLiveStationMonthlyMap(stationIds),
    ]);

    const stations = (rawList || [])

      .map(st => {
        const id = st.stationId || st.id;
        const pvKw = Number(((st.generationPower || 0) / 1000).toFixed(2));
        const capacity = Number(st.installedCapacity || st.capacity || 0);

        let status = "Online";
        if (
          st.connectionStatus === "NORMAL" ||
          st.status === "NORMAL" ||
          st.connectStatus === 1 ||
          st.status === 1
        ) {
          status = "Online";
        } else if (
          st.connectionStatus === "NO_DEVICE" ||
          st.status === "NO_DEVICE" ||
          st.connectStatus === 2 ||
          st.status === 2
        ) {
          status = "Incomplete";
        } else if (
          st.connectionStatus === "ALL_OFFLINE" ||
          st.status === "ALL_OFFLINE" ||
          st.connectStatus === 0 ||
          st.status === 0 ||
          st.connectStatus === 3 ||
          st.status === 3
        ) {
          status = "Offline";
        }

        const production = status === "Offline" ? 0 : pvKw;

        const liveEnergy = liveEnergyMap.get(Number(id));
        const cachedEnergy = stationEnergySummaryCache.get(Number(id));
        const dailyProd = liveEnergy != null && liveEnergy.daily >= 0
          ? liveEnergy.daily
          : (st.generationDay != null
              ? Number(Number(st.generationDay).toFixed(2))
              : (cachedEnergy?.summary?.productionTodayKwh ?? (st.dailyEnergy != null ? Number(st.dailyEnergy) : undefined)));
        const accProd = liveEnergy != null && liveEnergy.total >= 0
          ? liveEnergy.total
          : (st.generationTotal != null
              ? Number(Number(st.generationTotal).toFixed(2))
              : (st.totalEnergy != null ? Number(st.totalEnergy) : undefined));

        const liveMonthly = liveMonthlyMap.get(Number(id));
        const monthlyProd = liveMonthly != null && liveMonthly > 0
          ? liveMonthly
          : (st.generationMonth != null
              ? Number(Number(st.generationMonth).toFixed(2))
              : (st.monthlyEnergy != null ? Number(st.monthlyEnergy) : 0));

        return {
          id,
          name: st.stationName || st.name,
          address: st.locationAddress || "",
          city: "",
          province: "",
          postalCode: "",
          coordinates: st.locationLat && st.locationLng ? `${st.locationLat}, ${st.locationLng}` : "",
          timeZone: st.regionTimezone || "Asia/Jakarta",
          plantsId: String(id),
          status,
          comStatus: status,
          alertsStatus: (st.alarmCount || 0) > 0 ? "Alerts" : "No Alerts",
          capacity,
          production,
          dailyProduction: dailyProd,
          monthlyProduction: monthlyProd,
          accumulativeProduction: accProd,
          accumulativeConsumption: 0,
          gridConnection: st.gridInterconnectionType || "GRID_TIED",
          batteryCapacity: "10kWh",
          batterySoc: Number(st.batterySOC || 0),
          batteryPower: 0,
          gridPower: 0,
          loadPower: 0,
          currency: "Rp",
          unitPrice: "1444",
          constructionCost: "0",
          creator: st.ownerName || "Deye Cloud",
          createTime: st.createdDate ? new Date(st.createdDate * 1000).toISOString() : "",
          weatherTemperature: 28,
          weatherConditionText: "Sunny",
          trend: [pvKw * 0.2, pvKw * 0.4, pvKw * 0.6, pvKw * 0.8, pvKw],
          devices: [],
          alerts: [],
          lastUpdateTime: st.lastUpdateTime ? new Date(st.lastUpdateTime * 1000).toISOString() : new Date().toISOString(),
        };
      });

    res.json({ success: true, status: "success", data: stations, total: stations.length });
  } catch (err) {
    const cachedDetail = stationDetailCache.get(Number(req.params.stationId));
    if (cachedDetail?.data) {
      return res.json({ success: true, status: "success", data: cachedDetail.data });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

const stationEnergySummaryCache = new Map();

async function getStationTodayEnergySummary(stationId) {
  const numId = Number(stationId);
  // Bypass Deye Cloud API for custom database plants (e.g. ID 42, 10, 14) that do not have 8-digit Deye station IDs
  if (!numId || numId < 1000000) {
    return {
      consumptionTodayKwh: 0,
      productionTodayKwh: 0,
      pvKwh: 0,
      gridKwh: 0,
      exportKwh: 0,
      batteryChargeKwh: 0,
      batteryDischargeKwh: 0,
    };
  }

  const cached = stationEnergySummaryCache.get(numId);
  const nowMs = Date.now();
  if (cached && nowMs - cached.timestamp < 60000) {
    return cached.summary;
  }

  const today = new Date();
  const startOfDay = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).getTime() / 1000);
  const nowTs = Math.floor(nowMs / 1000);

  let pvTodayKwh = 0;
  let consumptionTodayKwh = 0;
  let gridImportTodayKwh = 0;
  let gridExportTodayKwh = 0;
  let batteryChargeTodayKwh = 0;
  let batteryDischargeTodayKwh = 0;
  let hasValidHardwareMeter = false;

  // 1. Prioritize authentic Deye Cloud hardware energy registers from inverter telemetry
  try {
    const { fetchDeyeStationDevicesWithLatest } = require("../services/data/deyeDevices.service");
    const devs = await fetchDeyeStationDevicesWithLatest(stationId);
    if (Array.isArray(devs) && devs.length > 0) {
      let sumProd = 0;
      let sumCons = 0;
      let sumGridBuy = 0;
      let sumGridSell = 0;
      let sumCharge = 0;
      let sumDischarge = 0;

      devs.forEach(d => {
        if ((d.dailyEnergy != null && d.dailyEnergy > 0) || (d.dailyConsumption != null && d.dailyConsumption > 0) || (d.dailyEnergyPurchased != null && d.dailyEnergyPurchased > 0)) {
          hasValidHardwareMeter = true;
        }
        sumProd += (d.dailyEnergy || 0);
        sumCons += (d.dailyConsumption || 0);
        sumGridBuy += (d.dailyEnergyPurchased || 0);
        sumGridSell += (d.dailyGridFeedIn || 0);
        sumCharge += (d.dailyChargingEnergy || 0);
        sumDischarge += (d.dailyDischargingEnergy || 0);
      });

      if (hasValidHardwareMeter) {
        pvTodayKwh = sumProd;
        consumptionTodayKwh = sumCons;
        gridImportTodayKwh = sumGridBuy;
        gridExportTodayKwh = sumGridSell;
        batteryChargeTodayKwh = sumCharge;
        batteryDischargeTodayKwh = sumDischarge;
      }
    }
  } catch (devErr) {
    console.warn(`[data.routes] fetchDeyeStationDevicesWithLatest in energy summary error for ${stationId}:`, devErr.message);
  }

  // 2. Safety fallback: 5-minute instantaneous power Riemann integration (only if hardware registers are completely absent)
  if (!hasValidHardwareMeter) {
    try {
      const deyeClient = require("../integrations/deye/deye.client");
      const histRes = await deyeClient.post("/v1.0/station/history/power", {
        stationId: Number(stationId),
        startTimestamp: startOfDay,
        endTimestamp: nowTs,
      });

      if (Array.isArray(histRes?.stationDataItems) && histRes.stationDataItems.length > 0) {
        const intervalHours = 5 / 60;
        histRes.stationDataItems.forEach(pt => {
          const pPv = (pt.generationPower || 0) / 1000;
          const pLoad = (pt.consumptionPower || 0) / 1000;
          const rawGrid = pt.wirePower != null ? pt.wirePower : (pt.gridPower != null ? pt.gridPower : (pt.purchasePower != null ? pt.purchasePower : 0));
          const pGrid = Number(rawGrid || 0) / 1000;
          const pBatt = (pt.batteryPower || 0) / 1000;

          pvTodayKwh += pPv * intervalHours;
          consumptionTodayKwh += pLoad * intervalHours;
          if (pGrid > 0) gridImportTodayKwh += pGrid * intervalHours;
          else if (pGrid < 0) gridExportTodayKwh += Math.abs(pGrid) * intervalHours;

          if (pBatt < 0) batteryChargeTodayKwh += Math.abs(pBatt) * intervalHours;
          else if (pBatt > 0) batteryDischargeTodayKwh += pBatt * intervalHours;
        });
      }
    } catch (err) {
      console.warn(`[data.routes] getStationTodayEnergySummary for ${stationId} error:`, err.message);
    }
  }

  // Calculate direct solar self-consumption for load
  const directPvKwh = Math.max(0, consumptionTodayKwh - gridImportTodayKwh - batteryDischargeTodayKwh);

  const summary = {
    consumptionTodayKwh: Number(consumptionTodayKwh.toFixed(2)),
    productionTodayKwh: Number(pvTodayKwh.toFixed(2)),
    pvKwh: Number(directPvKwh.toFixed(2)),
    directPvKwh: Number(directPvKwh.toFixed(2)),
    gridKwh: Number(gridImportTodayKwh.toFixed(2)),
    exportKwh: Number(gridExportTodayKwh.toFixed(2)),
    batteryChargeKwh: Number(batteryChargeTodayKwh.toFixed(2)),
    batteryDischargeKwh: Number(batteryDischargeTodayKwh.toFixed(2)),
  };

  stationEnergySummaryCache.set(stationId, { timestamp: nowMs, summary });
  return summary;
}

const stationDetailCache = new Map();
let allStationsListCache = { timestamp: 0, data: [] };

async function getCachedStationList() {
  const now = Date.now();
  if (allStationsListCache.data.length > 0 && now - allStationsListCache.timestamp < 120000) {
    return allStationsListCache.data;
  }
  try {
    const list = await deyeService.listStations();
    allStationsListCache = { timestamp: now, data: list || [] };
    return allStationsListCache.data;
  } catch (err) {
    if (allStationsListCache.data.length > 0) return allStationsListCache.data;
    return [];
  }
}

const { fetchDeyeStationDevicesWithLatest } = require("../services/data/deyeDevices.service");


router.get("/stations/:stationId", auth, async (req, res) => {
  try {
    const ID_ALIASES = {
      62566372: 62506492,
      62566373: 62448210,
      62566374: 62435287,
      62566375: 62433430,
    };
    let resolvedStationId = ID_ALIASES[Number(req.params.stationId)] || Number(req.params.stationId);
    try {
      const db = require("../config/db");
      const integration = await db("deye_integrations")
        .where("plant_id", String(resolvedStationId))
        .first();
      if (integration?.station_id) {
        resolvedStationId = Number(integration.station_id);
      }
    } catch (_) {}
    const stationId = resolvedStationId;

    // Fast memory cache check (60s TTL - avoids frequent remote round trips)
    const nowMs = Date.now();
    const cachedDetail = stationDetailCache.get(stationId);
    if (cachedDetail && nowMs - cachedDetail.timestamp < 60000) {
      return res.json({
        success: true,
        status: "success",
        data: cachedDetail.data,
      });
    }

    // Execute all remote requests in parallel for maximum speed (zero waterfall)
    const [stationsListResult, latestResult, energySummaryResult, parallelInvertersResult] = await Promise.allSettled([
      getCachedStationList(),
      deyeService.getStationLatest(stationId),
      getStationTodayEnergySummary(stationId),
      Number(stationId) >= 1000000 ? fetchDeyeStationDevicesWithLatest(stationId) : Promise.resolve([]),
    ]);

    const allStations = stationsListResult.status === 'fulfilled' ? stationsListResult.value : [];
    const stationMeta = (allStations || []).find(st => Number(st.stationId || st.id) === Number(stationId)) || null;
    const latest = latestResult.status === 'fulfilled' ? latestResult.value : null;

    if (!stationMeta && !latest) {
      return res.status(404).json({ success: false, message: "Station not found" });
    }

    const pv = latest ? Number(((latest.generationPower || 0) / 1000).toFixed(2)) : 0;
    const load = latest ? Number(((latest.consumptionPower || 0) / 1000).toFixed(2)) : 0;
    const rawGrid = latest ? (latest.wirePower != null ? latest.wirePower : (latest.gridPower != null ? latest.gridPower : (latest.purchasePower != null ? latest.purchasePower : 0))) : 0;
    const grid = Number((Number(rawGrid || 0) / 1000).toFixed(2));
    const battery = latest ? Number(((latest.batteryPower || 0) / 1000).toFixed(2)) : 0;
    const soc = latest && latest.batterySOC != null ? Number(Number(latest.batterySOC).toFixed(1)) : 0;
    const lastUpdateIso = latest?.lastUpdateTime
      ? new Date(latest.lastUpdateTime * 1000).toISOString()
      : (stationMeta?.lastUpdateTime ? new Date(stationMeta.lastUpdateTime * 1000).toISOString() : new Date().toISOString());

    const energySummary = energySummaryResult.status === 'fulfilled' && energySummaryResult.value ? energySummaryResult.value : {
      consumptionTodayKwh: 0,
      productionTodayKwh: 0,
      pvKwh: 0,
      gridKwh: 0,
      exportKwh: 0,
      batteryChargeKwh: 0,
      batteryDischargeKwh: 0,
    };

    // 3. Resolve NeonDB plant & devices
    let plantId = null;
    let dbPlant = null;
    let dbDevices = [];
    try {
      const db = require("../config/db");
      const { getPlantDevices } = require("../services/plantDevice.service");

      const integration = await db("deye_integrations")
        .where("station_id", String(stationId))
        .orWhere("plant_id", String(stationId))
        .first();
      if (integration) {
        plantId = integration.plant_id;
      } else {
        const directPlant = await db("plants").where("id", String(stationId)).first();
        if (directPlant) {
          plantId = directPlant.id;
        }
      }

      if (plantId) {
        dbPlant = await db("plants").where("id", String(plantId)).first();
        dbDevices = await getPlantDevices(plantId);
      }
    } catch (dbErr) {
      console.warn(`[data.routes] NeonDB lookup error for station ${stationId}:`, dbErr.message);
    }

    let devices = [];
    if (parallelInvertersResult.status === 'fulfilled' && Array.isArray(parallelInvertersResult.value) && parallelInvertersResult.value.length > 0) {
      devices = parallelInvertersResult.value;
    } else if (stationMeta || Number(stationId) >= 1000000) {
      try {
        const deyeInverters = await fetchDeyeStationDevicesWithLatest(
          stationId,
          stationMeta,
          lastUpdateIso,
          pv,
          energySummary
        );
        if (deyeInverters.length > 0) {
          devices = deyeInverters;
        }
      } catch (_) {}
    }

    if (devices.length === 0 && Array.isArray(dbDevices) && dbDevices.length > 0) {
      const inverters = dbDevices.filter(d => d.deviceType === 'INVERTER');
      devices = dbDevices.map((d, i) => {
        const isStationGateway = String(d.device_id).startsWith("DEYE_STATION_");
        const isInv = d.deviceType === "INVERTER";
        const invIdx = inverters.findIndex(inv => inv.device_id === d.device_id);
        const devName = isStationGateway
          ? "Plant Telemetry"
          : d.deviceType || (isInv ? `Inverter ${invIdx >= 0 ? invIdx + 1 : i + 1}` : `Device ${i + 1}`);
        const statusStr =
          d.connectStatus === 1
            ? "Online"
            : d.connectStatus === 0
            ? "Offline"
            : (isStationGateway ? (stationMeta?.connectionStatus === "NORMAL" || stationMeta?.status === "NORMAL" ? "Online" : "Offline") : "Online");

        const devPower = isStationGateway
          ? pv
          : (Array.isArray(d.latestData) && d.latestData.length > 0
              ? (Math.abs(Number(d.latestData.find(r => r.category === 'pv' || r.type === 'power')?.value)) || 0)
              : 0);

        return {
          id: d.id,
          device_id: d.device_id,
          sn: d.device_id,
          name: devName,
          type: isStationGateway ? "Plant Telemetry" : (d.deviceType || "Inverter"),
          deviceType: d.deviceType || (isStationGateway ? "Plant Telemetry" : "Inverter"),
          status: statusStr,
          connectStatus: d.connectStatus ?? (statusStr === "Online" ? 1 : 0),
          power: devPower,
          dailyEnergy: isStationGateway ? energySummary.productionTodayKwh : 0,
          totalEnergy: 0,
          lastSeen: d.lastSeen || lastUpdateIso,
          latestData: d.latestData || [],
        };
      });
    } else {
      // Fallback to Deye Cloud API devices if not yet registered in NeonDB
      try {
        const devList = await deyeService.getStationDevices(stationId);
        if (Array.isArray(devList) && devList.length > 0) {
          const inverters = devList.filter(d => d.deviceType === 'INVERTER');
          devices = devList.map((d, i) => {
            const isInv = d.deviceType === 'INVERTER';
            const invIdx = inverters.findIndex(inv => inv.deviceSn === d.deviceSn);
            const devName = isInv
              ? `Inverter ${invIdx >= 0 ? invIdx + 1 : i + 1}`
              : `${d.deviceType} (${d.deviceSn})`;
            return {
              device_id: d.deviceSn,
              sn: d.deviceSn,
              name: devName,
              type: d.deviceType,
              deviceType: d.deviceType,
              status: d.connectStatus === 1 ? 'Online' : 'Offline',
              connectStatus: d.connectStatus,
              power: isInv && inverters.length > 0 ? Number((pv / inverters.length).toFixed(2)) : 0,
              dailyEnergy: isInv && inverters.length > 0 ? Number((energySummary.productionTodayKwh / inverters.length).toFixed(2)) : 0,
              totalEnergy: 0,
              lastSeen: lastUpdateIso,
              latestData: [],
            };
          });
        }
        const stationGatewayId = `DEYE_STATION_${stationId}`;
        if (!devices.some(d => d.device_id === stationGatewayId)) {
          devices.push({
            device_id: stationGatewayId,
            sn: stationGatewayId,
            name: "Plant Telemetry",
            type: "Plant Telemetry",
            deviceType: "Plant Telemetry",
            status: stationMeta?.connectionStatus === "NORMAL" ? "Online" : "Offline",
            connectStatus: stationMeta?.connectionStatus === "NORMAL" ? 1 : 0,
            power: pv,
            dailyEnergy: energySummary.productionTodayKwh,
            totalEnergy: 0,
            lastSeen: lastUpdateIso,
            latestData: [
              { category: 'pv', type: 'chargePower', value: pv, created_at: lastUpdateIso },
              { category: 'baterai', type: 'power', value: battery, created_at: lastUpdateIso },
              { category: 'baterai', type: 'soc', value: soc, created_at: lastUpdateIso },
              { category: 'grid', type: 'power', value: grid, created_at: lastUpdateIso },
              { category: 'out', type: 'power', value: load, created_at: lastUpdateIso },
              { category: 'production', type: 'pvGenerate', value: load, created_at: lastUpdateIso },
            ],
          });
        }
      } catch (devErr) {
        console.warn(`[data.routes] Could not fetch station devices for ${stationId}:`, devErr.message);
      }
    }

    // Determine status matching Deye Cloud
    const rawStatus = stationMeta?.connectionStatus || stationMeta?.status;
    const computedStatus =
      rawStatus === "NORMAL"
        ? "Online"
        : rawStatus === "ALL_OFFLINE"
        ? "Offline"
        : rawStatus === "NO_DEVICE"
        ? "Incomplete"
        : (devices.length > 0 ? "Online" : "Incomplete");

    const capacity = Number(stationMeta?.installedCapacity || stationMeta?.capacity || 0);
    const stationName = stationMeta?.stationName || stationMeta?.name || dbPlant?.name || `Plant ${stationId}`;
    const address = dbPlant?.location || stationMeta?.locationAddress || "";
    const city = dbPlant?.city || "";
    const province = dbPlant?.province || "";
    const coordinates = stationMeta?.locationLat && stationMeta?.locationLng ? `${stationMeta.locationLat}, ${stationMeta.locationLng}` : "";
    const timeZone = stationMeta?.regionTimezone || "Asia/Jakarta";
    const createTime = stationMeta?.createdDate ? new Date(stationMeta.createdDate * 1000).toISOString().split('T')[0] : "";
    const creator = stationMeta?.ownerName || "Deye Cloud";
    const gridConnection = stationMeta?.gridInterconnectionType || "GRID_TIED";

    const invertersList = Array.isArray(devices) ? devices.filter(d => d.type === 'INVERTER' || d.deviceType === 'INVERTER') : [];
    const totalInvLoadKw = invertersList.reduce((acc, d) => acc + (Number(d.loadPower) || 0), 0);
    const totalInvUpsKw = invertersList.reduce((acc, d) => acc + (Number(d.upsLoadPower) || 0), 0);
    const totalInvConsKw = invertersList.reduce((acc, d) => acc + (Number(d.consumptionPower) || 0), 0);

    const effectiveLoadKw = totalInvConsKw > 0
      ? Number(totalInvConsKw.toFixed(2))
      : (totalInvLoadKw + totalInvUpsKw > 0 ? Number((totalInvLoadKw + totalInvUpsKw).toFixed(2)) : load);

    const stationRegularLoad = totalInvLoadKw > 0 ? Number(totalInvLoadKw.toFixed(2)) : effectiveLoadKw;
    const stationUpsLoad = totalInvUpsKw > 0 ? Number(totalInvUpsKw.toFixed(2)) : 0;

    const responseData = {
      id: stationId,
        plantsId: String(stationId),
        name: stationName,
        address,
        city,
        province,
        postalCode: "",
        coordinates,
        timeZone,
        status: computedStatus,
        comStatus: computedStatus,
        alertsStatus: "No Alerts",
        capacity,
        production: computedStatus === "Offline" ? 0 : pv,
        pv: computedStatus === "Offline" ? 0 : pv,
        pvGenerate: effectiveLoadKw,
        dailyProduction: energySummary.productionTodayKwh,
        productionToday: energySummary.productionTodayKwh,
        monthlyProduction: stationMeta?.generationMonth != null
          ? Number(Number(stationMeta.generationMonth).toFixed(2))
          : (allStationsMonthlyCache?.map?.get(Number(stationId)) || 0),
        accumulativeProduction: stationMeta?.generationTotal != null
          ? Number(Number(stationMeta.generationTotal).toFixed(2))
          : (devices.reduce((s, d) => s + (d.totalEnergy || 0), 0) || 0),
        accumulativeConsumption: devices.reduce((s, d) => s + (d.totalConsumption || 0), 0) || 0,
        gridConnection,
        batteryCapacity: "10kWh",
        batterySoc: soc,
        soc,
        batteryPower: battery,
        battery,
        gridPower: grid,
        grid,
        loadPower: effectiveLoadKw,
        load: effectiveLoadKw,
        regularLoad: stationRegularLoad,
        upsLoad: stationUpsLoad,
        upsLoadPower: stationUpsLoad,
        currency: "Rp",
        unitPrice: "--",
        constructionCost: "--",
        creator,
        createTime,
        weatherTemperature: 28,
        weatherConditionText: "Sunny",
        isDeviceOnline: computedStatus === "Online",
        energySummary,
        consumptionTodayKwh: energySummary.consumptionTodayKwh,
        productionTodayKwh: energySummary.productionTodayKwh,
        gridKwh: energySummary.gridKwh,
        exportKwh: energySummary.exportKwh,
        batteryChargeKwh: energySummary.batteryChargeKwh,
        batteryDischargeKwh: energySummary.batteryDischargeKwh,
        devices,
        alerts: [],
        lastUpdateTime: lastUpdateIso,
        updatedAt: lastUpdateIso,
        source: "deye_live",
      };

    stationDetailCache.set(stationId, { timestamp: nowMs, data: responseData });

    res.json({
      success: true,
      status: "success",
      data: responseData,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

//===== (Authenticated Data Routes) ======
router.get("/", auth, fetchDeviceData);
router.get("/chart/monthly", auth, getMonthlyChart);
router.get("/chart/yearly", auth, getYearlyChart);
router.get("/chart", auth, getChart);
router.get("/daily", auth, getDaily);
router.get("/monthly", auth, getMonthly);
router.get("/yearly", auth, getYearly);
router.get("/lifetime", auth, getLifetime);

//===== (Exports) ======
module.exports = router;
