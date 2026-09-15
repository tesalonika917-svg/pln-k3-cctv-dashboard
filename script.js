/* =========================================================
   KONFIGURASI
========================================================= */

const DEFAULT_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWRM7E3rtMsJVWf9z1cntdblP4nSP9p0QCC6DeEbVt_3MHbjicUDgP2AsgLPV-NaNAYH3YZfDwFXhI/pub?output=csv";


const STORAGE_URL =
    "cctv_uid_sstb_csv_url";


/* =========================================================
   STATE
========================================================= */

let DATA = [];

let charts = {};

let currentView = "dashboard";


/* =========================================================
   HELPER
========================================================= */

function $(id) {
    return document.getElementById(id);
}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   NORMALISASI HEADER
========================================================= */

function normalizeHeader(text) {

    return String(text ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/_/g, " ");
}


/* =========================================================
   MENCARI FIELD
========================================================= */

function getField(row, names) {

    const keys = Object.keys(row || {});

    for (const name of names) {

        const target = normalizeHeader(name);

        const foundKey = keys.find(
            key => normalizeHeader(key) === target
        );

        if (foundKey !== undefined) {

            return String(row[foundKey] ?? "").trim();
        }
    }

    return "";
}


/* =========================================================
   PARSE TIMESTAMP
========================================================= */

function parseTimestamp(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }


    /* Excel serial date */

    if (
        typeof value === "number" &&
        value > 20000 &&
        value < 60000
    ) {

        const excelEpoch =
            new Date(Date.UTC(1899, 11, 30));

        const date =
            new Date(
                excelEpoch.getTime() +
                value * 86400000
            );

        return date;
    }


    let text = String(value).trim();

    text = text.replace(
        /\s+/g,
        " "
    );


    /*
        FORMAT:

        2026-09-15 12:42:52
        2026-09-15T12:42:52

        DD/MM/YYYY 12:42:52
        DD-MM-YYYY 12:42:52
    */


    let match;


    /* YYYY-MM-DD */

    match = text.match(
        /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );


    if (match) {

        const year = Number(match[1]);

        const month = Number(match[2]) - 1;

        const day = Number(match[3]);

        const hour = Number(match[4]);

        const minute = Number(match[5]);

        const second = Number(match[6] || 0);


        return new Date(
            year,
            month,
            day,
            hour,
            minute,
            second
        );
    }


    /* DD/MM/YYYY */

    match = text.match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );


    if (match) {

        const day = Number(match[1]);

        const month = Number(match[2]) - 1;

        const year = Number(match[3]);

        const hour = Number(match[4]);

        const minute = Number(match[5]);

        const second = Number(match[6] || 0);


        return new Date(
            year,
            month,
            day,
            hour,
            minute,
            second
        );
    }


    /* Hanya tanggal */

    match = text.match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
    );


    if (match) {

        return new Date(
            Number(match[3]),
            Number(match[2]) - 1,
            Number(match[1]),
            0,
            0,
            0
        );
    }


    /*
       Fallback
       hanya jika format memang
       dapat dibaca browser
    */

    const fallback =
        new Date(text);

    if (!isNaN(fallback.getTime())) {

        return fallback;
    }


    return null;
}


/* =========================================================
   FORMAT TIMESTAMP
========================================================= */

function formatTimestamp(value) {

    const date =
        value instanceof Date
            ? value
            : parseTimestamp(value);


    if (!date) {

        return value || "-";
    }


    const day =
        String(date.getDate()).padStart(2, "0");

    const month =
        String(date.getMonth() + 1).padStart(2, "0");

    const year =
        date.getFullYear();


    const hour =
        String(date.getHours()).padStart(2, "0");

    const minute =
        String(date.getMinutes()).padStart(2, "0");

    const second =
        String(date.getSeconds()).padStart(2, "0");


    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}


/* =========================================================
   NORMALISASI DATA SPREADSHEET
========================================================= */

