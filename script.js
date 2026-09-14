```javascript
/* =========================================================
   LOGSHEET MONITORING CCTV ONLINE UID SSTB
   ========================================================= */


/* =========================================================
   URL GOOGLE SHEETS
   =========================================================

   GANTI BAGIAN INI DENGAN URL CSV SPREADSHEET KAMU.

   Contoh:

   https://docs.google.com/spreadsheets/d/ID/gviz/tq?tqx=out:csv&gid=0
========================================================= */

const SHEET_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQWRM7E3rtMsJVWf9z1cntdblP4nSP9p0QCC6DeEbVt_3MHbjicUDgP2AsgLPV-NaNAYH3YZfDwFXhI/pub?output=csv';



/* =========================================================
   GLOBAL DATA
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
   NORMALIZE DATA
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


        Object.keys(row || {})
            .forEach(key => {


                const header =
                    normalizeHeader(key);


                const field =
                    HEADER_MAP[header];


                if (field) {

                    result[field] =
                        row[key] ?? '';

                }


            });


        result._date =
            parseTimestamp(
                result.timestamp
            );


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
   FORMAT TANGGAL + JAM
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
        String(
            date.getDate()
        ).padStart(2, '0');


    const bulan =
        String(
            date.getMonth() + 1
        ).padStart(2, '0');


    const tahun =
        date.getFullYear();


    const jam =
        String(
            date.getHours()
        ).padStart(2, '0');


    const menit =
        String(
            date.getMinutes()
        ).padStart(2, '0');


    const detik =
        String(
            date.getSeconds()
        ).padStart(2, '0');


    return (
        `${tanggal}/${bulan}/${tahun} ` +
        `${jam}:${menit}:${detik}`
    );

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
           FORMAT:

           drive.google.com/file/d/FILE_ID/view
        */

        let match =
            u.pathname.match(
                /\/file\/d\/([a-zA-Z0-9_-]+)/
            );


        if (match) {

            return match[1];

        }


        /*
           FORMAT:

           drive.google.com/open?id=FILE_ID
        */

        const id =
            u.searchParams.get('id');


        if (id) {

            return id;

        }


        /*
           FORMAT:

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


    const fallback =
        value.match(
            /(?:\/d\/|id=)([a-zA-Z0-9_-]+)/
        );


    return fallback
        ? fallback[1]
        : null;

}



/* =========================================================
   GOOGLE DRIVE IMAGE URL
========================================================= */

function getDocumentationImageUrl(url) {


    const driveId =
        getDriveFileId(url);


    if (driveId) {


        return (
            'https://drive.google.com/thumbnail' +
            '?id=' +
            encodeURIComponent(driveId) +
            '&sz=w800'
        );


    }


    /*
       Jika URL merupakan URL gambar
       secara langsung.
    */

    return String(
        url || ''
    ).trim();

}



/* =========================================================
   DOKUMENTASI CELL
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
                title="Klik untuk membuka dokumentasi"
            >


                <img
                    src="${imageUrl}"
                    alt="Dokumentasi pekerjaan"
                    class="doc-thumb"
                    loading="lazy"

                    onerror="
                        this.style.display='none';

                        const fallback =
                            this.parentElement
                                .nextElementSibling;

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
   LOAD GOOGLE SPREADSHEET
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
                    'DATA SPREADSHEET:',
                    results.data
                );


                allRows =
                    Array.isArray(
                        results.data
                    )
                        ? results.data
                        : [];


                /*
                   SEMUA DATA DARI SPREADSHEET
                   DISIMPAN.

                   TIDAK ADA FILTER
                   DOKUMENTASI.
                */

                normalizedRows =
                    normalizeRows(
                        allRows
                    );


                /*
                   SEMUA DATA MASUK
                   KE LOG PEKERJAAN.
                */

                currentKelolaRows =
                    [
                        ...normalizedRows
                    ];


                currentDirektoriRows =
                    [
                        ...normalizedRows
                    ];


                updateDashboard();


                renderKelolaTable(
                    currentKelolaRows
                );


                updateJumlahPekerja(
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
                    'Gagal membaca Spreadsheet:',
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

        label.textContent =
            text;

    }


    if (dot) {

        dot.classList.toggle(
            'online',
            connected
        );

    }

}



/* =========================================================
   UPDATE DASHBOARD
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


    normalizedRows.forEach(
        row => {


            if (row.perangkat) {

                cctvSet.add(
                    String(
                        row.perangkat
                    ).trim()
                );

            }


        }
    );


    if (totalCCTV) {

        totalCCTV.textContent =
            cctvSet.size;

    }


    const pekerjaanSet =
        new Set();


    normalizedRows.forEach(
        row => {


            if (row.pekerjaan) {

                pekerjaanSet.add(
                    String(
                        row.pekerjaan
                    ).trim()
                );

            }


        }
    );


    if (totalPekerjaan) {

        totalPekerjaan.textContent =
            pekerjaanSet.size;

    }


    if (
        lastUpdate &&
        normalizedRows.length
    ) {


        const sorted =
            [
                ...normalizedRows
            ].sort(
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
            fmtDate(
                sorted[0]
            );


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
        [
            ...normalizedRows
        ]
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
                    class="empty-cell">

                    Tidak ada data.

                </td>

            </tr>

        `;


        return;

    }


    tbody.innerHTML =
        rows.map(
            row => `

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
                        ${esc(row.petugas || '')}
                    </td>

                </tr>

            `
        ).join('');

}



