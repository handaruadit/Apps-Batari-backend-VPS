# BySense Web & Backend — Architecture & Agent Guardrails

## 1. Single Source of Truth for Plants / Stations & Database Synchronization
- **Lokasi Database Riil**: Database PostgreSQL live yang digunakan adalah **`apidb` di VPS Server (`89.116.33.75:5432`)**. NeonDB sudah **USANG dan DILARANG DIGUNAKAN**. Seluruh data mobile app dan website bersumber dari database PostgreSQL VPS ini.
- **Backend Tunggal**: Backend yang melayani Web dan Mobile adalah satu backend yang sama di `D:\batari-mobile-app\Apps-Batari-backend-VPS`, dideploy di server VPS `/home/batari/batari-mobile-app-backend` (port 3001, PM2 `batari-api`).
- **Data Stasiun Telemetri**: Bersumber langsung dari Deye Cloud API (31 stasiun operasional).
- **Mapping Deye Cloud vs Tabel PostgreSQL `plants`**:
  - Tabel `plants` PostgreSQL memiliki 34 baris. 30 baris di antaranya terhubung dengan stasiun Deye Cloud melalui tabel `deye_integrations` (`plant_id` <-> `station_id`).
  - **DILARANG MENDORONG ULANG STASIUN DATABASE YANG MEMILIKI `deye_station_id` SEBAGAI DUPLIKAT KE DALAM DAFTAR STASIUN WEB**. Penggabungan aditif yang salah akan menyebabkan jumlah stasiun membengkak menjadi 50.
  - Hanya stasiun buatan user kustom (yang tidak memiliki integrasi Deye) yang diizinkan ditambahkan ke daftar stasiun.
  - Jumlah total stasiun standar operasional web adalah **31 stasiun Deye Cloud**.
- **Sinkronisasi CRUD Plant**:
  - Semua operasi CRUD (Create, Read, Update, Delete) harus terhubung langsung ke endpoint `/api/plant` di backend VPS.
  - Saat menghapus plant, frontend harus memanggil `DELETE /api/plant/:id`, memeriksa status HTTP `res.ok`, dan memastikan transaksi database PostgreSQL berhasil menghapus data dari tabel `plants` serta tabel relasi (`user_plants`, `plant_devices`, `device_access_permissions`, `deye_integrations`).

## 2. Aturan Status Stasiun & Integritas Daya
- **Integritas Status Offline**:
  - Deye Cloud menandai inverter terputus dengan `connectionStatus: "ALL_OFFLINE"` atau `connectStatus: 0 / 3`.
  - Beberapa inverter Deye masih mengirim sisa paket telemetri standby (misal: 16 Watt).
  - **DILARANG MENGUBAH STATUS KE ONLINE HANYA KARENA `production > 0` / `pvKw > 0`**. Jika stasiun berstatus `ALL_OFFLINE`, statusnya mutlak `Offline` dan `production` wajib bernilai `0` kW.
- **Konsistensi Tabel vs Detail**:
  - Endpoint `/stations` (tabel) dan `/stations/:stationId` (detail) harus menggunakan logika pemetaan status yang seragam agar indikator status tidak pernah bertolak belakang.

## 3. Grafik Trend Sparkline
- Sumbu X mencakup rentang 24 jam hari ini (00:00–24:00).
- Garis data harus berhenti secara adaptif pada jam saat ini (`currentHour`), tidak boleh ditarik mentok langsung ke ujung kanan (24:00).
- Untuk stasiun non-online (Offline / Incomplete):
  - Hanya menampilkan 1 parameter (garis PV).
  - Tanpa isian gradien/arsir di bawah garis.
  - Jangan gunakan fallback teks `--`; selalu tampilkan garis data atau garis nol adaptif.