function normalizeRow(row) {

    const timestamp =
        getField(row, [
            "Timestamp"
        ]);


    const up3 =
        getField(row, [
            "Unit UP3"
        ]);


    const ulp =
        getField(row, [
            "Unit ULP"
        ]);


    const device =
        getField(row, [
            "NAMA PERANGKAT CCTV"
        ]);


    const job =
        getField(row, [
            "Nama Pekerjaan"
        ]);


    const location =
        getField(row, [
            "Lokasi Pekerjaan"
        ]);


    const officer =
        getField(row, [
            "Petugas Pelaksana di Lapangan"
        ]);


    const documentation =
        getField(row, [
            "Dokumentasi CCTV"
        ]);


    const dateObject =
        parseTimestamp(timestamp);


    return {

        timestamp,

        dateObject,

        dateText:
            dateObject
                ? formatTimestamp(dateObject)
                : timestamp || "-",

        up3:
            up3 || "-",

        ulp:
            ulp || "-",

        device:
            device || "-",

        job:
            job || "-",

        location:
            location || "-",

        officer:
            officer || "-",

        documentation:
            documentation || "-"

    };
}


/* =========================================================
   LOAD CSV
========================================================= */

async function fetchCSV(url) {

    const response =
        await fetch(
            url,
            {
                cache: "no-store"
            }
        );


    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );
    }


    const text =
        await response.text();


    if (
        !text ||
        text.trim().length === 0
    ) {

        throw new Error(
            "CSV kosong."
        );
    }


    return text;
}


/* =========================================================
   FETCH DENGAN FALLBACK CORS
========================================================= */

async function fetchCSVWithFallback(url) {

    try {

        return await fetchCSV(url);

    } catch (directError) {

        console.warn(
            "Fetch langsung gagal:",
            directError
        );
    }


    /*
       Fallback 1
       allorigins
    */

    try {

        const proxyUrl =
            "https://api.allorigins.win/raw?url=" +
            encodeURIComponent(url);


        return await fetchCSV(proxyUrl);

    } catch (proxyError) {

        console.warn(
            "AllOrigins gagal:",
            proxyError
        );
    }


    /*
       Fallback 2
       corsproxy
    */

    try {

        const proxyUrl =
            "https://corsproxy.io/?" +
            encodeURIComponent(url);


        return await fetchCSV(proxyUrl);

    } catch (proxyError2) {

        console.warn(
            "Corsproxy gagal:",
            proxyError2
        );

        throw new Error(
            "Tidak dapat mengambil data Spreadsheet."
        );
    }
}


/* =========================================================
   PARSE CSV
========================================================= */

function parseCSV(text) {

    return new Promise(
        (resolve, reject) => {

            Papa.parse(
                text,
                {
                    header: true,

                    skipEmptyLines: true,

                    transformHeader: header =>
                        header.trim(),

                    complete: result => {

                        if (result.errors?.length) {

                            console.warn(
                                "CSV errors:",
                                result.errors
                            );
                        }


                        resolve(
                            result.data || []
                        );
                    },

                    error: error => {

                        reject(error);
                    }
                }
            );

        }
    );
}


/* =========================================================
   LOAD URL
========================================================= */

async function loadFromURL(
    url,
    save = true
) {

    if (!url) {

        throw new Error(
            "URL Spreadsheet belum diisi."
        );
    }


    setStatus(
        "Mengambil data dari Google Spreadsheet..."
    );


    const csv =
        await fetchCSVWithFallback(url);


    const rows =
        await parseCSV(csv);


    const normalized =
        rows
            .map(normalizeRow)
            .filter(row => {

                return (
                    row.timestamp !== "-" ||
                    row.up3 !== "-" ||
                    row.ulp !== "-" ||
                    row.device !== "-"
                );
            });


    if (!normalized.length) {

        throw new Error(
            "Data Spreadsheet tidak ditemukan."
        );
    }


    DATA = normalized;


    if (save) {

        localStorage.setItem(
            STORAGE_URL,
            url
        );
    }


    afterDataLoaded(
        `Berhasil memuat ${DATA.length} data dari Spreadsheet.`
    );
}


/* =========================================================
   SET STATUS
========================================================= */

function setStatus(message) {

    const status =
        $("statusMsg");

    if (status) {

        status.textContent =
            message;
    }
}


/* =========================================================
   AFTER DATA LOADED
========================================================= */

function afterDataLoaded(message) {

    updateDashboard();

    renderMonitoring();

    renderLaporan();

    renderCharts();

    updateStatusSystem();

    setStatus(message);
}


/* =========================================================
   UPDATE DASHBOARD
========================================================= */

