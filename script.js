/* ==================================================
   MASTER DATA — UP3 -> ULP mapping
   ================================================== */
const UNITS = [
    { no: 1, up3: 'Makassar', ulps: ['Mattoanging', 'Panakkukang', 'Maros', 'Gowa'] },
    { no: 2, up3: 'Mamuju', ulps: ['Mamuju Kota', 'Majene', 'Polewali'] },
    { no: 3, up3: 'Kendari', ulps: ['Kendari Kota', 'Wua-wua', 'Kolaka'] },
    { no: 4, up3: 'Palopo', ulps: ['Palopo Kota', 'Makale', 'Rantepao'] },
    { no: 5, up3: 'Parepare', ulps: ['Parepare Kota', 'Barru', 'Sidrap'] },
    { no: 6, up3: 'Bau-bau', ulps: ['Bau-bau Kota', 'Raha'] }
];

/* ==================================================
   APP CONSTANTS & STATE
   ================================================== */
// Masukkan link API / endpoint data spreadsheet Anda di sini
const API_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQWRM7E3rtMsJVWf9z1cntdblP4nSP9p0QCC6DeEbVt_3MHbjicUDgP2AsgLPV-NaNAYH3YZfDwFXhI/pub?output=csv'; 

let DATA = [];
let _up3Stats = [];
let charts = {};

const YM = '2026-09';
const TODAY = '2026-09-14';
const DMONTH = 30;

const ALL_UP3 = UNITS.map(u => u.up3);
const ALL_ULP = UNITS.flatMap(u => u.ulps);

/* ==================================================
   DOM HELPER
   ================================================== */
const $ = id => document.getElementById(id);

/**
 * Hitung jumlah hari unik suatu ULP aktif dalam bulan tertentu.
 */
function daysActive(up3Label, ulpLabel, ym) {
    const set = new Set(
        DATA
            .filter(d => d['Unit UP3'] === up3Label && d['Unit ULP'] === ulpLabel && d.Timestamp.startsWith(ym))
            .map(d => d.Timestamp.slice(0, 10))
    );
    return set.size;
}

function pctOf(n) {
    return Math.round(n / DMONTH * 100);
}

function grade(p) {
    if (p >= 90) return { cls: 'bg-g', t: 'Baik' };
    if (p >= 70) return { cls: 'bg-y', t: 'Cukup' };
    return { cls: 'bg-r', t: 'Perhatian' };
}

/** Helper function untuk memparsing CSV ke dalam array object */
function parseCSV(str) {
    const arr = [];
    let quote = false;
    let col = 0, row = 0;
    for (let c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
        if (cc == '"') { quote = !quote; continue; }
        if (cc == ',' && !quote) { ++col; continue; }
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }
        arr[row][col] += cc;
    }
    return arr;
}

function csvToObjects(csvText) {
    const lines = parseCSV(csvText);
    if (lines.length < 2) return [];
    const headers = lines[0].map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        // Skip baris kosong
        if (lines[i].length === 1 && lines[i][0].trim() === '') continue; 
        // Skip jika kolom pertama kosong dan panjang baris tidak sesuai
        if (lines[i].length < headers.length && lines[i][0].trim() === '') continue;

        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = lines[i][j] || '';
        }
        data.push(obj);
    }
    return data;
}

/* ==================================================
   INIT
   ================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    initSidebar();
    startClock();
    
    try {
        // Tarik data dari Google Sheets Publish to Web (CSV)
        const response = await fetch(API_URL);
        const text = await response.text();
        
        try {
            // Coba parse sebagai JSON terlebih dahulu (jika URL adalah get_data.php)
            const result = JSON.parse(text);
            if (result.status === 'success' && result.data) {
                DATA = result.data;
            } else if (Array.isArray(result)) {
                DATA = result;
            }
        } catch (e) {
            // Jika gagal parse JSON, asumsikan respons adalah teks CSV murni (dari Publish to Web)
            DATA = csvToObjects(text);
        }
        
    } catch (e) {
        console.error('Gagal mengambil data:', e);
    }

    navigate('dashboard');
});

/** Jalankan jam digital pada topbar dan sidebar. */
function startClock() {
    const tick = () => {
        const now = new Date();
        $('topClock').textContent = now.toLocaleTimeString('id-ID', { hour12: false });
        $('sbTime').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };
    tick();
    setInterval(tick, 1000);
}