## 4. Telemetri Backend & Frontend (Larangan Mutlak Data Dummy / Hardcoded)
- Backend yang dideploy ke VPS beralamat di `D:\batari-mobile-app\Apps-Batari-backend-VPS` (port 3001).
- **LARANGAN KERAS DATA DUMMY / HARDCODED / SINTETIS**:
  - **Larangan Nilai Tiruan & Rumus Buatan**: DILARANG menggunakan nilai statis, rumus sintetis (seperti pengali buatan 2.45 atau nilai estimasi fiktif), data tiruan, atau kurva seragam tiruan pada grafik maupun ringkasan parameter.
  - **Integritas Multi-Inverter**: Setiap inverter fisik di Deye Cloud memiliki nomor seri unik (`deviceSn`) dan data telemetri individual. Dilarang menduplikasi data antar inverter, membagi rata total stasiun secara sintetis, atau menggunakan angka tiruan. Saat beralih antar inverter di dropdown ("Inverter 1", "Inverter 2", dst.), telemetri daya kW dan produksi harian kWh WAJIB mencerminkan data riil masing-masing unit fisik Deye Cloud secara independen.
  - **Otentisitas Menu Kotak Kubus (Device List Cards)**:
    - Kartu perangkat di mobile app maupun web wajib menampilkan metrik performa utama inverter (**Daya Aktif / Active Power kW** dan **Produksi Hari Ini / Daily Yield kWh**) yang bersumber dari pembacaan multi-string sensor live Deye Cloud.
    - Parameter baterai (**Power, Voltage, Current, SoC**) wajib bersumber dari data telemetri riil baterai/BMS Deye Cloud.
    - Pada stasiun bertipe On-Grid (tanpa baterai fisik), parameter baterai di lapangan memang bernilai 0 / null; dilarang mengarang nilai baterai sintetis untuk mengisi kekosongan tersebut.
  - **Sumber Data Tunggal 100% Riil**: Semua parameter telemetri (daya PV, load, grid, baterai, SoC, energi produksi/konsumsi, donut chart, dan grafik kurva) WAJIB bersumber 100% dari data historis riil atau pembacaan sensor live Deye Cloud API / database riil PostgreSQL VPS per stasiun masing-masing.
  - Setiap stasiun harus memiliki kurva grafik unik sesuai telemetri riil masing-masing stasiun, bukan grafik generik yang serupa antar stasiun.
  - Angka kapasitas (capacity kW / kWp) harus selalu diambil dari metadata riil stasiun (`capacity` / `pv_capacity`), bukan fallback statis atau string kosong.

## 5. Larangan Akses Langsung ke VPS (Strict Agent Guardrail)
- **AGENT MUTLAK DILARANG MENYENTUH ATAU MENGAKSES VPS SECARA LANGSUNG**:
  - Dilarang menjalankan SSH (`ssh batari@...`), SCP (`scp ...`), rsync, atau remote execution apapun ke server VPS (`89.116.33.75`).
  - Dilarang merestart PM2, menjalankan perintah database jarak jauh, atau mengubah file secara langsung di dalam server VPS.
  - Agent HANYA diperbolehkan mengubah file di lingkungan lokal dan memberikan dokumentasi serta langkah-langkah terminal yang jelas kepada pengguna (USER) untuk dijalankan secara mandiri.

## 6. Batasan Ketat Perubahan Kode (Strict Scope Boundary — Dilarang "Ngide" Tanpa Instruksi)
- **DILARANG MENGUBAH / MENAMBAHKAN KODE ATAU FITUR DI LUAR INSTRUKSI EKSPLISIT USER**:
  - Agent TIDAK BOLEH berinisiatif sendiri ("ngide") mengubah konfigurasi, durasi/timer animasi (seperti splash screen, transisi UI), alur kerja navigasi, atau menambahkan kode/fitur yang tidak secara tegas diperintahkan oleh pengguna.
  - Modifikasi kode harus dibatasi secara ketat HANYA pada bagian yang diminta atau dibutuhkan langsung untuk menyelesaikan masalah spesifik yang diadukan pengguna.
  - Jika agent menemukan potensi optimasi atau ide perbaikan di luar lingkup yang diminta, agent WAJIB menanyakannya atau memberikan rekomendasi secara tertulis terlebih dahulu, BUKAN langsung mengubah kode tanpa persetujuan eksplisit dari pengguna.

