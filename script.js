```javascript
/* =========================================================
   LOGSHEET MONITORING CCTV ONLINE UID SSTB
   ========================================================= */


/* =========================================================
   KONFIGURASI GOOGLE SPREADSHEET
   =========================================================

   GANTI DENGAN URL CSV GOOGLE SHEETS KAMU.

   Contoh:
   https://docs.google.com/spreadsheets/d/ID/edit#gid=0

   Bisa menggunakan format:
   https://docs.google.com/spreadsheets/d/ID/gviz/tq?tqx=out:csv&gid=0
========================================================= */

const SHEET_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQWRM7E3rtMsJVWf9z1cntdblP4nSP9p0QCC6DeEbVt_3MHbjicUDgP2AsgLPV-NaNAYH3YZfDwFXhI/pub?output=csv';


/* =========================================================
   VARIABEL GLOBAL
========================================================= */

let allRows = [];

let normalizedRows = [];

let currentKelolaRows = [];

let currentDirektoriRows = [];


/* =========================================================
   HEADER MAP
========================================================= */

const HEADER_MAP = {

    'timestamp': 'timestamp',
    'tanggal': 'timestamp',
    'tanggal pekerjaan': 'timestamp',
    'waktu': 'timestamp',
    'date': 'timestamp',

    'up3': 'up3',
    'unit up3': 'up3',

    'ulp': 'ulp',
    'unit ulp': 'ulp',

    'perangkat': 'perangkat',
    'nama perangkat': 'perangkat',
    'cctv': 'perangkat',
    'nama cctv': 'perangkat',

    'pekerjaan': 'pekerjaan',
    'jenis pekerjaan': 'pekerjaan',
    'kegiatan': 'pekerjaan',

    'lokasi': 'lokasi',
    'alamat': 'lokasi',

    'petugas': 'petugas',
    'nama petugas': 'petugas',
    'teknisi': 'petugas',

    'dokumentasi cctv': 'dokumentasi',
    'dokumentasi': 'dokumentasi',
    'link': 'dokumentasi',
    'foto': 'dokumentasi'
};


/* =========================================================
   ESCAPE HTML
========================================================= */

function esc(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

}


/* =========================================================
   NORMALIZE HEADER
========================================================= */

function normalizeHeader(value) {

    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

}


/* =========================================================
   NORMALIZE ROW
========================================================= */

function normalizeRows(rows) {

    if (!Array.isArray(rows)) {
        return [];
    }


    return rows.map(row => {

        const result = {

            timestamp: '',
            up3: '',
            ulp: '',
            perangkat: '',
            pekerjaan: '',
            lokasi: '',
            petugas: '',
            dokumentasi: ''

        };


        Object.keys(row || {}).forEach(key => {

            const normalizedHeader =
                normalizeHeader(key);

            const mappedField =
                HEADER_MAP[normalizedHeader];


            if (mappedField) {

                result[mappedField] =
                    row[key] ?? '';

            }

        });


        result._date =
            parseTimestamp(result.timestamp);


        return result;

    });

}


/* =========================================================
   PARSE TIMESTAMP
========================================================= */

function parseTimestamp(value) {

    if (!value) {
        return null;
    }


    if (value instanceof Date) {
        return value;
    }


    const text =
        String(value).trim();


    if (!text) {
        return null;
    }


    let date =
        new Date(text);


    if (!isNaN(date.getTime())) {
        return date;
    }


    /*
       Format:
       DD/MM/YYYY HH:mm:ss
    */

    const match =
        text.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
        );


    if (match) {

        const day =
            Number(match[1]);

        const month =
            Number(match[2]) - 1;

        const year =
            Number(match[3]);

        const hour =
            Number(match[4] || 0);

        const minute =
            Number(match[5] || 0);

        const second =
            Number(match[6] || 0);


        return new Date(
            year,
            month,
            day,
            hour,
            minute,
            second
        );

    }


    return null;

}


/* =========================================================
   FORMAT TANGGAL
========================================================= */

function fmtDate(row) {

    const raw =
        row?.timestamp ?? '';


    const date =
        row?._date ||
        parseTimestamp(raw);


    if (!date) {
        return raw;
    }


    const tanggal =
        String(date.getDate()).padStart(2, '0');


    const bulan =
        String(date.getMonth() + 1)
            .padStart(2, '0');


    const tahun =
        date.getFullYear();


    const jam =
        String(date.getHours())
            .padStart(2, '0');


    const menit =
        String(date.getMinutes())
            .padStart(2, '0');


    const detik =
        String(date.getSeconds())
            .padStart(2, '0');


    return `${tanggal}/${bulan}/${tahun} ${jam}:${menit}:${detik}`;

}


/* =========================================================
   GOOGLE DRIVE FILE ID
========================================================= */

function getDriveFileId(url) {

    if (!url) {
        return null;
    }


    const value =
        String(url).trim();


    try {

        const u =
            new URL(value);


        /*
           Format:
           https://drive.google.com/file/d/FILE_ID/view
        */

        let match =
            u.pathname.match(
                /\/file\/d\/([a-zA-Z0-9_-]+)/
            );


        if (match) {
            return match[1];
        }


        /*
           Format:
           https://drive.google.com/open?id=FILE_ID
        */

        const id =
            u.searchParams.get('id');


        if (id) {
            return id;
        }


        /*
           Format lain:
           /d/FILE_ID
        */

        match =
            u.pathname.match(
                /\/d\/([a-zA-Z0-9_-]+)/
            );


        if (match) {
            return match[1];
        }

    } catch (error) {

        console.warn(
            'URL dokumentasi tidak valid:',
            url
        );

    }


    const match =
        value.match(
            /(?:\/d\/|id=)([a-zA-Z0-9_-]+)/
        );


    return match
        ? match[1]
        : null;

}


/* =========================================================
   URL GAMBAR DOKUMENTASI
========================================================= */

function getDocumentationImageUrl(url) {

    const driveId =
        getDriveFileId(url);


    /*
       Jika Google Drive
    */

    if (driveId) {

        return (
            'https://drive.google.com/thumbnail' +
            '?id=' +
            encodeURIComponent(driveId) +
            '&sz=w800'
        );

    }


    /*
       Jika URL gambar langsung
    */

    return String(url || '').trim();

}


/* =========================================================
   RENDER DOKUMENTASI
========================================================= */

function renderDocumentationCell(url) {

    if (!url) {

        return `
            <span class="muted">
                Tidak ada
            </span>
        `;

    }


    const safeUrl =
        esc(url);


    const imageUrl =
        esc(
            getDocumentationImageUrl(url)
        );


    return `

        <div class="doc-cell">

            <a
                href="${safeUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="doc-image-link"
            >

                <img
                    src="${imageUrl}"
                    alt="Dokumentasi pekerjaan"
                    class="doc-thumb"
                    loading="lazy"
                    onerror="
                        this.style.display='none';

                        const fallback =
                        this.parentElement.nextElementSibling;

                        if (fallback) {
                            fallback.style.display =
                            'inline-flex';
                        }
                    "
                >

            </a>


            <a
                href="${safeUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="link-btn doc-fallback"
                style="display:none;"
            >
                ↗ Buka
            </a>

        </div>

    `;

}


/* =========================================================
   LOAD GOOGLE SHEETS
========================================================= */

function loadSpreadsheet() {

    if (
        !SHEET_URL ||
        SHEET_URL.includes(
            'MASUKKAN_URL'
        )
    ) {

        setConnectionStatus(
            false,
            'URL Spreadsheet belum diatur'
        );

        return;

    }


    setConnectionStatus(
        true,
        'Memuat data...'
    );


    Papa.parse(
        SHEET_URL,
        {

            download: true,

            header: true,

            skipEmptyLines: true,

            complete: function(results) {

                console.log(
                    'Data Spreadsheet:',
                    results.data
                );


                allRows =
                    Array.isArray(results.data)
                        ? results.data
                        : [];


                /*
                   PENTING:

                   Semua data spreadsheet
                   tetap dinormalisasi.

                   TIDAK ADA FILTER
                   dokumentasi di sini.
                */

                normalizedRows =
                    normalizeRows(allRows);


                /*
                   Semua data masuk
                   ke Log Pekerjaan.
                */

                currentKelolaRows =
                    [...normalizedRows];


                currentDirektoriRows =
                    [...normalizedRows];


                updateDashboard();


                renderKelolaTable(
                    currentKelolaRows
                );


                renderDirektoriView(
                    currentDirektoriRows
                );


                setConnectionStatus(
                    true,
                    `${normalizedRows.length} data`
                );

            },


            error: function(error) {

                console.error(
                    'Gagal membaca spreadsheet:',
                    error
                );


                setConnectionStatus(
                    false,
                    'Gagal memuat data'
                );

            }

        }
    );

}


/* =========================================================
   STATUS KONEKSI
========================================================= */

function setConnectionStatus(
    connected,
    text
) {

    const dot =
        document.getElementById(
            'connectionDot'
        );


    const label =
        document.getElementById(
            'connectionText'
        );


    if (label) {
        label.textContent = text;
    }


    if (dot) {

        dot.classList.toggle(
            'online',
            connected
        );

    }

}


/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {

    const totalData =
        document.getElementById(
            'totalData'
        );


    const totalCCTV =
        document.getElementById(
            'totalCCTV'
        );


    const totalPekerjaan =
        document.getElementById(
            'totalPekerjaan'
        );


    const lastUpdate =
        document.getElementById(
            'lastUpdate'
        );


    if (totalData) {

        totalData.textContent =
            normalizedRows.length;

    }


    const cctvSet =
        new Set();


    normalizedRows.forEach(row => {

        if (row.perangkat) {

            cctvSet.add(
                String(row.perangkat)
                    .trim()
            );

        }

    });


    if (totalCCTV) {

        totalCCTV.textContent =
            cctvSet.size;

    }


    if (totalPekerjaan) {

        const pekerjaanSet =
            new Set();


        normalizedRows.forEach(row => {

            if (row.pekerjaan) {

                pekerjaanSet.add(
                    String(row.pekerjaan)
                        .trim()
                );

            }

        });


        totalPekerjaan.textContent =
            pekerjaanSet.size;

    }


    if (lastUpdate) {

        if (normalizedRows.length) {

            const sorted =
                [...normalizedRows]
                    .sort(
                        (a, b) => {

                            const da =
                                a._date
                                    ? a._date.getTime()
                                    : 0;

                            const db =
                                b._date
                                    ? b._date.getTime()
                                    : 0;

                            return db - da;

                        }
                    );


            lastUpdate.textContent =
                fmtDate(sorted[0]);

        } else {

            lastUpdate.textContent =
                '-';

        }

    }


    renderDashboardTable();

    updateRekap();

}


/* =========================================================
   DASHBOARD TABLE
========================================================= */

function renderDashboardTable() {

    const tbody =
        document.querySelector(
            '#dashboardTable tbody'
        );


    if (!tbody) {
        return;
    }


    const rows =
        [...normalizedRows]
            .sort(
                (a, b) => {

                    const da =
                        a._date
                            ? a._date.getTime()
                            : 0;

                    const db =
                        b._date
                            ? b._date.getTime()
                            : 0;

                    return db - da;

                }
            )
            .slice(0, 10);


    if (!rows.length) {

        tbody.innerHTML = `

            <tr>
                <td
                    colspan="6"
                    class="empty-cell"
                >
                    Tidak ada data.
                </td>
            </tr>

        `;

        return;

    }


    tbody.innerHTML =
        rows.map(row => `

            <tr>

                <td>
                    ${esc(fmtDate(row))}
                </td>

                <td>
                    ${esc(row.up3)}
                </td>

                <td>
                    ${esc(row.ulp)}
                </td>

                <td>
                    ${esc(row.perangkat)}
                </td>

                <td>
                    ${esc(row.pekerjaan)}
                </td>

                <td>
                    ${esc(row.petugas)}
                </td>

            </tr>

        `).join('');

}


/* =========================================================
   LOG PEKERJAAN
========================================================= */

function renderKelolaDataView() {

    /*
       PENTING:

       Jangan filter berdasarkan dokumentasi.

       Semua data spreadsheet ditampilkan.
    */

    currentKelolaRows =
        [...normalizedRows];


    renderKelolaTable(
        currentKelolaRows
    );

}


/* =========================================================
   TABEL LOG PEKERJAAN
========================================================= */

function renderKelolaTable(rows) {

    const tbody =
        document.querySelector(
            '#kelolaTable tbody'
        );


    if (!tbody) {
        return;
    }


    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {

        tbody.innerHTML = `

            <tr>

                <td
                    colspan="8"
                    class="empty-cell"
                >
                    Tidak ada data.
                </td>

            </tr>

        `;

        return;

    }


    tbody.innerHTML =
        rows.map(row => `

            <tr>

                <td>
                    ${esc(fmtDate(row))}
                </td>


                <td>
                    ${esc(row.up3 || '')}
                </td>


                <td>
                    ${esc(row.ulp || '')}
                </td>


                <td>
                    ${esc(row.perangkat || '')}
                </td>


                <td>
                    ${esc(row.pekerjaan || '')}
                </td>


                <td>
                    ${esc(row.lokasi || '')}
                </td>


                <td>
                    ${esc(row.petugas || '')}
                </td>


                <td>
                    ${renderDocumentationCell(
                        row.dokumentasi || ''
                    )}
                </td>

            </tr>

        `).join('');

}


/* =========================================================
   DIREKTORI CCTV
========================================================= */

function renderDirektoriView(rows) {

    const tbody =
        document.querySelector(
            '#direktoriTable tbody'
        );


    if (!tbody) {
        return;
    }


    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {

        tbody.innerHTML = `

            <tr>

                <td
                    colspan="7"
                    class="empty-cell"
                >
                    Tidak ada data.
                </td>

            </tr>

        `;

        return;

    }


    tbody.innerHTML =
        rows.map(row => `

            <tr>

                <td>
                    ${esc(fmtDate(row))}
                </td>

                <td>
                    ${esc(row.up3 || '')}
                </td>

                <td>
                    ${esc(row.ulp || '')}
                </td>

                <td>
                    ${esc(row.perangkat || '')}
                </td>

                <td>
                    ${esc(row.lokasi || '')}
                </td>

                <td>
                    ${esc(row.petugas || '')}
                </td>

                <td>
                    ${renderDocumentationCell(
                        row.dokumentasi || ''
                    )}
                </td>

            </tr>

        `).join('');

}


/* =========================================================
   SEARCH LOG PEKERJAAN
========================================================= */

function setupKelolaSearch() {

    const search =
        document.getElementById(
            'kelolaSearch'
        );


    if (!search) {
        return;
    }


    search.addEventListener(
        'input',
        function() {

            const keyword =
                this.value
                    .toLowerCase()
                    .trim();


            if (!keyword) {

                currentKelolaRows =
                    [...normalizedRows];

            } else {

                currentKelolaRows =
                    normalizedRows.filter(
                        row => {

                            return [

                                row.timestamp,

                                row.up3,

                                row.ulp,

                                row.perangkat,

                                row.pekerjaan,

                                row.lokasi,

                                row.petugas,

                                row.dokumentasi

                            ]
                            .join(' ')
                            .toLowerCase()
                            .includes(
                                keyword
                            );

                        }
                    );

            }


            renderKelolaTable(
                currentKelolaRows
            );

        }
    );

}


/* =========================================================
   SEARCH DIREKTORI
========================================================= */

function setupDirektoriSearch() {

    const search =
        document.getElementById(
            'direktoriSearch'
        );


    if (!search) {
        return;
    }


    search.addEventListener(
        'input',
        function() {

            const keyword =
                this.value
                    .toLowerCase()
                    .trim();


            if (!keyword) {

                currentDirektoriRows =
                    [...normalizedRows];

            } else {

                currentDirektoriRows =
                    normalizedRows.filter(
                        row => {

                            return [

                                row.timestamp,

                                row.up3,

                                row.ulp,

                                row.perangkat,

                                row.lokasi,

                                row.petugas,

                                row.dokumentasi

                            ]
                            .join(' ')
                            .toLowerCase()
                            .includes(
                                keyword
                            );

                        }
                    );

            }


            renderDirektoriView(
                currentDirektoriRows
            );

        }
    );

}


/* =========================================================
   EXPORT CSV
========================================================= */

function setupExport() {

    const button =
        document.getElementById(
            'kelolaExportBtn'
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        'click',
        function() {

            if (
                !currentKelolaRows.length
            ) {

                alert(
                    'Tidak ada data untuk diekspor.'
                );

                return;

            }


            const exportRows =
                currentKelolaRows.map(
                    row => ({

                        Tanggal:
                            fmtDate(row),

                        UP3:
                            row.up3 || '',

                        ULP:
                            row.ulp || '',

                        Perangkat:
                            row.perangkat || '',

                        Pekerjaan:
                            row.pekerjaan || '',

                        Lokasi:
                            row.lokasi || '',

                        Petugas:
                            row.petugas || '',

                        Dokumentasi:
                            row.dokumentasi || ''

                    })
                );


            const worksheet =
                XLSX.utils.json_to_sheet(
                    exportRows
                );


            const workbook =
                XLSX.utils.book_new();


            XLSX.utils.book_append_sheet(
                workbook,
                worksheet,
                'Log Pekerjaan'
            );


            XLSX.writeFile(
                workbook,
                'log-pekerjaan-cctv.xlsx'
            );

        }
    );

}


/* =========================================================
   NAVIGASI VIEW
========================================================= */

const VIEW_RENDERERS = {

    'dashboard':
        function() {

            updateDashboard();

        },


    'cctv-direktori':
        function() {

            currentDirektoriRows =
                [...normalizedRows];

            renderDirektoriView(
                currentDirektoriRows
            );

        },


    /*
       INI YANG PALING PENTING.

       Menu:
       data-view="pekerjaan-log"

       diarahkan ke:
       renderKelolaDataView()
    */

    'pekerjaan-log':
        renderKelolaDataView,


    'laporan-rekap':
        updateRekap

};


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

    const links =
        document.querySelectorAll(
            '.nav-link'
        );


    links.forEach(link => {

        link.addEventListener(
            'click',
            function(event) {

                event.preventDefault();


                const viewName =
                    this.dataset.view;


                if (!viewName) {
                    return;
                }


                /*
                   Active menu
                */

                links.forEach(item => {

                    item.classList.remove(
                        'active'
                    );

                });


                this.classList.add(
                    'active'
                );


                /*
                   Hide semua view
                */

                document
                    .querySelectorAll('.view')
                    .forEach(view => {

                        view.classList.remove(
                            'active'
                        );

                    });


                /*
                   Tampilkan view yang dipilih
                */

                const target =
                    document.getElementById(
                        `view-${viewName}`
                    );


                if (target) {

                    target.classList.add(
                        'active'
                    );

                }


                /*
                   Judul halaman
                */

                const titleMap = {

                    'dashboard':
                        'Dashboard',

                    'cctv-direktori':
                        'Direktori CCTV',

                    'pekerjaan-log':
                        'Log Pekerjaan',

                    'laporan-rekap':
                        'Rekap Laporan'

                };


                const title =
                    document.getElementById(
                        'topTitle'
                    );


                if (title) {

                    title.textContent =
                        titleMap[viewName] ||
                        viewName;

                }


                /*
                   Jalankan renderer
                */

                const renderer =
                    VIEW_RENDERERS[
                        viewName
                    ];


                if (typeof renderer === 'function') {

                    renderer();

                }

            }
        );

    });

}


/* =========================================================
   REKAP
========================================================= */

function updateRekap() {

    const pekerjaan =
        document.getElementById(
            'rekapPekerjaan'
        );


    const up3 =
        document.getElementById(
            'rekapUP3'
        );


    const ulp =
        document.getElementById(
            'rekapULP'
        );


    const pekerjaanSet =
        new Set();


    const up3Set =
        new Set();


    const ulpSet =
        new Set();


    normalizedRows.forEach(row => {

        if (row.pekerjaan) {

            pekerjaanSet.add(
                String(row.pekerjaan)
                    .trim()
            );

        }


        if (row.up3) {

            up3Set.add(
                String(row.up3)
                    .trim()
            );

        }


        if (row.ulp) {

            ulpSet.add(
                String(row.ulp)
                    .trim()
            );

        }

    });


    if (pekerjaan) {

        pekerjaan.textContent =
            pekerjaanSet.size;

    }


    if (up3) {

        up3.textContent =
            up3Set.size;

    }


    if (ulp) {

        ulp.textContent =
            ulpSet.size;

    }

}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    function() {

        setupNavigation();

        setupKelolaSearch();

        setupDirektoriSearch();

        setupExport();

        /*
           Load data spreadsheet
        */

        loadSpreadsheet();

    }
);
```
