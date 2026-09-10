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
router.post("/manual/send", sendManualPlantData);

const deyeService = require("../integrations/deye/deye.service");

//===== (Station Endpoints for Web App — Direct from Live Deye Cloud) ======
router.get("/stations", async (req, res) => {
  try {
    const rawList = await deyeService.listStations();
    const stations = (rawList || []).map(st => {
      const id = st.stationId || st.id;
      const status =
        st.connectionStatus === "NORMAL" || st.status === "NORMAL"
          ? "Online"
          : st.connectionStatus === "ALL_OFFLINE" || st.status === "ALL_OFFLINE"
          ? "Offline"
          : st.connectionStatus === "NO_DEVICE" || st.status === "NO_DEVICE"
          ? "Incomplete"
          : "Online";
      const pvKw = Number(((st.generationPower || 0) / 1000).toFixed(2));
      const capacity = Number(st.installedCapacity || st.capacity || 0);

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
        alertsStatus: "No Alerts",
        capacity,
        production: pvKw,
        dailyProduction: Number(((st.generationPower || 0) / 1000 * 0.9).toFixed(1)),
        accumulativeProduction: 0,
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
    res.status(500).json({ success: false, message: err.message });
  }
});

const stationEnergySummaryCache = new Map();

async function getStationTodayEnergySummary(stationId) {
  const cached = stationEnergySummaryCache.get(stationId);
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
        const pGrid = (pt.wirePower ?? 0) / 1000;
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

  const summary = {
    consumptionTodayKwh: Number(consumptionTodayKwh.toFixed(2)),
    productionTodayKwh: Number(pvTodayKwh.toFixed(2)),
    pvKwh: Number(pvTodayKwh.toFixed(2)),
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

router.get("/stations/:stationId", async (req, res) => {
  try {
    const ID_ALIASES = {
      62566372: 62506492,
      62566373: 62448210,
      62566374: 62435287,
      62566375: 62433430,
    };
    const stationId = ID_ALIASES[Number(req.params.stationId)] || Number(req.params.stationId);

    // Fast memory cache check (30s TTL)
    const nowMs = Date.now();
    const cachedDetail = stationDetailCache.get(stationId);
    if (cachedDetail && nowMs - cachedDetail.timestamp < 30000) {
      return res.json({
        success: true,
        status: "success",
        data: cachedDetail.data,
      });
    }

    // Execute remote requests in parallel for maximum speed
    const [stationsListResult, latestResult, energySummaryResult] = await Promise.allSettled([
      getCachedStationList(),
      deyeService.getStationLatest(stationId),
      getStationTodayEnergySummary(stationId),
    ]);

    const allStations = stationsListResult.status === 'fulfilled' ? stationsListResult.value : [];
    const stationMeta = (allStations || []).find(st => Number(st.stationId || st.id) === Number(stationId)) || null;
    const latest = latestResult.status === 'fulfilled' ? latestResult.value : null;

    if (!stationMeta && !latest) {
      return res.status(404).json({ success: false, message: "Station not found" });
    }

    const pv = latest ? Number(((latest.generationPower || 0) / 1000).toFixed(2)) : 0;
    const load = latest ? Number(((latest.consumptionPower || 0) / 1000).toFixed(2)) : 0;
    const grid = latest ? Number(((latest.wirePower ?? 0) / 1000).toFixed(2)) : 0;
    let rawBatt = latest?.batteryPower;
    if (rawBatt === undefined || rawBatt === null || rawBatt === 0) {
      if (latest?.chargePower) rawBatt = -Math.abs(latest.chargePower);
      else if (latest?.dischargePower) rawBatt = Math.abs(latest.dischargePower);
    }
    const battery = latest ? Number(((rawBatt || 0) / 1000).toFixed(2)) : 0;
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
    if (Array.isArray(dbDevices) && dbDevices.length > 0) {
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
        production: pv,
        pv,
        pvGenerate: load,
        dailyProduction: energySummary.productionTodayKwh,
        productionToday: energySummary.productionTodayKwh,
        accumulativeProduction: 0,
        accumulativeConsumption: 0,
        gridConnection,
        batteryCapacity: "10kWh",
        batterySoc: soc,
        soc,
        batteryPower: battery,
        battery,
        gridPower: grid,
        grid,
        loadPower: load,
        load,
        upsLoad: load,
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
