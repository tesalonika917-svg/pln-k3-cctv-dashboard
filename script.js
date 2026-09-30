/* =========================================================
   KONFIGURASI
========================================================= */

const DEFAULT_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWRM7E3rtMsJVWf9z1cntdblP4nSP9p0QCC6DeEbVt_3MHbjicUDgP2AsgLPV-NaNAYH3YZfDwFXhI/pub?output=csv";

const STORAGE_URL = "cctv_uid_sstb_csv_url";

/* Google Apps Script Web App (simpan hasil EDIT ke Spreadsheet) */
const DEFAULT_API_URL =
    "https://script.google.com/macros/s/AKfycbz-zrsdF8UnVFVfn_k8pbLFR-uB4r6zmnI66H03MXRI8afCdLkbw1GxMOUAxIR7mimY/exec";

/*
 * Bulan yang dicetak rinciannya per hari di Console (F12)
 * untuk membantu memeriksa angka pada grafik "Pekerjaan per Bulan".
 * Format "yyyy-mm". Isi "" untuk mematikan.
 */
const DEBUG_MONTH = "2026-08";


/* =========================================================
   VARIABEL GLOBAL
========================================================= */

let DATA = [];
let currentEditingRow = null;
let charts = {};
let isSavingEdit = false;
let currentPdfBlobUrl = null;

/* totalUnit tetap/manual (61); totalCctv dari tab "MONITORING CCTV" */
let CCTV_SUMMARY = {
    totalCctv: 0,
    totalUnit: 61
};


/* =========================================================
   HELPER
========================================================= */

function $(id) {
    return document.getElementById(id);
}

function getValue(row, key) {

    if (!row) {
        return "";
    }

    if (row[key] !== undefined && row[key] !== null) {
        return String(row[key]).trim();
    }

    return "";
}

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/*
 * Normalisasi teks HANYA untuk perbandingan (mis. nama ULP):
 * spasi ganda, spasi tersembunyi, dan beda huruf besar/kecil
 * dianggap sama.
 */
function normalizeKey(value) {

    return String(value ?? "")
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/* Kunci yyyy-mm dari sebuah Date */
function monthKeyOf(date) {

    return (
        date.getFullYear() +
        "-" +
        String(date.getMonth() + 1).padStart(2, "0")
    );
}


/* =========================================================
   HAPUS BARIS DUPLIKAT

   Baris dianggap duplikat kalau semua field sama DAN waktunya
   sama sampai satuan MENIT. Google Form yang terkirim dua kali
   biasanya hanya berbeda beberapa detik, jadi dulu (dengan
   pembanding sampai detik) duplikat seperti ini lolos dan ikut
   menambah angka di semua grafik, termasuk "Pekerjaan per Bulan".
========================================================= */

function dedupeExactDuplicateRows(rows) {

    const seenKeys = new Set();

    return rows.filter(function (row) {

        const d = row.dateObject;

        const timeKey = d
            ? d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() +
              "-" + d.getHours() + "-" + d.getMinutes()
            : normalizeKey(row.timestamp);

        const key = [
            timeKey,
            normalizeKey(row.up3),
            normalizeKey(row.ulp),
            normalizeKey(row.device),
            normalizeKey(row.job),
            normalizeKey(row.location),
            normalizeKey(row.officer)
        ].join("|");

        if (seenKeys.has(key)) {
            return false;
        }

        seenKeys.add(key);

        return true;
    });
}


/* =========================================================
   TANGGAL
========================================================= */

function parseDate(value) {

    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    const text = String(value).trim();

    if (!text) {
        return null;
    }

    /*
     * Format Indonesia dd/mm/yyyy [hh:mm[:ss]] dicek LEBIH DULU,
     * supaya tidak salah dibaca sebagai mm/dd/yyyy oleh new Date().
     */
    const match = text.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (match) {

        const parsedDate = new Date(
            Number(match[3]),
            Number(match[2]) - 1,
            Number(match[1]),
            Number(match[4] || 0),
            Number(match[5] || 0),
            Number(match[6] || 0)
        );

        if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
        }
    }

    /* Fallback untuk format tidak ambigu (mis. ISO) */
    const date = new Date(text);

    if (!isNaN(date.getTime())) {
        return date;
    }

    return null;
}

function formatDateTime(date) {

    if (!date) {
        return "-";
    }

    const d = date instanceof Date ? date : parseDate(date);

    if (!d || isNaN(d.getTime())) {
        return String(date);
    }

    const p = function (n) {
        return String(n).padStart(2, "0");
    };

    return (
        `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ` +
        `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
}

function formatDateOnly(date) {

    if (!date) {
        return "-";
    }

    const d = date instanceof Date ? date : parseDate(date);

    if (!d || isNaN(d.getTime())) {
        return "-";
    }

    const p = function (n) {
        return String(n).padStart(2, "0");
    };

    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDateForInput(value) {

    if (!value) {
        return "";
    }

    const date = parseDate(value);

    if (!date) {
        return "";
    }

    const p = function (n) {
        return String(n).padStart(2, "0");
    };

    return (
        `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
        `T${p(date.getHours())}:${p(date.getMinutes())}`
    );
}


/* =========================================================
   NORMALISASI DATA
========================================================= */

function normalizeRow(row) {

    const timestamp = getValue(row, "Timestamp");
    const dateObject = parseDate(timestamp);

    return {

        original: row,

        rowNumber: Number(row._row || row._rowNumber || 0),

        timestamp,

        dateObject,

        dateText: formatDateTime(dateObject),

        dateOnly: formatDateOnly(dateObject),

        up3: getValue(row, "Unit UP3"),

        ulp: getValue(row, "Unit ULP"),

        device: getValue(row, "NAMA PERANGKAT CCTV"),

        job: getValue(row, "Nama Pekerjaan"),

        location: getValue(row, "Lokasi Pekerjaan"),

        officer: getValue(row, "Petugas Pelaksana di Lapangan"),

        documentation: getValue(row, "Dokumentasi CCTV"),

        /* DATA POPUP */

        description: getValue(row, "Deskripsi Temuan (Jika Ada)"),

        findingTime: getValue(row, "Waktu Temuan"),

        findingDocumentation: getValue(row, "Dokumentasi Temuan"),

        followUp: getValue(row, "Tindak Lanjut (Tegur online, CMC, dsb)"),

        information: getValue(row, "Keterangan")
    };
}


/* =========================================================
   LOAD DATA DARI GOOGLE SHEETS CSV
========================================================= */