function updateDashboard() {

    $("totalData").textContent =
        DATA.length;


    const today =
        new Date();


    const todayKey =
        [
            today.getFullYear(),

            String(
                today.getMonth() + 1
            ).padStart(2, "0"),

            String(
                today.getDate()
            ).padStart(2, "0")

        ].join("-");


    const todayCount =
        DATA.filter(row => {

            if (!row.dateObject) {

                return false;
            }


            const key =
                [
                    row.dateObject.getFullYear(),

                    String(
                        row.dateObject.getMonth() + 1
                    ).padStart(2, "0"),

                    String(
                        row.dateObject.getDate()
                    ).padStart(2, "0")

                ].join("-");


            return key === todayKey;

        }).length;


    $("todayData").textContent =
        todayCount;


    const devices =
        new Set(

            DATA
                .map(row => row.device)
                .filter(
                    value =>
                        value &&
                        value !== "-"
                )

        );


    $("totalCctv").textContent =
        devices.size;


    const units =
        new Set(

            DATA
                .map(row => row.ulp)
                .filter(
                    value =>
                        value &&
                        value !== "-"
                )

        );


    $("totalUnit").textContent =
        units.size;


    renderRecent();
}


/* =========================================================
   UPDATE STATUS
========================================================= */

function updateStatusSystem() {

    $("dataActive").textContent =
        DATA.length;


    const status =
        $("dataStatus");


    if (DATA.length > 0) {

        status.textContent =
            "Terhubung";

        status.classList.add(
            "status-connected"
        );

    } else {

        status.textContent =
            "Belum terhubung";

        status.classList.remove(
            "status-connected"
        );
    }
}


/* =========================================================
   SORT DATA
========================================================= */

function sortedData() {

    return [...DATA].sort(
        (a, b) => {

            const timeA =
                a.dateObject
                    ? a.dateObject.getTime()
                    : 0;

            const timeB =
                b.dateObject
                    ? b.dateObject.getTime()
                    : 0;

            return timeB - timeA;
        }
    );
}


/* =========================================================
   AKTIVITAS TERBARU
========================================================= */

function renderRecent() {

    const container =
        $("recentList");


    if (!DATA.length) {

        container.innerHTML =
            `<div class="empty-state">
                Belum ada data.
             </div>`;

        return;
    }


    const recent =
        sortedData().slice(0, 8);


    container.innerHTML =
        recent.map(row => {

            const parts =
                row.dateText.split(" ");


            const date =
                parts[0] || "-";


            const time =
                parts[1] || "-";


            return `

                <div class="activity-item">

                    <div class="activity-time">

                        <strong>
                            ${escapeHTML(date)}
                        </strong>

                        <br>

                        ${escapeHTML(time)}

                    </div>


                    <div class="activity-main">

                        <strong>
                            ${escapeHTML(row.device)}
                        </strong>

                        <span>
                            ${escapeHTML(row.job)}
                        </span>

                    </div>


                    <div class="activity-location">

                        ${escapeHTML(row.ulp)}

                        <br>

                        ${escapeHTML(row.location)}

                    </div>

                </div>

            `;

        }).join("");
}


/* =========================================================
   MONITORING
========================================================= */