/* =========================================================
   LOG PEKERJAAN VIEW
========================================================= */

function renderKelolaDataView() {


    /*
       SEMUA DATA.

       TIDAK BOLEH:

       filter(r => r.dokumentasi)
    */

    currentKelolaRows =
        [
            ...normalizedRows
        ];


    renderKelolaTable(
        currentKelolaRows
    );


    updateJumlahPekerja(
        currentKelolaRows
    );

}



/* =========================================================
   LOG PEKERJAAN TABLE
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
                    class="empty-cell">

                    Tidak ada data.

                </td>

            </tr>

        `;


        return;

    }


    tbody.innerHTML =
        rows.map(
            row => `

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

            `
        ).join('');

}



/* =========================================================
   JUMLAH PEKERJA
========================================================= */

function updateJumlahPekerja(rows) {


    const element =
        document.getElementById(
            'jumlahPekerja'
        );


    if (!element) {
        return;
    }


    const pekerjaSet =
        new Set();


    (rows || []).forEach(
        row => {


            const nama =
                String(
                    row.petugas || ''
                ).trim();


            if (nama) {

                pekerjaSet.add(
                    nama
                );

            }


        }
    );


    element.textContent =
        pekerjaSet.size;

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
                    class="empty-cell">

                    Tidak ada data.

                </td>

            </tr>

        `;


        return;

    }


    tbody.innerHTML =
        rows.map(
            row => `

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

            `
        ).join('');

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
                    [
                        ...normalizedRows
                    ];


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


            updateJumlahPekerja(
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
                    [
                        ...normalizedRows
                    ];


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
   EXPORT
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


    normalizedRows.forEach(
        row => {


            if (row.pekerjaan) {

                pekerjaanSet.add(
                    String(
                        row.pekerjaan
                    ).trim()
                );

            }


            if (row.up3) {

                up3Set.add(
                    String(
                        row.up3
                    ).trim()
                );

            }


            if (row.ulp) {

                ulpSet.add(
                    String(
                        row.ulp
                    ).trim()
                );

            }


        }
    );


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
   VIEW RENDERERS
========================================================= */

const VIEW_RENDERERS = {


    'dashboard':
        function() {

            updateDashboard();

        },


    'cctv-direktori':
        function() {

            currentDirektoriRows =
                [
                    ...normalizedRows
                ];


            renderDirektoriView(
                currentDirektoriRows
            );

        },


    /*
       PENTING:

       data-view HTML:

       pekerjaan-log

       harus menuju:

       renderKelolaDataView
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


    links.forEach(
        link => {


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
                       ACTIVE MENU
                    */

                    links.forEach(
                        item => {

                            item.classList.remove(
                                'active'
                            );

                        }
                    );


                    this.classList.add(
                        'active'
                    );


                    /*
                       HIDE SEMUA VIEW
                    */

                    document
                        .querySelectorAll(
                            '.view'
                        )
                        .forEach(
                            view => {

                                view.classList.remove(
                                    'active'
                                );

                            }
                        );


                    /*
                       TAMPILKAN VIEW
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
                       JUDUL
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
                            titleMap[
                                viewName
                            ] ||
                            viewName;

                    }


                    /*
                       RENDER
                    */

                    const renderer =
                        VIEW_RENDERERS[
                            viewName
                        ];


                    if (
                        typeof renderer ===
                        'function'
                    ) {

                        renderer();

                    }


                }
            );


        }
    );

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
           LOAD DATA
        */

        loadSpreadsheet();


    }
);
```