async function loadFromURL(url) {

    try {

        console.log("Memuat data dari:", url);

        if (typeof Papa === "undefined") {
            throw new Error("PapaParse tidak ditemukan.");
        }

        const response = await fetch(url, { cache: "no-store" });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const csvText = await response.text();

        const parsed = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: function (header) {
                return String(header).trim();
            }
        });

        console.log("Jumlah baris CSV:", parsed.data.length);

        if (parsed.errors && parsed.errors.length) {
            console.warn("Peringatan CSV:", parsed.errors);
        }

        const rows = parsed.data || [];

        /* Header = baris 1, data pertama = baris 2 */
        DATA = rows
            .map(function (row, index) {
                row._row = index + 2;
                return normalizeRow(row);
            })
            .filter(function (row) {
                return (
                    row.timestamp ||
                    row.up3 ||
                    row.ulp ||
                    row.device ||
                    row.job ||
                    row.location ||
                    row.officer
                );
            });

        const rowsBefore = DATA.length;

        DATA = dedupeExactDuplicateRows(DATA);

        console.log(
            "Baris sebelum dedupe:", rowsBefore,
            "| sesudah:", DATA.length,
            "| duplikat dibuang:", rowsBefore - DATA.length
        );

        logMonthlyDiagnostics();

        localStorage.setItem(STORAGE_URL, url);

        renderDashboard();
        renderMonitoring();
        renderLaporan();
        renderCharts();

        updateConnectionStatus(true);

        return true;

    } catch (error) {

        console.error("Gagal memuat data:", error);

        updateConnectionStatus(false);

        const tbody = $("laporanTable");

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align:center; padding:30px; color:#dc2626;">
                        Data gagal dimuat.
                        <br><br>
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }

        return false;
    }
}

/* Diagnosis angka per bulan / per hari di Console (F12) */
function logMonthlyDiagnostics() {

    const perMonth = {};
    const perDay = {};

    DATA.forEach(function (row) {

        if (!row.dateObject) {
            return;
        }

        const mk = monthKeyOf(row.dateObject);

        perMonth[mk] = (perMonth[mk] || 0) + 1;

        if (DEBUG_MONTH && mk === DEBUG_MONTH) {
            perDay[row.dateOnly] = (perDay[row.dateOnly] || 0) + 1;
        }
    });

    console.log("Jumlah laporan per bulan:");
    console.table(perMonth);

    if (DEBUG_MONTH) {
        console.log("Rincian per hari untuk bulan " + DEBUG_MONTH + ":");
        console.table(perDay);
    }
}


/* =========================================================
   RINGKASAN CCTV DARI TAB "MONITORING CCTV" (Apps Script)
========================================================= */

async function loadCctvSummary() {

    try {

        const response = await fetch(DEFAULT_API_URL, { cache: "no-store" });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const result = JSON.parse(await response.text());

        if (result && result.cctvSummary) {

            CCTV_SUMMARY.totalUnit =
                Number(result.cctvSummary.totalUnit) || 61;

            if (result.cctvSummary.success) {

                CCTV_SUMMARY.totalCctv =
                    Number(result.cctvSummary.totalCctv) || 0;

            } else {

                console.error(
                    "Gagal menghitung Total CCTV:",
                    result.cctvSummary.message,
                    "\nKolom yang tersedia di tab MONITORING CCTV:",
                    result.cctvSummary.availableHeaders
                );
            }

        } else {

            console.warn(
                "Ringkasan CCTV tidak tersedia. Cek URL Apps Script " +
                "(DEFAULT_API_URL) dan versi deployment-nya.",
                result
            );
        }

        renderDashboard();

    } catch (error) {

        console.warn("Gagal memuat ringkasan CCTV:", error);
    }
}


/* =========================================================
   URUTKAN DATA TERBARU LEBIH DULU
========================================================= */

function getSortedByDateDesc(rows) {

    return [...rows].sort(function (a, b) {

        const dateA = a.dateObject ? a.dateObject.getTime() : 0;
        const dateB = b.dateObject ? b.dateObject.getTime() : 0;

        return dateB - dateA;
    });
}


/* =========================================================
   TABEL DATA LAPORAN
========================================================= */

function buildLaporanRowHTML(row, index) {

    const docLink = row.documentation
        ? `<a href="${escapeAttribute(row.documentation)}"
              target="_blank" rel="noopener noreferrer">Lihat</a>`
        : "-";

    return `
        <td>${index + 1}</td>
        <td>${escapeHTML(row.dateText || "-")}</td>
        <td>${escapeHTML(row.up3 || "-")}</td>
        <td>${escapeHTML(row.ulp || "-")}</td>
        <td>${escapeHTML(row.device || "-")}</td>
        <td>${escapeHTML(row.job || "-")}</td>
        <td>${escapeHTML(row.location || "-")}</td>
        <td>${escapeHTML(row.officer || "-")}</td>
        <td>${docLink}</td>
        <td>
            <div class="aksi-btn-group">
                <button type="button" class="action-btn"
                        onclick="openEditModal(${row.rowNumber})">
                    ✎ Edit
                </button>
                <button type="button" class="action-btn action-btn-pdf"
                        onclick="openUlpPdfModal(${row.rowNumber})">
                    📄 PDF ULP
                </button>
            </div>
        </td>
    `;
}

function renderLaporan(rows, emptyMessage) {

    const tbody = $("laporanTable");

    if (!tbody) {
        console.error("Element #laporanTable tidak ditemukan.");
        return;
    }

    const source = rows || DATA;

    tbody.innerHTML = "";

    if (!source.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center; padding:30px;">
                    ${escapeHTML(emptyMessage || "Tidak ada data laporan.")}
                </td>
            </tr>
        `;

        updateResultCount(0);

        return;
    }

    const sortedData = getSortedByDateDesc(source);

    sortedData.forEach(function (row, index) {

        const tr = document.createElement("tr");

        tr.innerHTML = buildLaporanRowHTML(row, index);

        tbody.appendChild(tr);
    });

    updateResultCount(sortedData.length);
}

function renderFilteredLaporan(filteredRows) {

    renderLaporan(filteredRows, "Data tidak ditemukan.");
}

function updateResultCount(count) {

    document
        .querySelectorAll(".result-count")
        .forEach(function (element) {
            element.textContent = count + " data";
        });
}


/* =========================================================
   MONITORING HARIAN
========================================================= */

function buildMonitoringRowHTML(row, index) {

    return `
        <td>${index + 1}</td>
        <td>${escapeHTML(row.dateText || "-")}</td>
        <td>${escapeHTML(row.up3 || "-")}</td>
        <td>${escapeHTML(row.ulp || "-")}</td>
        <td>${escapeHTML(row.device || "-")}</td>
        <td>${escapeHTML(row.job || "-")}</td>
        <td>${escapeHTML(row.location || "-")}</td>
        <td>${escapeHTML(row.officer || "-")}</td>
    `;
}

function renderMonitoring(rows) {

    const tbody = $("monitoringTable");

    if (!tbody) {
        return;
    }

    const source = rows || DATA;

    tbody.innerHTML = "";

    if (!source.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:30px;">
                    Tidak ada data.
                </td>
            </tr>
        `;

        return;
    }

    getSortedByDateDesc(source).forEach(function (row, index) {

        const tr = document.createElement("tr");

        tr.innerHTML = buildMonitoringRowHTML(row, index);

        tbody.appendChild(tr);
    });
}