/** Inisialisasi event listener sidebar (open/close & navigasi). */
function initSidebar() {
    $('menuBtn').onclick = () => $('sidebar').classList.add('open');
    $('sbClose').onclick = () => $('sidebar').classList.remove('open');

    $('navList').addEventListener('click', e => {
        const item = e.target.closest('.sb-item[data-page]');
        if (!item) return;

        $('navList').querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        if (window.innerWidth <= 820) $('sidebar').classList.remove('open');
        navigate(item.dataset.page);
    });
}

/* ==================================================
   ROUTER
   ================================================== */
function navigate(page) {
    const titles = {
        dashboard: 'Dashboard',
        monitoring: 'Monitoring Harian',
        grafik: 'Visualisasi Grafik',
        data_laporan: 'Data Laporan Pekerjaan'
    };
    $('pageTitle').textContent = titles[page] || page;

    const area = $('contentArea');
    area.innerHTML = '';
    Object.values(charts).forEach(c => c && c.destroy());
    charts = {};

    const tpl = $('tpl-' + page);
    if (!tpl) return;

    const clone = tpl.cloneNode(true);
    clone.id = '';
    clone.classList.add('page');
    area.appendChild(clone);

    if (page === 'dashboard') renderDashboard();
    if (page === 'monitoring') renderMonitoring();
    if (page === 'grafik') renderGrafik();
    if (page === 'data_laporan') renderDataLaporan();
}

/* ==================================================
   PAGE: DASHBOARD
   ================================================== */
function renderDashboard() {
    const aktBulan = DATA.filter(d => d.Timestamp.startsWith(YM)).length;

    const up3Stats = UNITS.map(grp => {
        const ulpPcts = grp.ulps.map(u => pctOf(daysActive(grp.up3, u, YM)));
        const avg = Math.round(ulpPcts.reduce((s, v) => s + v, 0) / ulpPcts.length);
        return { up3: grp.up3, avg, ulpPcts };
    });
    _up3Stats = up3Stats;

    const baik = up3Stats.filter(s => s.avg >= 90).length;
    const cukup = up3Stats.filter(s => s.avg >= 70 && s.avg < 90).length;
    const perhatian = up3Stats.filter(s => s.avg < 70).length;
    const todayUp3 = [...new Set(DATA.filter(d => d.Timestamp.startsWith(TODAY)).map(d => d['Unit UP3']))].length;
    const totalUP3 = UNITS.length;
    const avgGlobal = Math.round(up3Stats.reduce((s, u) => s + u.avg, 0) / totalUP3);

    $('k-up3').textContent = totalUP3;
    $('k-ulp').textContent = ALL_ULP.length;
    $('k-akt').textContent = aktBulan;
    $('k-kpt').textContent = avgGlobal + '%';

    $('s-baik').textContent = baik;
    $('s-cukup').textContent = cukup;
    $('s-perhatian').textContent = perhatian;
    $('s-today').textContent = todayUp3;

    requestAnimationFrame(() => {
        if ($('b-baik')) $('b-baik').style.width = (baik / totalUP3 * 100) + '%';
        if ($('b-cukup')) $('b-cukup').style.width = (cukup / totalUP3 * 100) + '%';
        if ($('b-perhatian')) $('b-perhatian').style.width = (perhatian / totalUP3 * 100) + '%';
        if ($('b-today')) $('b-today').style.width = (todayUp3 / totalUP3 * 100) + '%';
    });

    const sorted = [...up3Stats].sort((a, b) => b.avg - a.avg);
    const rl = $('rankList');
    if (rl) {
        rl.innerHTML = sorted.map((s, i) => {
            const g = grade(s.avg);
            return `
            <div class="rank-item rk${i + 1}">
                <div class="rank-no">${i + 1}</div>
                <div class="rank-info">
                    <div class="rank-name">${s.up3}</div>
                    <div class="rank-days">Rata-rata kepatuhan ULP</div>
                </div>
                <div class="rank-bar-w">
                    <div class="rank-bar"><div class="rank-bar-fill" style="width:${s.avg}%"></div></div>
                </div>
                <div class="rank-pct">${s.avg}%</div>
                <span class="badge ${g.cls}">${g.t}</span>
            </div>`;
        }).join('');
    }

    const fl = $('feedList');
    if (fl) {
        fl.innerHTML = DATA.slice(0, 7).map(d => {
            const ts = d.Timestamp.split(' ');
            const tgl = ts[0].split('-').reverse().join('/');
            const jam = ts[1] ? ts[1].slice(0, 5) : '';
            return `
            <div class="feed-item">
                <div class="feed-ico"><i class="fa-solid fa-video"></i></div>
                <div class="feed-body">
                    <div class="feed-title">${d['Unit UP3']} — ${d['Unit ULP']}</div>
                    <div class="feed-desc">${d['Nama Pekerjaan']} &bull; ${d['Nama Perangkat CCTV']}</div>
                    <div class="feed-time"><i class="fa-regular fa-clock"></i> ${tgl} pukul ${jam} &nbsp;&bull;&nbsp; ${d['Petugas Pelaksana di Lapangan']}</div>
                </div>
            </div>`;
        }).join('');
    }
}

