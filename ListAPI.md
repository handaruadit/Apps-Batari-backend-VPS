# Daftar API belajar-api

Base URL lokal:

```text
http://localhost:3000
```

Port mengikuti nilai `PORT` pada `.env`. Endpoint bertanda **Bearer** membutuhkan header:

```http
Authorization: Bearer <token>
```

## Authentication

| Method | Endpoint | Auth | Kegunaan |
|---|---|---|---|
| POST | `/api/auth/register` | Tidak | Mendaftarkan pengguna |
| POST | `/api/auth/login` | Tidak | Login dan mendapatkan JWT |
| POST | `/api/auth/forgot-password` | Tidak | Mengirim kode reset password |
| POST | `/api/auth/verify-reset-code` | Tidak | Memverifikasi kode reset |
| POST | `/api/auth/reset-password` | Tidak | Mengganti password |

## Data dan chart

| Method | Endpoint | Auth | Kegunaan |
|---|---|---|---|
| POST | `/api/data/manual/send` | Tidak | Mengirim data MockPlant manual untuk testing |
| GET | `/api/data/` | Bearer | Mengambil telemetry terbaru berdasarkan filter |
| GET | `/api/data/daily` | Bearer | Ringkasan/data harian |
| GET | `/api/data/monthly` | Bearer | Ringkasan/data bulanan |
| GET | `/api/data/yearly` | Bearer | Ringkasan/data tahunan |
| GET | `/api/data/lifetime` | Bearer | Ringkasan lifetime |
| GET | `/api/data/chart` | Bearer | Chart berdasarkan `plantId`, `segment`, dan `date` |
| GET | `/api/data/chart/monthly` | Bearer | Agregasi chart bulanan |
| GET | `/api/data/chart/yearly` | Bearer | Agregasi chart tahunan |

Filter umum telemetry:

- `plantId` atau `deviceId`
- `category`
- `type`/`types`
- `limit`
- `startDate`
- `endDate`
- `date`, `month`, atau `year` sesuai endpoint

Kategori yang umum digunakan adalah `data_bms`, `setting_bms`, `grid`, `out`, `baterai`, dan `pv`.

Contoh:

```http
GET /api/data/?plantId=1&category=grid&type=power&limit=10
Authorization: Bearer <token>
```

```http
GET /api/data/chart?plantId=1&segment=day&date=2026-03-15
Authorization: Bearer <token>
```

## Plant

| Method | Endpoint | Auth | Kegunaan |
|---|---|---|---|
| POST | `/api/plant/create` | Bearer | Membuat plant |
| GET | `/api/plant/` | Bearer | Mengambil plant milik pengguna |
| PUT | `/api/plant/:id` | Bearer | Memperbarui plant |
| DELETE | `/api/plant/:id` | Bearer | Menghapus plant |
| POST | `/api/plant/assign-user` | Bearer | Endpoint legacy untuk menambahkan user |
| POST | `/api/plant/assign-device` | Bearer | Endpoint legacy untuk menambahkan device |
| GET | `/api/plant/:id/access` | Bearer | Daftar akses pengguna |
| POST | `/api/plant/:id/access/search` | Bearer | Mencari pengguna untuk akses plant |
| POST | `/api/plant/:id/access` | Bearer | Menambahkan akses pengguna |
| PATCH | `/api/plant/:id/access/:userId` | Bearer | Mengubah role akses |
| DELETE | `/api/plant/:id/access/:userId` | Bearer | Menghapus akses pengguna |
| POST | `/api/plant/:id/device` | Bearer | Menambahkan device ke plant |
| GET | `/api/plant/:id/devices` | Bearer | Mengambil device plant |
| DELETE | `/api/plant/:id/device/:deviceId` | Bearer | Menghapus device dari plant |

Role akses canonical adalah `owner`, `editor`, dan `viewer`. Alias request lama seperti `can_manage` dan `only_view` tetap diterima.

## MQTT

| Method | Endpoint | Auth | Kegunaan |
|---|---|---|---|
| POST | `/api/mqtt/publish` | Tidak | Mempublikasikan message ke topic MQTT |

Body:

```json
{
  "topic": "app/device/inverter",
  "message": "payload"
}
```

Endpoint MQTT publish dan MockPlant manual dipertahankan tanpa autentikasi agar kontrak lama tidak berubah. Jangan mengekspos keduanya ke internet publik tanpa pembatasan pada reverse proxy atau jaringan.

## Kontrak response

Status HTTP, nama field JSON, pesan error, konversi W/kW, timezone `Asia/Jakarta`, event Socket.IO, dan topic MQTT dipertahankan oleh test karakterisasi di source.