/* =========================================================
   DASHBOARD
========================================================= */

function setText(id, value) {

    const el = $(id);

    if (el) {
        el.textContent = value;
    }
}

function renderDashboard() {

    setText("totalData", DATA.length);

    /* -----------------------------------------
       DATA HARI INI
    ----------------------------------------- */

    const today = formatDateOnly(new Date());

    const todayRows = DATA.filter(function (row) {
        return row.dateOnly === today;
    });

    setText("todayData", todayRows.length);

    setText("totalCctv", CCTV_SUMMARY.totalCctv);

    setText("totalUnit", CCTV_SUMMARY.totalUnit);

    /* -----------------------------------------
       CCTV ON / OFF

       ON  = jumlah ULP UNIK yang melapor HARI INI
             (1 ULP tetap dihitung 1 walau lapor berkali-kali).
       OFF = Total CCTV - ON.
    ----------------------------------------- */

    const uniqueReportedUlpToday = new Set(
        todayRows
            .map(function (row) {
                return normalizeKey(row.ulp);
            })
            .filter(Boolean)
    );

    const cctvOnCount = uniqueReportedUlpToday.size;

    const cctvOffCount = Math.max(
        0,
        CCTV_SUMMARY.totalCctv - cctvOnCount
    );

    setText("cctvOn", cctvOnCount);

    setText("cctvOff", cctvOffCount);

    setText("dataActive", DATA.length);

    /* -----------------------------------------
       AKTIVITAS TERBARU
    ----------------------------------------- */

    const recentList = $("recentList");

    if (!recentList) {
        return;
    }

    const latest = getSortedByDateDesc(DATA).slice(0, 5);

    if (!latest.length) {

        recentList.innerHTML = `
            <div style="padding:20px 0; color:var(--muted); font-size:12px;">
                Belum ada aktivitas.
            </div>
        `;

        return;
    }

    recentList.innerHTML = latest
        .map(function (row) {

            return `
                <div class="activity-item">
                    <div class="activity-time">
                        ${escapeHTML(row.dateText || "-")}
                    </div>
                    <div class="activity-main">
                        <strong>${escapeHTML(row.job || "-")}</strong>
                        <span>${escapeHTML(row.device || "-")}</span>
                    </div>
                    <div class="activity-location">
                        ${escapeHTML(row.location || "-")}
                    </div>
                </div>
            `;
        })
        .join("");
}


/* =========================================================
   POPUP EDIT
========================================================= */

function openEditModal(rowNumber) {

    const row = DATA.find(function (item) {
        return Number(item.rowNumber) === Number(rowNumber);
    });

    if (!row) {
        alert("Data tidak ditemukan.");
        return;
    }

    currentEditingRow = row;

    const setValue = function (id, value) {

        const el = $(id);

        if (el) {
            el.value = value;
        }
    };

    setValue("editRowNumber", row.rowNumber || "");

    setText("editJob", row.job || "-");

    setText("editLocation", row.location || "-");

    setValue("editDescription", row.description || "");

    setValue("editFindingTime", formatDateForInput(row.findingTime));

    setValue("editFindingDocumentation", row.findingDocumentation || "");

    /* -----------------------------------------
       TINDAK LANJUT

       Kalau nilai lama tidak ada di daftar pilihan,
       tambahkan sementara agar tidak hilang.
    ----------------------------------------- */

    const editFollowUp = $("editFollowUp");

    if (editFollowUp) {

        const currentValue = row.followUp || "";

        const exists = Array.from(editFollowUp.options).some(
            function (option) {
                return option.value === currentValue;
            }
        );

        if (currentValue && !exists) {

            const option = document.createElement("option");

            option.value = currentValue;
            option.textContent = currentValue;

            editFollowUp.appendChild(option);
        }

        editFollowUp.value = currentValue;
    }

    setValue("editInformation", row.information || "");

    const modal = $("editModal");

    if (modal) {
        modal.classList.add("active");
    }
}

function closeEditModal() {

    const modal = $("editModal");

    if (modal) {
        modal.classList.remove("active");
    }

    currentEditingRow = null;
}

function applyEditSavedLocally(
    description,
    findingTime,
    findingDocumentation,
    followUp,
    information
) {

    currentEditingRow.description = description;
    currentEditingRow.findingTime = findingTime;
    currentEditingRow.findingDocumentation = findingDocumentation;
    currentEditingRow.followUp = followUp;
    currentEditingRow.information = information;

    if (currentEditingRow.original) {

        const o = currentEditingRow.original;

        o["Deskripsi Temuan (Jika Ada)"] = description;
        o["Waktu Temuan"] = findingTime;
        o["Dokumentasi Temuan"] = findingDocumentation;
        o["Tindak Lanjut (Tegur online, CMC, dsb)"] = followUp;
        o["Keterangan"] = information;
    }

    closeEditModal();

    renderLaporan();

    renderDashboard();
}


/* =========================================================
   VERIFIKASI ULANG KE SPREADSHEET

   Balasan Apps Script kadang gagal terbaca padahal data sudah
   tersimpan. Fungsi ini membaca ulang spreadsheet (doGet) dan
   membandingkan baris terkait dengan data yang dikirim.
========================================================= */

async function verifyEditSaved(rowNumber, expectedData) {

    try {

        const response = await fetch(DEFAULT_API_URL, { cache: "no-store" });

        if (!response.ok) {
            return false;
        }

        let result;

        try {
            result = JSON.parse(await response.text());
        } catch (parseError) {
            return false;
        }

        if (!result || !result.success || !Array.isArray(result.rows)) {
            return false;
        }

        const row = result.rows.find(function (item) {
            return Number(item._row) === Number(rowNumber);
        });

        if (!row) {
            return false;
        }

        return Object.keys(expectedData).every(function (key) {

            const actual =
                row[key] !== undefined ? String(row[key]).trim() : "";

            const expected = String(expectedData[key] || "").trim();

            return actual === expected;
        });

    } catch (error) {

        return false;
    }
}


/* =========================================================
   SIMPAN EDIT KE GOOGLE SHEETS
========================================================= */