/* ==================================================
   PAGE: MONITORING HARIAN
   ================================================== */
function renderMonitoring() {
    const YMsel = YM;
    const [yyyy, mm] = YMsel.split('-').map(Number);
    const nDays = new Date(yyyy, mm, 0).getDate();
    const today_num = TODAY.startsWith(YMsel) ? parseInt(TODAY.split('-')[2]) : 0;

    const head = $('monHead');
    if (head) {
        head.querySelectorAll('th:not(.th-no):not(.th-up3-h):not(.th-ulp-h)').forEach(t => t.remove());

        for (let d = 1; d <= nDays; d++) {
            const th = document.createElement('th');
            th.className = 'th-day';
            th.textContent = d;
            if (d === today_num) th.style.cssText = 'background:var(--primary-m);color:var(--primary)';
            head.appendChild(th);
        }

        head.innerHTML += `<th style="min-width:70px">PERSEN</th><th style="min-width:90px">STATUS</th>`;
    }

    const body = $('monBody');
    if (!body) return;

    let rows = '';

    UNITS.forEach(grp => {
        const nUlp = grp.ulps.length;

        grp.ulps.forEach((ulp, ui) => {
            const isFirst = ui === 0;
            const activeDays = new Set(
                DATA
                    .filter(d => d['Unit UP3'] === grp.up3 && d['Unit ULP'] === ulp && d.Timestamp.startsWith(YMsel))
                    .map(d => d.Timestamp.slice(0, 10))
            );
            const pct = Math.round(activeDays.size / nDays * 100);
            const g = grade(pct);

            let cells = '';
            for (let d = 1; d <= nDays; d++) {
                const ds = `${yyyy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const has = activeDays.has(ds);
                const isFuture = d > today_num && today_num > 0;
                cells += `<td class="td-day"><span class="mon-dot ${has ? 'on' : isFuture ? 'future' : 'off'}" title="${ds}: ${has ? 'Monitoring aktif' : 'Tidak ada data'}"></span></td>`;
            }

            rows += `<tr class="${isFirst ? 'group-start' : ''}">`;
            if (isFirst) {
                rows += `<td class="td-no" rowspan="${nUlp}">${grp.no}</td>`;
                rows += `<td class="td-up3" rowspan="${nUlp}">${grp.up3}</td>`;
            }
            rows += `<td class="td-ulp">${ulp}</td>`;
            rows += cells;
            rows += `<td class="td-pct">${pct}%</td>`;
            rows += `<td><span class="badge ${g.cls}">${g.t}</span></td>`;
            rows += '</tr>';
        });
    });

    body.innerHTML = rows;

    if ($('monTotal')) {
        $('monTotal').textContent = `${DATA.filter(d => d.Timestamp.startsWith(YMsel)).length} sesi`;
    }
}

/* ==================================================
   PAGE: DATA LAPORAN
   ================================================== */
let _filteredLaporanData = []; // To keep track of displayed data for modal clicking

function renderDataLaporan() {
    const body = $('tblLaporanBody');
    if (!body) return;

    const sorted = [...DATA].sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));

    const upBadgeColors = [
        { bg: '#EFF6FF', col: '#1D4ED8' }, { bg: '#F0FDF4', col: '#15803D' },
        { bg: '#FFF7ED', col: '#C2410C' }, { bg: '#FAF5FF', col: '#7E22CE' },
        { bg: '#FFF1F2', col: '#BE123C' }, { bg: '#F0FDFA', col: '#0F766E' },
        { bg: '#FEFCE8', col: '#A16207' }
    ];
    const up3List = UNITS.map(u => u.up3);

    const ddUp3 = $('dlFilterUp3');
    if (ddUp3 && ddUp3.options.length <= 1) {
        up3List.forEach(u => {
            const o = document.createElement('option');
            o.value = u;
            o.textContent = u;
            ddUp3.appendChild(o);
        });
    }

    const uniqUp3 = new Set(sorted.map(d => d['Unit UP3']));
    const uniqUlp = new Set(sorted.map(d => d['Unit ULP']));
    if ($('dl-total')) $('dl-total').textContent = sorted.length;
    if ($('dl-up3')) $('dl-up3').textContent = uniqUp3.size;
    if ($('dl-ulp')) $('dl-ulp').textContent = uniqUlp.size;
    if ($('dl-bln')) $('dl-bln').textContent = sorted.filter(d => d.Timestamp.startsWith(YM)).length;

    function buildRows(data) {
        _filteredLaporanData = data;
        if (!data.length) {
            body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--g400)"><i class="fa-solid fa-inbox" style="font-size:28px;display:block;margin-bottom:10px"></i>Tidak ada data ditemukan</td></tr>`;
            if ($('dl-count-label')) $('dl-count-label').textContent = 'Menampilkan 0 data';
            return;
        }

        let html = '';
        data.forEach((d, idx) => {
            const dObj = new Date(d.Timestamp);
            const dStr = `${String(dObj.getDate()).padStart(2, '0')}/${String(dObj.getMonth() + 1).padStart(2, '0')}/${dObj.getFullYear()} ${String(dObj.getHours()).padStart(2, '0')}:${String(dObj.getMinutes()).padStart(2, '0')}`;
            const uIdx = up3List.indexOf(d['Unit UP3']) % upBadgeColors.length;
            const uc = upBadgeColors[Math.max(uIdx, 0)];
            const rowBg = idx % 2 === 0 ? 'background:transparent' : 'background:rgba(248,250,252,0.5)';

            // Cek apakah ada temuan untuk merubah style tombol aksi
            const hasTemuan = !!d['Deskripsi Temuan (Jika Ada)'];
            const btnStyle = hasTemuan
                ? 'background:var(--rose-l);color:var(--rose)'
                : 'background:var(--primary-l);color:var(--primary)';
            const btnHoverBg = hasTemuan ? 'var(--rose)' : 'var(--primary)';

            html += `
<tr style="${rowBg};transition:background .2s">
    <td style="text-align:center;font-weight:800;color:var(--g300);font-size:13px">${idx + 1}</td>
    <td style="white-space:nowrap">
        <div style="font-weight:700;color:var(--g800);font-size:13.5px">${dStr.split(' ')[0]}</div>
        <div style="font-size:12px;color:var(--g400);margin-top:2px">${dStr.split(' ')[1] || ''}</div>
    </td>
    <td style="text-align:center">
        <span style="display:inline-block;background:${uc.bg};color:${uc.col};font-size:11px;font-weight:800;padding:3px 9px;border-radius:99px;white-space:nowrap">${d['Unit UP3']}</span>
    </td>
    <td style="font-weight:700;color:var(--primary-d)">${d['Unit ULP']}</td>
    <td style="font-size:13px;color:var(--g700)">${d['Nama Perangkat CCTV']}</td>
    <td>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:var(--g800)">
            <i class="fa-solid fa-wrench" style="color:var(--amber);font-size:11px"></i>${d['Nama Pekerjaan']}
        </span>
    </td>
    <td style="font-size:13px;color:var(--g600)">
        <i class="fa-solid fa-location-dot" style="color:var(--emerald);margin-right:5px;font-size:11px"></i>${d['Lokasi Pekerjaan']}
    </td>
    <td style="font-size:13px;color:var(--g700)">${d['Petugas Pelaksana di Lapangan']}</td>
    <td style="text-align:center">
        <button onclick="openInputModal(${idx})"
           style="display:inline-flex;align-items:center;gap:6px;${btnStyle};font-size:12px;font-weight:700;padding:6px 12px;border-radius:99px;border:none;cursor:pointer;white-space:nowrap;transition:all .2s"
           onmouseover="this.style.background='${btnHoverBg}';this.style.color='#fff'"
           onmouseout="this.style.background='${btnStyle.split(';')[0].split(':')[1]}';this.style.color='${btnStyle.split(';')[1].split(':')[1]}'">
            <i class="fa-solid ${hasTemuan ? 'fa-eye' : 'fa-pen-to-square'}"></i>${hasTemuan ? 'Lihat Temuan' : 'Input Temuan'}
        </button>
    </td>
</tr>`;
        });

        body.innerHTML = html;
        if ($('dl-count-label')) $('dl-count-label').textContent = `Menampilkan ${data.length} data`;
        if ($('dl-sub')) $('dl-sub').textContent = `Menampilkan ${data.length} dari ${sorted.length} laporan`;
    }

    buildRows(sorted.slice(0, 200));

    function applyFilter() {
        const q = ($('dlSearch') || {}).value?.toLowerCase() || '';
        const u3 = ($('dlFilterUp3') || {}).value || '';
        const result = sorted.filter(d => {
            const matchQ = !q || (d['Unit UP3'] + d['Unit ULP']).toLowerCase().includes(q);
            const matchU3 = !u3 || d['Unit UP3'] === u3;
            return matchQ && matchU3;
        }).slice(0, 200);
        buildRows(result);
    }

    const srch = $('dlSearch');
    const ddF = $('dlFilterUp3');
    const btn = $('dlReload');

    if (srch) srch.oninput = applyFilter;
    if (ddF) ddF.onchange = applyFilter;
    if (btn) btn.onclick = () => {
        if (srch) srch.value = '';
        if (ddF) ddF.value = '';
        applyFilter();
    };
}

/* ==================================================
   PAGE: GRAFIK
   ================================================== */
function renderGrafik() {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js belum termuat.');
        return;
    }

    Chart.defaults.font.family = "'Plus Jakarta Sans',system-ui,sans-serif";
    Chart.defaults.color = '#64748B';

    const GRID = 'rgba(0,0,0,0.05)';
    const TIP = {
        backgroundColor: '#1E293B', borderColor: 'rgba(37,99,235,.2)', borderWidth: 1,
        titleColor: '#F1F5F9', bodyColor: '#94A3B8', padding: 12, cornerRadius: 8
    };
    const SCL = {
        grid: { color: GRID },
        border: { display: false },
        ticks: { font: { weight: '600', size: 11 } }
    };

    const dm = {};
    DATA.filter(d => d.Timestamp && d.Timestamp.startsWith(YM)).forEach(d => {
        const k = d.Timestamp.slice(0, 10);
        dm[k] = (dm[k] || 0) + 1;
    });

    const srtDates = Object.keys(dm).sort();
    const dayLbls = srtDates.map(d => +d.split('-')[2]);

    const c1 = $('cHarian');
    if (c1) {
        const grd = c1.getContext('2d').createLinearGradient(0, 0, 0, 300);
        grd.addColorStop(0, 'rgba(37,99,235,.14)');
        grd.addColorStop(1, 'rgba(37,99,235,0)');

        charts.h = new Chart(c1, {
            type: 'line',
            data: {
                labels: dayLbls,
                datasets: [{
                    label: 'Aktivitas',
                    data: srtDates.map(d => dm[d]),
                    borderColor: '#2563EB',
                    backgroundColor: grd,
                    borderWidth: 2.5,
                    fill: true,
                    tension: .42,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#2563EB',
                    pointBorderWidth: 2,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { ...TIP }
                },
                scales: {
                    x: { ...SCL, grid: { display: false } },
                    y: { ...SCL, beginAtZero: true }
                }
            }
        });
    }

    const BCOLS = ['#2563EB', '#6366F1', '#8B5CF6', '#EC4899', '#06B6D4', '#10B981', '#F59E0B'];
    const up3Cnt = {};
    DATA.forEach(d => { if (d['Unit UP3']) up3Cnt[d['Unit UP3']] = (up3Cnt[d['Unit UP3']] || 0) + 1; });

    const c2 = $('cUp3');
    if (c2) {
        charts.u = new Chart(c2, {
            type: 'bar',
            data: {
                labels: ALL_UP3,
                datasets: [{
                    label: 'Total Aktivitas',
                    data: ALL_UP3.map(u => up3Cnt[u] || 0),
                    backgroundColor: BCOLS,
                    borderRadius: 7,
                    borderSkipped: false,
                    barPercentage: .55
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { ...TIP }
                },
                scales: {
                    x: { ...SCL, grid: { display: false }, ticks: { font: { weight: '700', size: 11 } } },
                    y: { ...SCL, beginAtZero: true }
                }
            }
        });
    }

    const kpts = UNITS.map(grp => {
        const uls = grp.ulps.map(u => pctOf(daysActive(grp.up3, u, YM)));
        return Math.round(uls.reduce((s, v) => s + v, 0) / uls.length);
    });
    const kCols = kpts.map(p => p >= 90 ? '#10B981' : p >= 70 ? '#F59E0B' : '#F43F5E');

    const c3 = $('cKepatuhan');
    if (c3) {
        charts.k = new Chart(c3, {
            type: 'doughnut',
            data: {
                labels: ALL_UP3,
                datasets: [{
                    data: kpts,
                    backgroundColor: kCols,
                    borderColor: '#fff',
                    borderWidth: 4,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '64%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: '#475569',
                            font: { size: 11.5, weight: '700' }
                        }
                    },
                    tooltip: {
                        ...TIP,
                        callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
                    }
                }
            }
        });
    }
}

/* ==================================================
   MODAL — DETAIL STATUS UP3
   ================================================== */
function openStatusModal(filter) {
    const cfg = {
        baik: { label: 'Status Baik', sub: '≥ 90% hari aktif monitoring', fillClass: 'fill-green', badgeClass: 'bg-g', icon: 'fa-circle-check', color: 'var(--emerald)' },
        cukup: { label: 'Status Cukup', sub: '70 – 89% hari aktif', fillClass: 'fill-amber', badgeClass: 'bg-y', icon: 'fa-triangle-exclamation', color: 'var(--amber)' },
        perhatian: { label: 'Perlu Perhatian', sub: '< 70% hari aktif monitoring', fillClass: 'fill-rose', badgeClass: 'bg-r', icon: 'fa-circle-xmark', color: 'var(--rose)' }
    };

    const c = cfg[filter];
    if (!c) return;

    const filtered = _up3Stats.filter(s => {
        if (filter === 'baik') return s.avg >= 90;
        if (filter === 'cukup') return s.avg >= 70 && s.avg < 90;
        if (filter === 'perhatian') return s.avg < 70;
    }).sort((a, b) => b.avg - a.avg);

    $('modalTitle').innerHTML = `<i class="fa-solid ${c.icon}" style="color:${c.color};margin-right:8px"></i>${c.label}`;
    $('modalSub').textContent = `${filtered.length} UP3 \u2014 ${c.sub}`;

    const body = $('modalBody');
    if (!filtered.length) {
        body.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--g400)"><i class="fa-solid fa-inbox" style="font-size:32px;display:block;margin-bottom:12px"></i>Tidak ada UP3 dalam kategori ini.</div>`;
    } else {
        body.innerHTML = filtered.map((s, i) => {
            const g = grade(s.avg);
            return `
            <div class="mi-card">
                <div class="mi-no">${i + 1}</div>
                <div class="mi-info">
                    <div class="mi-name">${s.up3}</div>
                    <div class="mi-track">
                        <div class="mi-fill ${c.fillClass}" style="width:0%" data-target="${s.avg}"></div>
                    </div>
                </div>
                <span class="badge ${g.cls}" style="min-width:52px;justify-content:center">${s.avg}%</span>
            </div>`;
        }).join('');

        requestAnimationFrame(() => {
            body.querySelectorAll('.mi-fill[data-target]').forEach(el => {
                el.style.width = el.dataset.target + '%';
            });
        });
    }

    $('statusModal').classList.add('show');
}

function closeModal() {
    $('statusModal').classList.remove('show');
}


/* ==================================================
   MODAL — INPUT TEMUAN
   ================================================== */
let _activeTemuanIdx = null;

function openInputModal(idx) {
    const d = _filteredLaporanData[idx];
    if (!d) return;

    _activeTemuanIdx = idx; // Simpan index data yang sedang diedit

    // Isi read-only fields
    $('im-unit').value = `${d['Unit UP3']} - ${d['Unit ULP']}`;
    $('im-waktu').value = d.Timestamp;
    $('im-dokcctv').value = d['Dokumentasi CCTV'] || '';

    // Isi form input fields
    $('im-temuan').value = d['Deskripsi Temuan (Jika Ada)'] || '';
    $('im-waktutemuan').value = d['Waktu Temuan'] || '';
    $('im-doktemuan').value = d['Dokumentasi Temuan'] || '';
    $('im-tindaklanjut').value = d['Tindak Lanjut (Tegur online, CMC, dsb)'] || '';
    $('im-ket').value = d['Keterangan'] || '';

    $('inputModal').classList.add('show');
}

function closeInputModal() {
    $('inputModal').classList.remove('show');
    _activeTemuanIdx = null;
}

function submitTemuan() {
    if (_activeTemuanIdx === null) return;

    // Ambil data asli (untuk mengupdate objek yang benar dalam DATA utama jika diperlukan)
    const d = _filteredLaporanData[_activeTemuanIdx];

    // Update properti di javascript (dummy client-side save)
    d['Deskripsi Temuan (Jika Ada)'] = $('im-temuan').value;
    d['Waktu Temuan'] = $('im-waktutemuan').value;
    d['Dokumentasi Temuan'] = $('im-doktemuan').value;
    d['Tindak Lanjut (Tegur online, CMC, dsb)'] = $('im-tindaklanjut').value;
    d['Keterangan'] = $('im-ket').value;

    // Beri notifikasi
    alert('✅ Data Temuan berhasil disimpan ke Spreadsheet (Simulasi)!');

    // Tutup modal
    closeInputModal();

    // Render ulang tabel supaya tombol "Input Temuan" berubah jadi "Lihat Temuan" (warna merah muda)
    // jika sudah diisi
    renderDataLaporan();
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeModal();
        closeInputModal();
    }
});
