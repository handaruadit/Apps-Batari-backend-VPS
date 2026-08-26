require("dotenv").config();

const API_URL = "http://localhost:3001";
const DEVICE_ID = "BMS_JIABAIDA";

const testBmsApi = async () => {
  try {
    const email = process.env.TEST_API_EMAIL;
    const password = process.env.TEST_API_PASSWORD;
    const plantId = process.env.TEST_PLANT_ID || 3;

    if (!email || !password) {
      throw new Error(
        "TEST_API_EMAIL dan TEST_API_PASSWORD belum diisi di .env",
      );
    }

    // Login untuk mendapatkan token
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      throw new Error(loginData.message || "Login gagal");
    }

    console.log("Login berhasil.");

    // Mengambil device yang terhubung ke plant
    const deviceResponse = await fetch(
      `${API_URL}/api/plant/${plantId}/devices`,
      {
        headers: {
          Authorization: `Bearer ${loginData.token}`,
        },
      },
    );

    const deviceData = await deviceResponse.json();

    if (!deviceResponse.ok) {
      throw new Error(
        deviceData.message || "Gagal mengambil data device plant",
      );
    }

    const devices = deviceData.data?.devices || [];

    const bmsDevice = devices.find((device) => device.device_id === DEVICE_ID);

    if (!bmsDevice) {
      console.log(`${DEVICE_ID} belum ditemukan pada response API.`);

      console.dir(deviceData, {
        depth: null,
      });

      return;
    }

    console.log(`\n${DEVICE_ID} berhasil ditemukan pada Plant ID ${plantId}.`);

    console.log("\nData terbaru BMS:");

    console.table(
      (bmsDevice.latestData || []).map((item) => ({
        category: item.category,
        type: item.type,
        value: item.value,
        createdAt: item.createdAt || item.created_at,
      })),
    );
  } catch (error) {
    console.error("\nPengujian API gagal:", error.message);
  }
};

testBmsApi();