async function saveEdit(event) {

    event.preventDefault();

    /* Cegah klik ganda */
    if (isSavingEdit) {
        return;
    }

    if (!currentEditingRow) {
        alert("Data yang diedit tidak ditemukan.");
        return;
    }

    const readValue = function (id, trim) {

        const el = $(id);

        if (!el) {
            return "";
        }

        return trim ? el.value.trim() : el.value;
    };

    const description = readValue("editDescription", true);
    const findingTime = readValue("editFindingTime", false);
    const findingDocumentation = readValue("editFindingDocumentation", true);
    const followUp = readValue("editFollowUp", false);
    const information = readValue("editInformation", true);

    const rowNumber = Number(currentEditingRow.rowNumber);

    if (!rowNumber || rowNumber < 2) {
        alert("Nomor baris Spreadsheet tidak valid.");
        return;
    }

    if (!DEFAULT_API_URL) {
        alert("URL Google Apps Script belum diatur.");
        return;
    }

    const payload = {

        row: rowNumber,

        data: {
            "Deskripsi Temuan (Jika Ada)": description,
            "Waktu Temuan": findingTime,
            "Dokumentasi Temuan": findingDocumentation,
            "Tindak Lanjut (Tegur online, CMC, dsb)": followUp,
            "Keterangan": information
        }
    };

    console.log("Mengirim data ke Apps Script:", payload);

    const saveButton = $("saveEditBtn");

    const oldButtonText = saveButton ? saveButton.textContent : "";

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Menyimpan...";
    }

    isSavingEdit = true;

    try {

        /* text/plain agar tidak memicu CORS preflight */
        const response = await fetch(DEFAULT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();

        console.log("Response Apps Script:", responseText);

        let result;

        try {
            result = JSON.parse(responseText);
        } catch (jsonError) {
            console.error("Response bukan JSON:", responseText);
            throw new Error("Response dari Google Apps Script tidak valid.");
        }

        if (!result.success) {
            throw new Error(result.message || "Data gagal disimpan.");
        }

        applyEditSavedLocally(
            description,
            findingTime,
            findingDocumentation,
            followUp,
            information
        );

        alert("Data berhasil disimpan ke Google Spreadsheet.");

    } catch (error) {

        console.error("Gagal menyimpan data:", error);

        /* Verifikasi ulang sebelum menyerah */
        const reallySaved = await verifyEditSaved(rowNumber, payload.data);

        if (reallySaved) {

            applyEditSavedLocally(
                description,
                findingTime,
                findingDocumentation,
                followUp,
                information
            );

            alert("Data berhasil disimpan ke Google Spreadsheet.");

        } else {

            alert(
                "Data gagal disimpan ke Google Spreadsheet.\n\n" +
                error.message +
                "\n\n" +
                "Periksa deployment Google Apps Script dan URL /exec."
            );
        }

    } finally {

        isSavingEdit = false;

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = oldButtonText || "Simpan";
        }
    }
}


/* =========================================================
   STATUS KONEKSI
========================================================= */

function updateConnectionStatus(connected) {

    const status = $("dataStatus");

    if (!status) {
        return;
    }

    if (connected) {
        status.textContent = "Data Terhubung";
        status.style.color = "";
    } else {
        status.textContent = "Data Tidak Terhubung";
    }
}


/* =========================================================
   SEARCH DATA
========================================================= */

function searchData(keyword) {

    const text = String(keyword || "").toLowerCase().trim();

    if (!text) {
        renderLaporan();
        return;
    }

    const filtered = DATA.filter(function (row) {

        const searchable = [
            row.dateText,
            row.up3,
            row.ulp,
            row.device,
            row.job,
            row.location,
            row.officer,
            row.documentation,
            row.description,
            row.findingTime,
            row.findingDocumentation,
            row.followUp,
            row.information
        ]
            .join(" ")
            .toLowerCase();

        return searchable.includes(text);
    });

    renderFilteredLaporan(filtered);
}


/* =========================================================
   NAVIGATION
========================================================= */

function showView(viewName) {

    document.querySelectorAll(".view").forEach(function (view) {
        view.classList.remove("active");
    });

    const target = $("view-" + viewName);

    if (target) {
        target.classList.add("active");
    }

    document.querySelectorAll(".nav-link").forEach(function (link) {

        link.classList.remove("active");

        if (link.dataset.view === viewName) {
            link.classList.add("active");
        }
    });

    const topbarTitle = document.querySelector(".topbar-title");

    if (topbarTitle) {

        const titles = {
            dashboard: "Dashboard",
            monitoring: "Monitoring Harian",
            laporan: "Data Laporan",
            grafik: "Visualisasi Grafik",
            panduan: "Panduan"
        };

        topbarTitle.textContent = titles[viewName] || "Dashboard";
    }
}


/* =========================================================
   THEME
========================================================= */

function loadTheme() {

    if (localStorage.getItem("cctv_theme") === "dark") {
        document.body.classList.add("dark");
    }
}

function toggleTheme() {

    document.body.classList.toggle("dark");

    localStorage.setItem(
        "cctv_theme",
        document.body.classList.contains("dark") ? "dark" : "light"
    );
}


/* =========================================================
   FILTER GRAFIK — BULAN TERSEDIA
========================================================= */

function getAvailableMonths() {

    const months = new Set();

    DATA.forEach(function (row) {

        if (row.dateObject) {
            months.add(monthKeyOf(row.dateObject));
        }
    });

    return Array.from(months).sort();
}

function getLatestAvailableMonth() {

    const months = getAvailableMonths();

    return months[months.length - 1] || "";
}

function setupChartFilters() {

    const availableMonths = getAvailableMonths();

    if (!availableMonths.length) {
        return;
    }

    const minMonth = availableMonths[0];
    const maxMonth = availableMonths[availableMonths.length - 1];

    /* Pekerjaan per Hari */

    const dailyMonthInput = $("dailyChartMonth");

    if (dailyMonthInput) {

        dailyMonthInput.min = minMonth;
        dailyMonthInput.max = maxMonth;

        if (
            !dailyMonthInput.value ||
            !availableMonths.includes(dailyMonthInput.value)
        ) {
            dailyMonthInput.value = maxMonth;
        }
    }

    /* Pekerjaan per Bulan */

    const fromInput = $("monthlyChartFrom");
    const toInput = $("monthlyChartTo");

    if (fromInput) {

        fromInput.min = minMonth;
        fromInput.max = maxMonth;

        if (
            !fromInput.value ||
            fromInput.value < minMonth ||
            fromInput.value > maxMonth
        ) {
            fromInput.value = minMonth;
        }
    }

    if (toInput) {

        toInput.min = minMonth;
        toInput.max = maxMonth;

        if (
            !toInput.value ||
            toInput.value < minMonth ||
            toInput.value > maxMonth
        ) {
            toInput.value = maxMonth;
        }
    }
}


/* =========================================================
   PALET WARNA DONAT UP3
========================================================= */

const UP3_BASE_COLORS = [
    "#0F62B5", // biru PLN
    "#F97316", // oranye
    "#16A34A", // hijau
    "#DC2626", // merah
    "#7C3AED", // ungu
    "#0D9488", // teal
    "#EAB308", // kuning
    "#DB2777", // pink
    "#2563EB", // biru muda
    "#65A30D", // hijau lime
    "#9333EA", // ungu terang
    "#EA580C"  // oranye tua
];

