# Persistent Dummy Device Data

Backend ini dapat membuat data dummy random secara otomatis dan menyimpannya permanen ke PostgreSQL. Frontend tetap membaca grafik dari endpoint `/api/data/chart`; AsyncStorage di aplikasi hanya cache/fallback lokal.

## Cara kerja

- Generator berjalan saat server Node.js start melalui `startAutomaticPlantDataSender()`.
- Target default adalah `MOCK_PLANT_ID=1`.
- Jika plant `1` tidak ditemukan, generator mencoba plant bernama `MOCK_PLANT_NAME`.
- Backend mengambil `device_id` dari tabel `plant_devices` untuk plant tersebut.
- Setiap bucket 5 menit, backend menyimpan 5 row ke `device_data`:
  - `pv / chargePower`
  - `out / power`
  - `out / vaPower`
  - `grid / power`
  - `baterai / power`
- Saat start, backend melakukan backfill dari jam `00:00` Asia/Jakarta sampai bucket sekarang.
- Setelah backfill, backend lanjut insert otomatis setiap 5 menit.
- Anti-duplikat dilakukan per `device_id`, `category`, `type`, dan bucket waktu 5 menit. Restart server tidak akan menggandakan bucket yang sudah ada.

Catatan schema: tabel `device_data` di project ini tidak memiliki kolom `plant_id`. Relasi plant berasal dari `plant_devices.device_id -> plant_devices.plant_id`.

## Environment

```env
MOCK_PLANT_ENABLED=true
MOCK_PLANT_ID=1
MOCK_PLANT_NAME=Plant Testing
MOCK_PLANT_INTERVAL_MS=300000
```

Matikan generator dengan:

```env
MOCK_PLANT_ENABLED=false
```

## Menjalankan backend

```bash
npm install
npm start
```

Untuk development:

```bash
npm run dev
```

Log yang diharapkan:

```text
[mock-plant] Backfill hari ini selesai ...
[mock-plant] Dummy data DB aktif ...
[mock-plant] Insert 5 row dummy untuk bucket ...
```

## Cek PostgreSQL

Karena `device_data` tidak menyimpan `plant_id`, gunakan join ke `plant_devices`:

```sql
SELECT
  pd.plant_id,
  dd.category,
  dd.type,
  COUNT(*) AS total,
  MAX(dd.created_at) AS last_data
FROM device_data dd
JOIN plant_devices pd ON pd.device_id = dd.device_id
WHERE pd.plant_id = 1
GROUP BY pd.plant_id, dd.category, dd.type
ORDER BY last_data DESC;
```

```sql
SELECT DISTINCT dd.category, dd.type
FROM device_data dd
JOIN plant_devices pd ON pd.device_id = dd.device_id
WHERE pd.plant_id = 1
ORDER BY dd.category, dd.type;
```

```sql
SELECT dd.*
FROM device_data dd
JOIN plant_devices pd ON pd.device_id = dd.device_id
WHERE pd.plant_id = 1
ORDER BY dd.created_at DESC
LIMIT 20;
```

```sql
SELECT dd.*
FROM device_data dd
JOIN plant_devices pd ON pd.device_id = dd.device_id
WHERE pd.plant_id = 1
  AND dd.created_at::date = CURRENT_DATE
ORDER BY dd.created_at DESC
LIMIT 50;
```

## Test endpoint chart

Login dulu untuk mendapatkan token:

```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"adit@mail.com\",\"password\":\"123456\"}"
```

Test chart hari ini:

```bash
curl "http://localhost:3000/api/data/chart?plantId=1&segment=day&date=YYYY-MM-DD" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN"
```

Expected:

- `data.production` tidak kosong
- `data.load` tidak kosong
- `data.upsLoad` tidak kosong
- `data.grid` tidak kosong
- `data.battery` tidak kosong

Jika backend berjalan di VPS, ganti host menjadi:

```text
http://103.31.205.39:3000
```