function renderMonitoring(
    search = ""
) {

    const tbody =
        $("monitoringTable");


    const keyword =
        search.trim().toLowerCase();


    const rows =
        sortedData()
            .filter(row => {

                if (!keyword) {

                    return true;
                }


                return [

                    row.dateText,

                    row.up3,

                    row.ulp,

                    row.device,

                    row.job,

                    row.location,

                    row.officer

                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(keyword);

            });


    if (!rows.length) {

        tbody.innerHTML =
            `<tr>
                <td colspan="8" class="empty-state">
                    Data tidak ditemukan.
                </td>
             </tr>`;

        return;
    }


    tbody.innerHTML =
        rows.map(
            (row, index) => `

            <tr>

                <td>
                    ${index + 1}
                </td>

                <td>
                    ${escapeHTML(row.dateText)}
                </td>

                <td>
                    ${escapeHTML(row.up3)}
                </td>

                <td>
                    ${escapeHTML(row.ulp)}
                </td>

                <td>
                    ${escapeHTML(row.device)}
                </td>

                <td>
                    ${escapeHTML(row.job)}
                </td>

                <td>
                    ${escapeHTML(row.location)}
                </td>

                <td>
                    ${escapeHTML(row.officer)}
                </td>

            </tr>

        `
        ).join("");
}


/* =========================================================
   DATA LAPORAN
========================================================= */

function renderLaporan(
    search = ""
) {

    const tbody =
        $("laporanTable");


    const keyword =
        search.trim().toLowerCase();


    const rows =
        sortedData()
            .filter(row => {

                if (!keyword) {

                    return true;
                }


                return [

                    row.dateText,

                    row.up3,

                    row.ulp,

                    row.device,

                    row.job,

                    row.location,

                    row.officer,

                    row.documentation

                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(keyword);

            });


    if (!rows.length) {

        tbody.innerHTML =
            `<tr>
                <td colspan="9" class="empty-state">
                    Data tidak ditemukan.
                </td>
             </tr>`;

        return;
    }


    tbody.innerHTML =
        rows.map(
            (row, index) => {

                let documentation =
                    "-";


                if (
                    row.documentation &&
                    row.documentation !== "-"
                ) {

                    const safeUrl =
                        row.documentation.trim();


                    if (
                        safeUrl.startsWith(
                            "http://"
                        ) ||
                        safeUrl.startsWith(
                            "https://"
                        )
                    ) {

                        documentation =
                            `<a
                                href="${escapeHTML(safeUrl)}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Lihat
                            </a>`;

                    } else {

                        documentation =
                            escapeHTML(
                                row.documentation
                            );
                    }
                }


                return `

                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.dateText
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.up3
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.ulp
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.device
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.job
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.location
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                row.officer
                            )}
                        </td>

                        <td>
                            ${documentation}
                        </td>

                    </tr>

                `;

            }
        ).join("");
}


/* =========================================================
   CHART
========================================================= */

function destroyChart(name) {

    if (charts[name]) {

        charts[name].destroy();

        charts[name] = null;
    }
}


/* =========================================================
   GRAFIK BULANAN
========================================================= */

function createMonthlyChart() {

    destroyChart("line");


    const counts = {};


    DATA.forEach(row => {

        if (!row.dateObject) {

            return;
        }


        const year =
            row.dateObject.getFullYear();


        const month =
            row.dateObject.getMonth();


        const key =
            `${year}-${String(month + 1).padStart(2, "0")}`;


        counts[key] =
            (counts[key] || 0) + 1;
    });


    const keys =
        Object.keys(counts).sort();


    const labels =
        keys.map(key => {

            const [
                year,
                month
            ] =
                key.split("-");


            const date =
                new Date(
                    Number(year),
                    Number(month) - 1,
                    1
                );


            return date.toLocaleDateString(
                "id-ID",
                {
                    month: "short",
                    year: "numeric"
                }
            );

        });


    const values =
        keys.map(
            key => counts[key]
        );


    const ctx =
        $("lineChart");


    charts.line =
        new Chart(
            ctx,
            {
                type: "line",

                data: {

                    labels,

                    datasets: [

                        {
                            label:
                                "Jumlah Pekerjaan",

                            data:
                                values,

                            borderWidth: 2,

                            tension: 0.3,

                            fill: false
                        }

                    ]
                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    plugins: {

                        legend: {
                            display: false
                        }

                    },

                    scales: {

                        y: {

                            beginAtZero: true,

                            ticks: {
                                precision: 0
                            }

                        }

                    }

                }
            }
        );
}


/* =========================================================
   GRAFIK ULP
========================================================= */

function createUnitChart() {

    destroyChart("unit");


    const counts = {};


    DATA.forEach(row => {

        if (
            row.ulp &&
            row.ulp !== "-"
        ) {

            counts[row.ulp] =
                (counts[row.ulp] || 0) + 1;
        }

    });


    const entries =
        Object.entries(counts)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(0, 15);


    const labels =
        entries.map(
            item => item[0]
        );


    const values =
        entries.map(
            item => item[1]
        );


    const ctx =
        $("unitChart");


    charts.unit =
        new Chart(
            ctx,
            {
                type: "bar",

                data: {

                    labels,

                    datasets: [

                        {
                            label:
                                "Jumlah Pekerjaan",

                            data:
                                values,

                            borderWidth: 1
                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    indexAxis: "y",

                    plugins: {

                        legend: {
                            display: false
                        }

                    },

                    scales: {

                        x: {

                            beginAtZero: true,

                            ticks: {
                                precision: 0
                            }

                        }

                    }

                }

            }
        );
}


/* =========================================================
   RENDER SEMUA CHART
========================================================= */

/* =========================================================
   CHART HELPER
========================================================= */

function destroyChart(name) {

    if (charts[name]) {

        charts[name].destroy();

        charts[name] = null;
    }
}


/* =========================================================
   GRAFIK 1
   PEKERJAAN PER BULAN
========================================================= */

function createMonthlyChart() {

    destroyChart("line");


    const counts = {};


    DATA.forEach(row => {

        if (!row.dateObject) {

            return;
        }


        const year =
            row.dateObject.getFullYear();


        const month =
            row.dateObject.getMonth();


        const key =
            `${year}-${String(month + 1).padStart(2, "0")}`;


        counts[key] =
            (counts[key] || 0) + 1;

    });


    const keys =
        Object.keys(counts).sort();


    const labels =
        keys.map(key => {

            const [
                year,
                month
            ] = key.split("-");


            const date =
                new Date(
                    Number(year),
                    Number(month) - 1,
                    1
                );


            return date.toLocaleDateString(
                "id-ID",
                {
                    month: "short",
                    year: "numeric"
                }
            );

        });


    const values =
        keys.map(
            key => counts[key]
        );


    const canvas =
        document.getElementById(
            "lineChart"
        );


    if (!canvas) {

        return;
    }


    const ctx =
        canvas.getContext("2d");


    charts.line =
        new Chart(
            ctx,
            {

                type: "line",

                data: {

                    labels: labels,

                    datasets: [

                        {

                            label:
                                "Jumlah Pekerjaan",

                            data:
                                values,

                            borderWidth: 2,

                            pointRadius: 4,

                            pointHoverRadius: 6,

                            tension: 0.3,

                            fill: false

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    plugins: {

                        legend: {

                            display: false

                        }

                    },

                    scales: {

                        y: {

                            beginAtZero: true,

                            ticks: {

                                precision: 0

                            }

                        }

                    }

                }

            }
        );
}


/* =========================================================
   GRAFIK 2
   PEKERJAAN PER ULP
========================================================= */

function createUnitChart() {

    destroyChart("unit");


    const counts = {};


    DATA.forEach(row => {

        if (
            row.ulp &&
            row.ulp !== "-"
        ) {

            counts[row.ulp] =
                (counts[row.ulp] || 0) + 1;

        }

    });


    const entries =
        Object.entries(counts)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(0, 15);


    const labels =
        entries.map(
            item => item[0]
        );


    const values =
        entries.map(
            item => item[1]
        );


    const canvas =
        document.getElementById(
            "unitChart"
        );


    if (!canvas) {

        return;
    }


    const ctx =
        canvas.getContext("2d");


    charts.unit =
        new Chart(
            ctx,
            {

                type: "bar",

                data: {

                    labels: labels,

                    datasets: [

                        {

                            label:
                                "Jumlah Pekerjaan",

                            data:
                                values,

                            borderWidth: 1

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    indexAxis: "y",

                    plugins: {

                        legend: {

                            display: false

                        }

                    },

                    scales: {

                        x: {

                            beginAtZero: true,

                            ticks: {

                                precision: 0

                            }

                        }

                    }

                }

            }
        );
}


/* =========================================================
   GRAFIK 3
   DISTRIBUSI PEKERJAAN PER UP3
========================================================= */

function createUP3Chart() {

    destroyChart("up3");


    const counts = {};


    DATA.forEach(row => {

        if (
            row.up3 &&
            row.up3 !== "-"
        ) {

            counts[row.up3] =
                (counts[row.up3] || 0) + 1;

        }

    });


    const entries =
        Object.entries(counts)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );


    const labels =
        entries.map(
            item => item[0]
        );


    const values =
        entries.map(
            item => item[1]
        );


    const canvas =
        document.getElementById(
            "up3Chart"
        );


    if (!canvas) {

        return;
    }


    const ctx =
        canvas.getContext("2d");


    charts.up3 =
        new Chart(
            ctx,
            {

                type: "doughnut",

                data: {

                    labels: labels,

                    datasets: [

                        {

                            label:
                                "Pekerjaan",

                            data:
                                values,

                            borderWidth: 2

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    plugins: {

                        legend: {

                            position: "right",

                            labels: {

                                boxWidth: 12,

                                font: {

                                    size: 10

                                }

                            }

                        }

                    }

                }

            }
        );
}


/* =========================================================
   GRAFIK 4
   JENIS / NAMA PEKERJAAN
========================================================= */

function createJobChart() {

    destroyChart("job");


    const counts = {};


    DATA.forEach(row => {

        if (
            row.job &&
            row.job !== "-"
        ) {

            counts[row.job] =
                (counts[row.job] || 0) + 1;

        }

    });


    const entries =
        Object.entries(counts)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(0, 15);


    const labels =
        entries.map(
            item => item[0]
        );


    const values =
        entries.map(
            item => item[1]
        );


    const canvas =
        document.getElementById(
            "jobChart"
        );


    if (!canvas) {

        return;
    }


    const ctx =
        canvas.getContext("2d");


    charts.job =
        new Chart(
            ctx,
            {

                type: "bar",

                data: {

                    labels: labels,

                    datasets: [

                        {

                            label:
                                "Jumlah",

                            data:
                                values,

                            borderWidth: 1

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    indexAxis: "y",

                    plugins: {

                        legend: {

                            display: false

                        }

                    },

                    scales: {

                        x: {

                            beginAtZero: true,

                            ticks: {

                                precision: 0

                            }

                        }

                    }

                }

            }
        );
}


/* =========================================================
   RENDER SEMUA GRAFIK
========================================================= */

function renderCharts() {

    if (!DATA.length) {

        return;
    }


    createMonthlyChart();

    createUnitChart();

    createUP3Chart();

    createJobChart();
}


/* =========================================================
   NAVIGASI
========================================================= */

function showView(viewName) {

    currentView =
        viewName;


    document
        .querySelectorAll(".view")
        .forEach(view => {

            view.classList.toggle(
                "active",
                view.id ===
                    `view-${viewName}`
            );

        });


    document
        .querySelectorAll(".nav-link")
        .forEach(link => {

            link.classList.toggle(
                "active",
                link.dataset.view ===
                    viewName
            );

        });


    const titles = {

        dashboard:
            "Dashboard",

        monitoring:
            "Monitoring Harian",

        laporan:
            "Data Laporan",

        grafik:
            "Visualisasi Grafik",

        panduan:
            "Panduan"

    };


    $("topbarTitle").textContent =
        titles[viewName] ||
        "Dashboard";


    /*
       Chart hanya digambar ulang
       ketika halaman grafik dibuka.
    */

    if (
        viewName === "grafik" &&
        DATA.length
    ) {

        setTimeout(
            renderCharts,
            100
        );
    }


    /*
       Tutup sidebar mobile
    */

    if (
        window.innerWidth <= 800
    ) {

        $("sidebar")
            .classList.remove(
                "open"
            );
    }
}


/* =========================================================
   DRAWER
========================================================= */

function openDrawer() {

    $("dataDrawer")
        .classList.add(
            "open"
        );


    $("drawerOverlay")
        .classList.add(
            "show"
        );
}


function closeDrawer() {

    $("dataDrawer")
        .classList.remove(
            "open"
        );


    $("drawerOverlay")
        .classList.remove(
            "show"
        );
}


/* =========================================================
   EXPORT CSV
========================================================= */

function exportCSV() {

    if (!DATA.length) {

        alert(
            "Tidak ada data untuk diekspor."
        );

        return;
    }


    const rows =
        DATA.map(row => ({

            "Timestamp":
                row.dateText,

            "Unit UP3":
                row.up3,

            "Unit ULP":
                row.ulp,

            "NAMA PERANGKAT CCTV":
                row.device,

            "Nama Pekerjaan":
                row.job,

            "Lokasi Pekerjaan":
                row.location,

            "Petugas Pelaksana di Lapangan":
                row.officer,

            "Dokumentasi CCTV":
                row.documentation

        }));


    const csv =
        Papa.unparse(rows);


    const blob =
        new Blob(
            [
                "\uFEFF" +
                csv
            ],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement("a");


    link.href =
        url;


    link.download =
        `data-laporan-cctv-${getTodayFilename()}.csv`;


    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}


/* =========================================================
   NAMA FILE EXPORT
========================================================= */

function getTodayFilename() {

    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");


    const day =
        String(
            now.getDate()
        ).padStart(2, "0");


    return `${year}-${month}-${day}`;
}


/* =========================================================
   LOAD FILE CSV / EXCEL
========================================================= */

async function loadLocalFile(file) {

    if (!file) {

        return;
    }


    setStatus(
        `Membaca file ${file.name}...`
    );


    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    try {

        let rows = [];


        if (extension === "csv") {

            const text =
                await file.text();


            rows =
                await parseCSV(text);

        } else {

            const buffer =
                await file.arrayBuffer();


            const workbook =
                XLSX.read(
                    buffer,
                    {
                        type: "array",
                        cellDates: true
                    }
                );


            const firstSheet =
                workbook
                    .Sheets[
                        workbook.SheetNames[0]
                    ];


            rows =
                XLSX.utils.sheet_to_json(
                    firstSheet,
                    {
                        defval: ""
                    }
                );
        }


        DATA =
            rows
                .map(normalizeRow)
                .filter(row => {

                    return (
                        row.timestamp !== "-" ||
                        row.up3 !== "-" ||
                        row.ulp !== "-" ||
                        row.device !== "-"
                    );
                });


        if (!DATA.length) {

            throw new Error(
                "Tidak ada data yang ditemukan."
            );
        }


        afterDataLoaded(
            `Berhasil memuat ${DATA.length} data dari file.`
        );


    } catch (error) {

        console.error(error);

        setStatus(
            "Gagal membaca file: " +
            error.message
        );
    }
}


/* =========================================================
   DATA CONTOH
========================================================= */

function loadSampleData() {

    const sample = [

        {
            Timestamp:
                "15/09/2026 12:42:52",

            "Unit UP3":
                "UP3 Mamuju",

            "Unit ULP":
                "ULP Pasangkayu",

            "NAMA PERANGKAT CCTV":
                "ULP Pasangkayu",

            "Nama Pekerjaan":
                "Pembersihan Jaringan",

            "Lokasi Pekerjaan":
                "Pasangkayu",

            "Petugas Pelaksana di Lapangan":
                "Admin",

            "Dokumentasi CCTV":
                ""
        },


        {
            Timestamp:
                "15/09/2026 11:54:42",

            "Unit UP3":
                "UP3 Bulukumba",

            "Unit ULP":
                "ULP Sinjai",

            "NAMA PERANGKAT CCTV":
                "UP3BLK-ULP SINJAI",

            "Nama Pekerjaan":
                "Pemeriksaan CCTV",

            "Lokasi Pekerjaan":
                "Sinjai",

            "Petugas Pelaksana di Lapangan":
                "Petugas Lapangan",

            "Dokumentasi CCTV":
                ""
        }

    ];


    DATA =
        sample.map(
            normalizeRow
        );


    afterDataLoaded(
        "Data contoh berhasil dimuat."
    );
}


/* =========================================================
   CLEAR DATA
========================================================= */

function clearData() {

    DATA = [];


    localStorage.removeItem(
        STORAGE_URL
    );


    $("totalData").textContent =
        "0";

    $("todayData").textContent =
        "0";

    $("totalCctv").textContent =
        "0";

    $("totalUnit").textContent =
        "0";


    $("dataActive").textContent =
        "0";


    $("dataStatus").textContent =
        "Belum terhubung";


    $("recentList").innerHTML =
        `<div class="empty-state">
            Belum ada data.
         </div>`;


    $("monitoringTable").innerHTML =
        "";


    $("laporanTable").innerHTML =
        "";


    destroyChart("line");

    destroyChart("unit");


    setStatus(
        "Data telah dihapus."
    );
}


/* =========================================================
   GLOBAL SEARCH
========================================================= */

function globalSearch(value) {

    if (!value.trim()) {

        if (currentView === "monitoring") {

            renderMonitoring();
        }


        if (currentView === "laporan") {

            renderLaporan();
        }

        return;
    }


    /*
       Jika sedang Dashboard,
       arahkan pencarian ke Data Laporan.
    */

    if (
        currentView === "dashboard"
    ) {

        showView("laporan");
    }


    if (
        currentView === "monitoring"
    ) {

        renderMonitoring(value);
    }


    if (
        currentView === "laporan"
    ) {

        renderLaporan(value);
    }

}


/* =========================================================
   EVENT LISTENER
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {


        /* NAVIGATION */

        document
            .querySelectorAll(
                ".nav-link"
            )
            .forEach(link => {

                link.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();

                        showView(
                            link.dataset.view
                        );

                    }
                );

            });


        /* Lihat semua */

        document
            .querySelectorAll(
                "[data-view-link]"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        showView(
                            button.dataset.viewLink
                        );

                    }
                );

            });


        /* SIDEBAR */

        $("sidebarToggle")
            .addEventListener(
                "click",
                () => {

                    $("sidebar")
                        .classList.toggle(
                            "open"
                        );

                }
            );


        $("mobileMenu")
            .addEventListener(
                "click",
                () => {

                    $("sidebar")
                        .classList.toggle(
                            "open"
                        );

                }
            );


        /* THEME */

        $("themeToggle")
            .addEventListener(
                "click",
                () => {

                    document.body
                        .classList.toggle(
                            "dark"
                        );


                    const dark =
                        document.body
                            .classList
                            .contains(
                                "dark"
                            );


                    localStorage.setItem(
                        "cctv_theme",
                        dark
                            ? "dark"
                            : "light"
                    );


                    $("themeToggle")
                        .textContent =
                            dark
                                ? "☀"
                                : "☾";

                }
            );


        /* SETTINGS */

        $("settingsBtn")
            .addEventListener(
                "click",
                openDrawer
            );


        $("settingsBtnLaporan")
            .addEventListener(
                "click",
                openDrawer
            );


        $("closeDrawer")
            .addEventListener(
                "click",
                closeDrawer
            );


        $("drawerOverlay")
            .addEventListener(
                "click",
                closeDrawer
            );


        /* URL INPUT */

        const savedUrl =
            localStorage.getItem(
                STORAGE_URL
            );


        $("csvUrlInput").value =
            savedUrl ||
            DEFAULT_CSV_URL;


        /* LOAD URL */

        $("loadUrlBtn")
            .addEventListener(
                "click",
                async () => {

                    try {

                        await loadFromURL(
                            $("csvUrlInput").value.trim()
                        );

                    } catch (error) {

                        console.error(error);

                        setStatus(
                            "Gagal memuat data: " +
                            error.message
                        );
                    }

                }
            );


        /* REFRESH */

        async function refreshData() {

            const url =
                $("csvUrlInput")
                    .value
                    .trim();


            try {

                await loadFromURL(
                    url,
                    true
                );

            } catch (error) {

                console.error(error);

                setStatus(
                    "Refresh gagal: " +
                    error.message
                );
            }
        }


        $("refreshBtn")
            .addEventListener(
                "click",
                refreshData
            );


        $("refreshBtnMain")
            .addEventListener(
                "click",
                refreshData
            );


        /* FILE */

        $("fileInput")
            .addEventListener(
                "change",
                event => {

                    const file =
                        event.target
                            .files[0];

                    loadLocalFile(file);

                }
            );


        /* PASTE */

        $("loadPasteBtn")
            .addEventListener(
                "click",
                async () => {

                    const text =
                        $("csvPasteInput")
                            .value
                            .trim();


                    if (!text) {

                        alert(
                            "Tempel data CSV terlebih dahulu."
                        );

                        return;
                    }


                    try {

                        const rows =
                            await parseCSV(
                                text
                            );


                        DATA =
                            rows
                                .map(
                                    normalizeRow
                                )
                                .filter(
                                    row =>
                                        row.timestamp !== "-" ||
                                        row.up3 !== "-" ||
                                        row.ulp !== "-" ||
                                        row.device !== "-"
                                );


                        afterDataLoaded(
                            `Berhasil memuat ${DATA.length} data.`
                        );


                    } catch (error) {

                        setStatus(
                            "Gagal membaca CSV."
                        );
                    }

                }
            );


        /* SAMPLE */

        $("sampleBtn")
            .addEventListener(
                "click",
                loadSampleData
            );


        /* CLEAR */

        $("clearBtn")
            .addEventListener(
                "click",
                clearData
            );


        /* EXPORT */

        $("exportBtn")
            .addEventListener(
                "click",
                exportCSV
            );


        /* SEARCH MONITORING */

        $("monitoringSearch")
            .addEventListener(
                "input",
                event => {

                    renderMonitoring(
                        event.target.value
                    );

                }
            );


        /* SEARCH LAPORAN */

        $("laporanSearch")
            .addEventListener(
                "input",
                event => {

                    renderLaporan(
                        event.target.value
                    );

                }
            );


        /* GLOBAL SEARCH */

        $("globalSearch")
            .addEventListener(
                "input",
                event => {

                    globalSearch(
                        event.target.value
                    );

                }
            );


        /* THEME SAVED */

        const savedTheme =
            localStorage.getItem(
                "cctv_theme"
            );


        if (
            savedTheme === "dark"
        ) {

            document.body
                .classList
                .add("dark");


            $("themeToggle")
                .textContent = "☀";
        }


        /*
           LOAD DATA OTOMATIS
        */

        loadFromURL(
            savedUrl ||
            DEFAULT_CSV_URL,
            false
        )
        .catch(error => {

            console.warn(
                "Data otomatis gagal dimuat:",
                error
            );


            setStatus(
                "Belum berhasil terhubung ke Spreadsheet. Gunakan tombol ⚙ untuk mencoba lagi."
            );

        });

    }
);