function getUp3ColorPalette(count) {

    const palette = [];

    for (let i = 0; i < count; i++) {

        if (i < UP3_BASE_COLORS.length) {
            palette.push(UP3_BASE_COLORS[i]);
        } else {
            palette.push(`hsl(${(i * 47) % 360}, 68%, 52%)`);
        }
    }

    return palette;
}


/* =========================================================
   REKAP PEKERJAAN PER UP3 (DAFTAR, 2 KOLOM KIRI-KANAN)

   Susunan 2 kolom diatur oleh CSS (.up3-recap-list).
========================================================= */

function renderUp3RecapList(elementId, labels, values, colors) {

    const container = $(elementId);

    if (!container) {
        return;
    }

    if (!labels.length) {

        container.innerHTML = `
            <div style="padding:10px 6px; color:var(--muted); font-size:12px;">
                Belum ada data UP3.
            </div>
        `;

        return;
    }

    /* Urutkan dari pekerjaan terbanyak */
    const combined = labels
        .map(function (label, index) {
            return {
                label: label,
                value: values[index] || 0,
                color: colors[index]
            };
        })
        .sort(function (a, b) {
            return b.value - a.value;
        });

    const totalPekerjaan = combined.reduce(function (sum, item) {
        return sum + item.value;
    }, 0);

    const totalRowHTML = `
        <div class="up3-recap-total">
            <span>Total Pekerjaan (${combined.length} UP3)</span>
            <strong>${totalPekerjaan}</strong>
        </div>
    `;

    const rowsHTML = combined
        .map(function (item) {

            return `
                <div class="up3-recap-row">
                    <span class="up3-recap-dot"
                          style="background:${item.color};"></span>
                    <span class="up3-recap-name">
                        ${escapeHTML(item.label)}
                    </span>
                    <span class="up3-recap-count">${item.value}</span>
                </div>
            `;
        })
        .join("");

    container.innerHTML = totalRowHTML + rowsHTML;
}


/* =========================================================
   GRAFIK
========================================================= */

function renderCharts() {

    if (typeof Chart === "undefined") {
        console.warn("Chart.js tidak ditemukan.");
        return;
    }

    setupChartFilters();

    renderDailyChart();
    renderMonthlyChart();
    renderUnitChart();
    renderUp3Chart();
    renderDeviceChart();
    renderDashboardUnitChart();
    renderDashboardUp3Chart();
}

/* Hitung jumlah baris per nilai field */
function countByField(field, fallback) {

    const counts = {};

    DATA.forEach(function (row) {

        const key = row[field] || fallback;

        counts[key] = (counts[key] || 0) + 1;
    });

    const labels = Object.keys(counts);

    return {
        labels: labels,
        values: labels.map(function (label) {
            return counts[label];
        })
    };
}

