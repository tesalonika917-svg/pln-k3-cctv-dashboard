# PLN K3 · CCTV Monitoring Dashboard

Dashboard statis (HTML/CSS/JS murni, tanpa build tool) untuk memantau data pekerjaan CCTV
dari Google Sheet — bergaya dashboard admin gelap dengan grafik dan daftar aktivitas.

## Struktur file

```
pln-guard-dashboard/
├── index.html       # struktur halaman
├── style.css         # tema (dark navy, mirip Guard Up)
├── script.js          # logika: baca data, render chart, drawer sumber data
├── apps-script.gs     # kode untuk Google Apps Script (opsional, untuk data live)
└── README.md
```

## Menjalankan di lokal (VS Code)

1. Buka folder ini di VS Code.
2. Install ekstensi **Live Server** (oleh Ritwick Dey).
3. Klik kanan `index.html` → **Open with Live Server**.
4. Dashboard terbuka di browser, misalnya `http://127.0.0.1:5500`.

Tidak perlu `npm install` — semua library (Chart.js, PapaParse, SheetJS) diambil lewat CDN di `index.html`.

## Menghubungkan ke spreadsheet Anda

Klik ikon ⚙ (Settings) di kanan atas dashboard. Ada 3 cara memuat data:

1. **Unggah file** — ekspor sheet ke `.csv`/`.xlsx`, unggah langsung.
2. **Sumber otomatis (live)** — tempel URL CSV publik atau URL Apps Script; dashboard akan menyimpan URL ini (`localStorage`) dan menyegarkan data otomatis setiap 5 menit.
3. **Tempel CSV** — copy-paste isi sheet langsung.

### Opsi live via "Publish to web"
`File → Share → Publish to web` di Google Sheets → pilih sheet & format CSV → salin link `…/pub?output=csv`.

### Opsi live via Apps Script (lebih real-time, tanpa cache)
Lihat langkah lengkap + kode di `apps-script.gs`. Setelah deploy, salin URL yang diakhiri `/exec`.

Kolom yang dikenali otomatis (nama header boleh sedikit berbeda):
`Timestamp`, `Unit UP3`, `Unit ULP`, `Nama Perangkat CCTV`, `Nama Pekerjaan`,
`Lokasi Pekerjaan`, `Petugas Pelaksana di Lapangan`, `Dokumentasi CCTV`, `Deskripsi`.

## Push ke GitHub & deploy (GitHub Pages)

```bash
cd pln-guard-dashboard
git init
git add .
git commit -m "Initial commit: PLN K3 CCTV dashboard"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

Lalu di repo GitHub: **Settings → Pages → Source: `main` branch, folder `/root`** → Save.
Setelah beberapa menit, dashboard bisa diakses di `https://USERNAME.github.io/NAMA-REPO/`.

> Catatan: data yang tersimpan (`localStorage`) bersifat per-browser/per-perangkat.
> Untuk data yang sama di semua pengunjung, gunakan opsi sumber otomatis (live) di atas
> supaya setiap orang yang membuka dashboard menarik data langsung dari spreadsheet.

## Kustomisasi

- Warna & tipografi: `style.css`, variabel di `:root`.
- Kategori pekerjaan & warnanya otomatis diambil dari 6 nilai `Nama Pekerjaan` terbanyak (`CATEGORY_PALETTE` di `script.js`).
- Menu sidebar di `index.html` bagian `<nav class="nav">` — silakan sesuaikan label/tautan.