## 7. Prinsip Integrasi Multi-Brand & Standar Baku BySense (The Canonical Standard)
- **BySense Sebagai Standar Utama Tunggal (*The Single Canonical Model*)**:
  - Seluruh integrasi perangkat, baik yang sudah berjalan (**Deye Cloud**) maupun yang akan ditambahkan ke depan (**DessMonitor / SmartESS / Eybond / ShineMonitor** atau penyedia inverter lain):
    - **WAJIB TUNDUK DAN MENYESUAIKAN 100% PADA FORMAT & STANDAR BAKU BYSENSE**.
    - **DILARANG MENGUBAH, MERUBAH TAMPILAN, ATAU MENAMBAHKAN ELEMEN BARU DI FRONTEND HANYA KARENA FORMAT VENDOR PIHAK KETIGA BERBEDA**.
    - Bukan BySense yang mengikuti Deye atau SmartESS, melainkan **Deye dan SmartESS yang wajib dinormalisasi mengikuti BySense**.
- **Penerapan Adapter Pattern di Backend**:
  - Modul integrasi vendor baru (seperti `src/integrations/dessmonitor`) hanya bertindak sebagai adapter di lapisan backend.
  - Adapter bertugas menerjemahkan *payload* mentah vendor pihak ketiga menjadi entitas resmi BySense:
    - Status baku: `Online` (Hijau), `Incomplete` (Amber), `Offline` (Merah, daya 0 kW), `Alerts` (Oranye).
    - Metrik daya: `pvKw` (kW), `dailyYield` (kWh), `totalYield` (kWh), `batteryPower` (W), `batterySoc` (%), `gridPower` (W), `loadPower` (W).
    - Format kurva diurnal: Array titik 24 jam `{ hour, value }` yang disajikan melalui endpoint seragam `/api/data/chart?plantId=...`.
- **Integritas Pengalaman Pengguna (Zero Frontend Disruption)**:
  - Antarmuka Frontend (Web dan Mobile), struktur kartu stasiun, grafik MiniSparkline, kurva Dual-Axis, peta geografis, hingga detail inverter di kartu kubus tetap berjalan identik dan seragam untuk semua stasiun tanpa peduli merk inverter fisiknya.
- **Validasi Kelengkapan Parameter SmartESS / DessMonitor (100% Coverage Verified)**:
  - Seluruh parameter yang dibutuhkan oleh ekosistem BySense telah diverifikasi **TERSEDIA LENGKAP 100%** di API SmartESS / DessMonitor (`webQueryDeviceEs` & `queryDeviceLastData`):
    1. **Metrik Utama Pembangkit**:
       - `pvKw` / `production` (kW) $\leftarrow$ SmartESS `outpower` (kW) / `solar_power` (W / 1000)
       - `dailyYield` / `dailyEnergy` (kWh) $\leftarrow$ SmartESS `energyToday` (kWh)
       - `totalYield` / `totalEnergy` (kWh) $\leftarrow$ SmartESS `energyTotal` (kWh)
       - `status` (`Online` / `Offline`) $\leftarrow$ SmartESS `status` (1 = Online, 0 = Offline dengan daya mutlak 0 kW)
    2. **Parameter Baterai & BMS (Kartu Kubus Perangkat)**:
       - `batteryVoltage` (V) $\leftarrow$ SmartESS `battery_voltage` (V)
       - `batteryCurrent` (A) $\leftarrow$ SmartESS `battery_current` (A)
       - `batteryPower` (kW) $\leftarrow$ SmartESS `battery_power` (W / 1000)
       - `batterySoc` (%) $\leftarrow$ SmartESS `battery_soc` (%)
    3. **Aliran Energi & Donut Chart (*Energy Flow*)**:
       - Solar Generation $\leftarrow$ SmartESS `solar_power` (kW)
       - Konsumsi Beban (*Load*) $\leftarrow$ SmartESS `output_power` / `load_power` (kW)
       - Jaringan Listrik (*Grid*) $\leftarrow$ SmartESS `grid_power` (kW)
       - Baterai $\leftarrow$ SmartESS `battery_power` (kW) & `battery_soc` (%)
    4. **Kurva Historis 24 Jam**:
       - Titik telemetri periodik SmartESS disimpan dan diagregasi oleh backend ke array 24 jam `{ hour, value }` pada endpoint seragam `/api/data/chart?plantId=...`.

