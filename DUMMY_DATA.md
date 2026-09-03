# MockPlant dan dummy chart

Backend memiliki dua mekanisme dummy yang berbeda:

1. **MockPlant persisten** — menulis data ke PostgreSQL dan mengirim pembaruan Socket.IO.
2. **Mock chart fallback** — hanya membuat response chart ketika data database kosong dan tidak melakukan insert.

## Status MockPlant saat ini

`src/services/mockPlantData.service.js` tetap dipertahankan.

- Automatic sender tersedia melalui fungsi `startAutomaticPlantDataSender()`.
- Source saat ini **tidak memulai automatic sender**, karena pemanggilannya di `src/index.js` masih dikomentari.
- Endpoint manual `POST /api/data/manual/send` tetap aktif untuk testing.
- Data manual/otomatis menggunakan relasi `plant_devices.device_id → plant_devices.plant_id`.

Jika automatic sender memang dibutuhkan pada environment testing, aktifkan secara sengaja setelah memastikan target plant/device benar. Jangan mengaktifkannya pada production tanpa persetujuan karena data akan tersimpan permanen.

## Environment MockPlant

```env
MOCK_PLANT_ENABLED=true
MOCK_PLANT_ID=1
MOCK_PLANT_NAME=Plant Testing
MOCK_PLANT_INTERVAL_MS=300000
```

`MOCK_PLANT_ENABLED=false` mencegah automatic sender berjalan ketika fungsi startup dipanggil. Nilai tersebut tidak menonaktifkan endpoint manual.

## Data yang dibuat

Setiap bucket dapat menyimpan telemetry berikut:

- `pv / chargePower`
- `out / power`
- `out / vaPower`
- `grid / power`
- `baterai / power`

MockPlant juga dapat melakukan backfill bucket hari berjalan dan mencegah duplikasi berdasarkan device, category, type, dan waktu bucket.

## Endpoint manual

```http
POST /api/data/manual/send
Content-Type: application/json
```

Endpoint ini adalah alat testing, tidak menggunakan middleware Bearer token, dan dapat menulis database serta mengirim event realtime. Batasi akses melalui jaringan/reverse proxy bila server dapat diakses publik.

## Script Telemetry Simulator VPS

Tersedia script simulator standalone untuk mengirim data kurva telemetri secara berkala dan realtime ke endpoint `/api/data/manual/send`:

### 1. Batari Rooftop ("rooftop" / Plant ID 5)
```bash
npm run simulate:rooftop
# atau
node scripts/simulate-vps-rooftop.js
```
- **Target Plant:** `"rooftop"`
- **Device ID:** `"INVERTER_01"`
- **Interval:** 5 detik

### 2. Batari Rooftop Villa Canggu (Plant ID 6)
```bash
npm run simulate:canggu
# atau
node scripts/simulate-vps-canggu.js
```
- **Target Plant:** `"Batari Rooftop Villa Canggu"`
- **Device ID:** `"INVERTER_02"`
- **Interval:** 5 detik

#### Opsi & Flag Tambahan:
- `--plant <name>` : Menentukan nama plant target.
- `--device <deviceId>` : Menentukan device ID target.
- `--url <apiUrl>` : Mengubah URL endpoint backend (default: `http://89.116.33.75:3001/api/data/manual/send`).
- `--interval <ms>` : Mengatur interval stream realtime dalam milidetik (default: `5000`).
- `--no-backfill` : Melewati proses backfill riwayat hari ini dan langsung memulai streaming realtime.


## Mock chart fallback

```env
MOCK_CHART_ENABLED=false
MOCK_CHART_POINTS_PER_DAY=180
```

Jika diaktifkan, endpoint `/api/data/chart` tetap mencoba database terlebih dahulu. Dummy chart hanya dikembalikan saat series database kosong dan ditandai dengan `source: "dummy"`.

## Memeriksa data PostgreSQL

```sql
SELECT
  pd.plant_id,
  dd.device_id,
  dd.category,
  dd.type,
  COUNT(*) AS total,
  MAX(dd.created_at) AS last_data
FROM device_data dd
JOIN plant_devices pd ON pd.device_id = dd.device_id
WHERE pd.plant_id = 1
GROUP BY pd.plant_id, dd.device_id, dd.category, dd.type
ORDER BY last_data DESC;
```

Data lama tidak memiliki flag khusus `mock`. Jangan menghapus row hanya berdasarkan nama plant tanpa backup dan filter device/waktu yang sudah diverifikasi.