/* Grafik batang sederhana */
function drawBarChart(chartKey, canvasId, labels, values, color, seriesLabel) {

    const canvas = $(canvasId);

    if (!canvas) {
        return;
    }

    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }

    charts[chartKey] = new Chart(canvas, {

        type: "bar",

        data: {
            labels: labels,
            datasets: [{
                label: seriesLabel || "Jumlah Pekerjaan",
                data: values,
                backgroundColor: color,
                borderRadius: 6
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

/* Grafik donat UP3 + daftar rekap */
function drawUp3Doughnut(chartKey, canvasId, recapId) {

    const canvas = $(canvasId);

    if (!canvas) {
        return;
    }

    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }

    const data = countByField("up3", "Tidak diketahui");

    const colors = getUp3ColorPalette(data.labels.length);

    charts[chartKey] = new Chart(canvas, {

        type: "doughnut",

        data: {
            labels: data.labels,
            datasets: [{
                label: "Jumlah Pekerjaan",
                data: data.values,
                backgroundColor: colors
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    renderUp3RecapList(recapId, data.labels, data.values, colors);
}


/* =========================================================
   GRAFIK HARIAN
========================================================= */

function renderDailyChart() {

    const canvas = $("dailyChart");

    if (!canvas) {
        return;
    }

    if (charts.daily) {
        charts.daily.destroy();
    }

    const monthInput = $("dailyChartMonth");

    const selectedMonth =
        monthInput && monthInput.value
            ? monthInput.value
            : getLatestAvailableMonth();

    const counts = {};

    DATA.forEach(function (row) {

        if (!row.dateObject || !row.dateOnly || row.dateOnly === "-") {
            return;
        }

        if (selectedMonth && monthKeyOf(row.dateObject) !== selectedMonth) {
            return;
        }

        counts[row.dateOnly] = (counts[row.dateOnly] || 0) + 1;
    });

    /* Label untuk SEMUA tanggal pada bulan terpilih */
    let labels = [];

    if (selectedMonth) {

        const parts = selectedMonth.split("-");
        const year = Number(parts[0]);
        const month = Number(parts[1]);

        if (!isNaN(year) && !isNaN(month)) {

            const daysInMonth = new Date(year, month, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {

                labels.push(
                    `${String(day).padStart(2, "0")}/` +
                    `${String(month).padStart(2, "0")}/${year}`
                );
            }
        }
    }

    /* Fallback: pakai tanggal yang ada di data */
    if (!labels.length) {

        const toSortable = function (s) {
            const p = s.split("/");
            return `${p[2]}-${p[1]}-${p[0]}`;
        };

        labels = Object.keys(counts).sort(function (a, b) {
            return toSortable(a).localeCompare(toSortable(b));
        });
    }

    const values = labels.map(function (label) {
        return counts[label] || 0;
    });

    charts.daily = new Chart(canvas, {

        type: "bar",

        data: {
            labels: labels,
            datasets: [{
                label: "Jumlah Pekerjaan",
                data: values,
                backgroundColor: "#0F62B5",
                borderRadius: 6
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}


/* =========================================================
   GRAFIK BULANAN
========================================================= */

function renderMonthlyChart() {

    const canvas = $("lineChart");

    if (!canvas) {
        return;
    }

    if (charts.monthly) {
        charts.monthly.destroy();
    }

    const fromInput = $("monthlyChartFrom");
    const toInput = $("monthlyChartTo");

    const availableMonths = getAvailableMonths();

    const selectedFrom =
        (fromInput && fromInput.value) || availableMonths[0] || "";

    const selectedTo =
        (toInput && toInput.value) ||
        availableMonths[availableMonths.length - 1] ||
        "";

    const counts = {};

    DATA.forEach(function (row) {

        if (!row.dateObject) {
            return;
        }

        const key = monthKeyOf(row.dateObject);

        if (selectedFrom && key < selectedFrom) {
            return;
        }

        if (selectedTo && key > selectedTo) {
            return;
        }

        counts[key] = (counts[key] || 0) + 1;
    });

    const labels = Object.keys(counts).sort();

    const values = labels.map(function (label) {
        return counts[label];
    });

    charts.monthly = new Chart(canvas, {

        type: "line",

        data: {
            labels: labels,
            datasets: [{
                label: "Jumlah Pekerjaan",
                data: values,
                tension: 0.3,
                borderColor: "#0F62B5",
                backgroundColor: "rgba(15, 98, 181, 0.12)",
                fill: true
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}


/* =========================================================
   GRAFIK ULP, UP3, PERANGKAT
========================================================= */

function renderUnitChart() {

    const d = countByField("ulp", "Tidak diketahui");

    drawBarChart("unit", "unitChart", d.labels, d.values, "#2E8CE0");
}

function renderUp3Chart() {

    drawUp3Doughnut("up3", "up3Chart", "up3RecapList");
}

function renderDashboardUnitChart() {

    const d = countByField("ulp", "Tidak diketahui");

    drawBarChart(
        "dashboardUnit",
        "dashboardUnitChart",
        d.labels,
        d.values,
        "#2E8CE0"
    );
}

function renderDashboardUp3Chart() {

    drawUp3Doughnut("dashboardUp3", "dashboardUp3Chart", "dashboardUp3RecapList");
}

function renderDeviceChart() {

    const d = countByField("device", "Tidak diketahui");

    drawBarChart(
        "device",
        "deviceChart",
        d.labels,
        d.values,
        "#0A2A54",
        "Jumlah Laporan"
    );
}


/* =========================================================
   PDF — UTILITAS BERSAMA
========================================================= */

function createPdfBase(subtitle) {

    if (
        typeof window.jspdf === "undefined" ||
        typeof window.jspdf.jsPDF === "undefined"
    ) {
        throw new Error("Pustaka jsPDF tidak ditemukan.");
    }

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4"
    });

    const ctx = {
        doc: doc,
        pageWidth: doc.internal.pageSize.getWidth(),
        pageHeight: doc.internal.pageSize.getHeight(),
        marginLeft: 24,
        marginRight: 24,
        marginBottom: 40,
        cursorY: 74
    };

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");

    doc.text(
        "Logsheet Monitoring CCTV Online UID SSTB",
        ctx.pageWidth / 2,
        40,
        { align: "center" }
    );

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");

    doc.text(subtitle, ctx.pageWidth / 2, 58, { align: "center" });

    return ctx;
}

function pdfEnsureSpace(ctx, neededHeight) {

    if (ctx.cursorY + neededHeight > ctx.pageHeight - ctx.marginBottom) {

        ctx.doc.addPage();

        ctx.cursorY = 40;
    }
}

/* Nomor halaman ditulis di akhir, supaya "n / total" benar */
function pdfAddPageNumbers(ctx) {

    const doc = ctx.doc;

    const total = doc.internal.getNumberOfPages();

    for (let i = 1; i <= total; i++) {

        doc.setPage(i);

        doc.setFontSize(8);

        doc.text(
            "Halaman " + i + " / " + total,
            ctx.pageWidth - ctx.marginRight,
            ctx.pageHeight - 16,
            { align: "right" }
        );
    }
}

function pdfAddTable(ctx, head, body) {

    ctx.doc.autoTable({

        startY: ctx.cursorY,

        head: [head],

        body: body,

        styles: {
            fontSize: 7.5,
            cellPadding: 4,
            overflow: "linebreak"
        },

        headStyles: {
            fillColor: [15, 98, 181],
            textColor: [255, 255, 255],
            fontStyle: "bold"
        },

        alternateRowStyles: {
            fillColor: [234, 243, 252]
        },

        columnStyles: {
            0: { cellWidth: 26 }
        },

        margin: {
            left: ctx.marginLeft,
            right: ctx.marginRight,
            bottom: ctx.marginBottom
        }
    });

    ctx.cursorY = ctx.doc.lastAutoTable.finalY + 22;
}


/* =========================================================
   PDF — DATA LAPORAN (HANYA LAPORAN HARI INI)

   Tidak ada rekap hari-hari sebelumnya: hanya laporan yang
   masuk pada tanggal hari ini.
========================================================= */

function buildLaporanPdfDoc() {

    const todayKey = formatDateOnly(new Date());

    const ctx = createPdfBase(
        "Rekap Laporan Harian — Tanggal " + todayKey +
        " — dicetak pada " + formatDateTime(new Date())
    );

    const doc = ctx.doc;

    const rowsToday = getSortedByDateDesc(
        DATA.filter(function (row) {
            return row.dateOnly === todayKey;
        })
    );

    if (!rowsToday.length) {

        doc.setFontSize(11);

        doc.text(
            "Belum ada laporan yang masuk pada tanggal " + todayKey + ".",
            ctx.marginLeft,
            ctx.cursorY
        );

        pdfAddPageNumbers(ctx);

        return doc;
    }

    /* ULP unik yang sudah melapor hari ini */
    const seenUlpKeys = new Set();
    const uniqueUlp = [];

    rowsToday.forEach(function (row) {

        const key = normalizeKey(row.ulp);

        if (key && !seenUlpKeys.has(key)) {
            seenUlpKeys.add(key);
            uniqueUlp.push(row.ulp);
        }
    });

    pdfEnsureSpace(ctx, 50);

    doc.setFontSize(11.5);
    doc.setFont(undefined, "bold");
    doc.setTextColor(15, 98, 181);

    doc.text("Tanggal: " + todayKey, ctx.marginLeft, ctx.cursorY);

    doc.setTextColor(0, 0, 0);

    ctx.cursorY += 16;

    doc.setFontSize(9);
    doc.setFont(undefined, "normal");

    const ringkasanText =
        "ULP yang sudah melapor hari ini (" + uniqueUlp.length + "): " +
        (uniqueUlp.length ? uniqueUlp.join(", ") : "-");

    const wrapped = doc.splitTextToSize(
        ringkasanText,
        ctx.pageWidth - ctx.marginLeft - ctx.marginRight
    );

    pdfEnsureSpace(ctx, wrapped.length * 11 + 10);

    doc.text(wrapped, ctx.marginLeft, ctx.cursorY);

    ctx.cursorY += wrapped.length * 11 + 6;

    pdfAddTable(
        ctx,
        ["No", "Waktu", "UP3", "ULP", "Perangkat", "Pekerjaan", "Lokasi", "Petugas", "Dokumentasi"],
        rowsToday.map(function (row, index) {
            return [
                index + 1,
                row.dateText || "-",
                row.up3 || "-",
                row.ulp || "-",
                row.device || "-",
                row.job || "-",
                row.location || "-",
                row.officer || "-",
                row.documentation ? "Ada" : "-"
            ];
        })
    );

    pdfAddPageNumbers(ctx);

    return doc;
}


/* =========================================================
   PDF — REKAP LAPORAN SATU ULP PADA SATU HARI

   Dipanggil dari tombol "PDF ULP". Hanya laporan milik ULP
   tersebut pada tanggal baris yang diklik (tanpa hari lain).
========================================================= */

function buildUlpPdfDoc(ulp, dateKey) {

    const ctx = createPdfBase(
        "Rekap Laporan Harian — ULP " + ulp +
        " — Tanggal " + dateKey +
        " — dicetak pada " + formatDateTime(new Date())
    );

    const doc = ctx.doc;

    /* Dibandingkan dengan normalizeKey() agar variasi ketikan ULP tetap ikut */
    const targetUlpKey = normalizeKey(ulp);

    const rowsUlp = getSortedByDateDesc(
        DATA.filter(function (row) {
            return (
                normalizeKey(row.ulp) === targetUlpKey &&
                row.dateOnly === dateKey
            );
        })
    );

    if (!rowsUlp.length) {

        doc.setFontSize(11);

        doc.text(
            "Belum ada laporan ULP " + ulp + " pada tanggal " + dateKey + ".",
            ctx.marginLeft,
            ctx.cursorY
        );

        pdfAddPageNumbers(ctx);

        return doc;
    }

    pdfEnsureSpace(ctx, 40);

    doc.setFontSize(11.5);
    doc.setFont(undefined, "bold");
    doc.setTextColor(15, 98, 181);

    doc.text(
        "Tanggal: " + dateKey + "  —  Jumlah Laporan: " + rowsUlp.length,
        ctx.marginLeft,
        ctx.cursorY
    );

    doc.setTextColor(0, 0, 0);

    ctx.cursorY += 18;

    pdfAddTable(
        ctx,
        ["No", "Waktu", "UP3", "Perangkat", "Pekerjaan", "Lokasi", "Petugas", "Dokumentasi"],
        rowsUlp.map(function (row, index) {
            return [
                index + 1,
                row.dateText || "-",
                row.up3 || "-",
                row.device || "-",
                row.job || "-",
                row.location || "-",
                row.officer || "-",
                row.documentation ? "Ada" : "-"
            ];
        })
    );

    pdfAddPageNumbers(ctx);

    return doc;
}


/* =========================================================
   MODAL PDF
========================================================= */

/*
 * Tampilkan modal PDF lalu buat PDF-nya.
 * builder: fungsi yang mengembalikan dokumen jsPDF.
 */
function showPdfModal(mode, ulp, dateKey, title, desc, builder) {

    const modal = $("pdfModal");
    const statusEl = $("pdfStatus");
    const frame = $("pdfPreviewFrame");
    const titleEl = $("pdfModalTitle");
    const descEl = $("pdfModalDesc");

    if (!modal) {
        return;
    }

    modal.dataset.pdfMode = mode;
    modal.dataset.pdfUlp = ulp || "";
    modal.dataset.pdfDate = dateKey || "";

    if (titleEl) {
        titleEl.textContent = title;
    }

    if (descEl) {
        descEl.textContent = desc;
    }

    modal.classList.add("active");

    if (statusEl) {
        statusEl.textContent = "Menyiapkan PDF...";
        statusEl.style.display = "block";
    }

    if (frame) {
        frame.style.display = "none";
    }

    /* Jeda agar status "Menyiapkan PDF..." sempat tampil */
    setTimeout(function () {

        try {

            const blob = builder().output("blob");

            if (currentPdfBlobUrl) {
                URL.revokeObjectURL(currentPdfBlobUrl);
            }

            currentPdfBlobUrl = URL.createObjectURL(blob);

            if (frame) {
                frame.src = currentPdfBlobUrl;
                frame.style.display = "block";
            }

            if (statusEl) {
                statusEl.style.display = "none";
            }

        } catch (error) {

            console.error("Gagal membuat PDF:", error);

            if (statusEl) {
                statusEl.textContent = "Gagal membuat PDF: " + error.message;
            }
        }
    }, 50);
}

function openPdfModal() {

    const todayKey = formatDateOnly(new Date());

    showPdfModal(
        "all",
        "",
        todayKey,
        "Rekap Laporan Harian (PDF)",
        "Laporan yang masuk hari ini (" + todayKey + ") saja.",
        buildLaporanPdfDoc
    );
}

function openUlpPdfModal(rowNumber) {

    const row = DATA.find(function (item) {
        return Number(item.rowNumber) === Number(rowNumber);
    });

    if (!row) {
        alert("Data tidak ditemukan.");
        return;
    }

    const ulp = row.ulp || "Tidak Diketahui";

    const dateKey = row.dateOnly;

    showPdfModal(
        "ulp",
        ulp,
        dateKey,
        "Rekap Laporan ULP " + ulp + " (PDF)",
        "Laporan ULP ini pada tanggal " + dateKey + " saja.",
        function () {
            return buildUlpPdfDoc(ulp, dateKey);
        }
    );
}

function closePdfModal() {

    const modal = $("pdfModal");

    if (modal) {
        modal.classList.remove("active");
    }
}

function downloadLaporanPdf() {

    try {

        const modal = $("pdfModal");

        const mode = modal ? modal.dataset.pdfMode : "all";
        const ulp = modal ? modal.dataset.pdfUlp : "";
        const dateKey = modal ? modal.dataset.pdfDate : "";

        const isUlpMode = mode === "ulp" && ulp;

        const doc = isUlpMode
            ? buildUlpPdfDoc(ulp, dateKey)
            : buildLaporanPdfDoc();

        const datePart = (
            isUlpMode && dateKey ? dateKey : formatDateOnly(new Date())
        )
            .split("/")
            .join("-");

        const filename = isUlpMode
            ? "rekap-ulp-" +
              ulp
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "") +
              "-" + datePart + ".pdf"
            : "data-laporan-cctv-" + datePart + ".pdf";

        doc.save(filename);

    } catch (error) {

        console.error("Gagal mengunduh PDF:", error);

        alert("Gagal membuat PDF: " + error.message);
    }
}


/* =========================================================
   DOM READY
========================================================= */

document.addEventListener("DOMContentLoaded", async function () {

    console.log("Website CCTV UID SSTB dimulai.");

    loadTheme();

    /* -----------------------------------------
       NAVIGATION
    ----------------------------------------- */

    document.querySelectorAll(".nav-link").forEach(function (link) {

        link.addEventListener("click", function (event) {

            event.preventDefault();

            const view = this.dataset.view;

            if (view) {
                showView(view);
            }
        });
    });

    document.querySelectorAll("[data-view-target]").forEach(function (button) {

        button.addEventListener("click", function () {

            const view = this.dataset.viewTarget;

            if (view) {
                showView(view);
            }
        });
    });

    /* -----------------------------------------
       SEARCH
    ----------------------------------------- */

    const globalSearch = $("globalSearch");

    if (globalSearch) {
        globalSearch.addEventListener("input", function () {
            searchData(this.value);
        });
    }

    const laporanSearch = $("laporanSearch");

    if (laporanSearch) {
        laporanSearch.addEventListener("input", function () {
            searchData(this.value);
        });
    }

    const monitoringSearch = $("monitoringSearch");

    if (monitoringSearch) {

        monitoringSearch.addEventListener("input", function () {

            const keyword = this.value.toLowerCase().trim();

            if (!keyword) {
                renderMonitoring();
                return;
            }

            const filtered = DATA.filter(function (row) {

                const text = [
                    row.dateText,
                    row.up3,
                    row.ulp,
                    row.device,
                    row.job,
                    row.location,
                    row.officer
                ]
                    .join(" ")
                    .toLowerCase();

                return text.includes(keyword);
            });

            renderMonitoring(filtered);
        });
    }

    /* -----------------------------------------
       THEME & MOBILE MENU
    ----------------------------------------- */

    const themeButton = $("themeToggle");

    if (themeButton) {
        themeButton.addEventListener("click", toggleTheme);
    }

    const mobileMenu = $("mobileMenu");
    const sidebar = $("sidebar");

    if (mobileMenu && sidebar) {
        mobileMenu.addEventListener("click", function () {
            sidebar.classList.toggle("open");
        });
    }

    /* -----------------------------------------
       MODAL EDIT
    ----------------------------------------- */

    const closeModalBtn = $("closeEditModal");

    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", closeEditModal);
    }

    const cancelButton = $("cancelEditBtn");

    if (cancelButton) {
        cancelButton.addEventListener("click", closeEditModal);
    }

    const editForm = $("editForm");

    if (editForm) {
        editForm.addEventListener("submit", saveEdit);
    }

    const editModal = $("editModal");

    if (editModal) {
        editModal.addEventListener("click", function (event) {
            if (event.target === editModal) {
                closeEditModal();
            }
        });
    }

    /* -----------------------------------------
       MODAL PDF
    ----------------------------------------- */

    const viewPdfBtn = $("viewPdfBtn");

    if (viewPdfBtn) {
        viewPdfBtn.addEventListener("click", openPdfModal);
    }

    const closePdfModalX = $("closePdfModal");

    if (closePdfModalX) {
        closePdfModalX.addEventListener("click", closePdfModal);
    }

    const closePdfModalBtn = $("closePdfModalBtn");

    if (closePdfModalBtn) {
        closePdfModalBtn.addEventListener("click", closePdfModal);
    }

    const downloadPdfBtn = $("downloadPdfBtn");

    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener("click", downloadLaporanPdf);
    }

    const pdfModal = $("pdfModal");

    if (pdfModal) {
        pdfModal.addEventListener("click", function (event) {
            if (event.target === pdfModal) {
                closePdfModal();
            }
        });
    }

    /* -----------------------------------------
       SETTINGS DRAWER
    ----------------------------------------- */

    const drawerOverlay = $("drawerOverlay");

    ["settingsBtn", "settingsBtnLaporan"].forEach(function (id) {

        const btn = $(id);

        if (btn && drawerOverlay) {
            btn.addEventListener("click", function () {
                drawerOverlay.classList.add("active");
            });
        }
    });

    const closeDrawer = $("closeDrawer");

    if (closeDrawer && drawerOverlay) {
        closeDrawer.addEventListener("click", function () {
            drawerOverlay.classList.remove("active");
        });
    }

    if (drawerOverlay) {
        drawerOverlay.addEventListener("click", function (event) {
            if (event.target === drawerOverlay) {
                drawerOverlay.classList.remove("active");
            }
        });
    }

    /* -----------------------------------------
       HUBUNGKAN URL CSV
    ----------------------------------------- */

    const loadUrlBtn = $("loadUrlBtn");
    const csvUrlInput = $("csvUrlInput");
    const statusMsg = $("statusMsg");

    if (csvUrlInput) {
        csvUrlInput.value =
            localStorage.getItem(STORAGE_URL) || DEFAULT_CSV_URL;
    }

    if (loadUrlBtn) {

        loadUrlBtn.addEventListener("click", async function () {

            const url = csvUrlInput ? csvUrlInput.value.trim() : "";

            if (!url) {
                alert("URL Google Sheets belum diisi.");
                return;
            }

            if (statusMsg) {
                statusMsg.textContent = "Menghubungkan...";
            }

            const success = await loadFromURL(url);

            if (statusMsg) {
                statusMsg.textContent = success
                    ? "Data berhasil terhubung."
                    : "Gagal menghubungkan data.";
            }
        });
    }

    /* -----------------------------------------
       FILTER GRAFIK
    ----------------------------------------- */

    const dailyChartMonth = $("dailyChartMonth");

    if (dailyChartMonth) {
        dailyChartMonth.addEventListener("change", renderDailyChart);
    }

    const monthlyChartFrom = $("monthlyChartFrom");
    const monthlyChartTo = $("monthlyChartTo");

    if (monthlyChartFrom) {

        monthlyChartFrom.addEventListener("change", function () {

            /* "Dari" tidak boleh melewati "Sampai" */
            if (
                monthlyChartTo &&
                monthlyChartTo.value &&
                monthlyChartFrom.value > monthlyChartTo.value
            ) {
                monthlyChartTo.value = monthlyChartFrom.value;
            }

            renderMonthlyChart();
        });
    }

    if (monthlyChartTo) {

        monthlyChartTo.addEventListener("change", function () {

            /* "Sampai" tidak boleh lebih awal dari "Dari" */
            if (
                monthlyChartFrom &&
                monthlyChartFrom.value &&
                monthlyChartTo.value < monthlyChartFrom.value
            ) {
                monthlyChartFrom.value = monthlyChartTo.value;
            }

            renderMonthlyChart();
        });
    }

    /* -----------------------------------------
       REFRESH
    ----------------------------------------- */

    const refreshBtn = $("refreshBtnMain");

    if (refreshBtn) {

        refreshBtn.addEventListener("click", async function () {

            refreshBtn.disabled = true;
            refreshBtn.textContent = "↻ Memuat...";

            const url = localStorage.getItem(STORAGE_URL) || DEFAULT_CSV_URL;

            await loadFromURL(url);

            await loadCctvSummary();

            refreshBtn.disabled = false;
            refreshBtn.textContent = "↻ Refresh";
        });
    }

    /* -----------------------------------------
       LOAD DATA AWAL
    ----------------------------------------- */

    const csvURL = localStorage.getItem(STORAGE_URL) || DEFAULT_CSV_URL;

    console.log("CSV URL:", csvURL);
    console.log("API URL:", DEFAULT_API_URL);

    await loadFromURL(csvURL);

    await loadCctvSummary();

    console.log("Website selesai dimuat.");
});


/* =========================================================
   AGAR onclick HTML BISA MEMANGGIL EDIT & PDF ULP
========================================================= */

window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.openUlpPdfModal = openUlpPdfModal;