## 10. Standar & Alur Integrasi SmartESS / DessMonitor Cloud (Multi-Brand Auto-Sync)
- **Skema Akun Induk & Hak Akses View-Only**:
  - Akun sentral BySense (`idewanyomanbayusw@gmail.com`) bertindak sebagai akun induk penampung (*master collector account*) di DessMonitor (`www.dessmonitor.com`) / SmartESS.
  - Seluruh pemilik pembangkit (*plant owner*) menambahkan atau membagikan izin stasiun (*share plant*) ke akun sentral ini dengan tingkat akses **View-Only** (hanya pemantauan), identik dengan arsitektur integrasi Deye Cloud.
- **Siklus CRUD & Sinkronisasi Otomatis Terpadu**:
  - **CREATE (Pembangkit Baru)**: Begitu stasiun baru dibagikan oleh owner di DessMonitor, siklus audit berkala backend BySense otomatis mendeteksi stasiun baru, menyimpannya ke tabel PostgreSQL `plants` di VPS (`apidb`), dan mengaitkan hak kepemilikan utama (*Primary Owner*) ke akun Super Admin (`idewanyomanbayusw@gmail.com` dan `admin@batarienergy.com`) di tabel `user_plants`.
  - **READ (Telemetri Real-Time)**: Telemetri daya live (`pvKw`, `dailyYield`, `totalYield`, `batterySoc`, `gridPower`, `loadPower`) dan status (`Online`, `Incomplete`, `Offline` mutlak 0 kW, `Alerts`) ditarik berkala melalui DessMonitor REST API (`queryDeviceList`, `queryDeviceLastData`, `webQueryDeviceEs`) dengan autentikasi berbasis token dan hashing tanda tangan SHA-1 (`sign`).
  - **UPDATE (Pembaruan Metadata)**: Modifikasi nama atau kapasitas pembangkit di DessMonitor otomatis terkalibrasi ke database PostgreSQL BySense.
  - **DELETE / UNLINK (Stasiun Dicabut/Dihapus)**: Jika stasiun dicabut atau dihapus oleh owner, sistem otomatis menerapkan mekanisme *Soft Deactivation* (`enabled = false`), sehingga stasiun otomatis hilang dari tampilan web/mobile dengan aman tanpa merusak riwayat data historis.
- **Arsitektur Modul Adapter Backend (`src/integrations/dessmonitor/`)**:
  - `dessmonitor.client.js`: Autentikasi dan pembaruan token otomatis dengan DessMonitor API (`https://api.dessmonitor.com/public/`, action `authSource`, `company_key = bnrl_frRFjEz8Mkn`, SHA-1 signature hashing).
  - `dessmonitor.service.js`: Pemanggilan `listStations()` dan `getDeviceLatest(deviceSn)`.
  - `dessmonitor.mapper.js`: Normalisasi respons payload vendor ke standar baku BySense (The Canonical Standard).
  - Jembatan audit di `plantAuditSync.service.js` menghubungkan data DessMonitor ke database PostgreSQL live `apidb` di VPS.
- **Kondisi Lanjutan (Trigger Pengerjaan Integrasi)**:
  - Implementasi teknis integrasi adapter DessMonitor akan langsung dieksekusi begitu pengguna mengonfirmasi bahwa seluruh stasiun dari akun owner telah selesai dibagikan (*view-only*) ke akun `idewanyomanbayusw@gmail.com`.



