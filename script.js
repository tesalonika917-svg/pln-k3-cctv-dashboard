/* =========================================================
   PLN K3 · CCTV Monitoring Dashboard
   Semua data diproses di browser (client-side only).
   ========================================================= */

/* =========================================================
   KONFIGURASI — isi sekali di sini, dashboard akan otomatis
   menarik data dari spreadsheet setiap kali dibuka, oleh
   siapa pun, tanpa perlu upload/paste URL manual lagi.

   Isi dengan salah satu:
   - URL CSV publik dari "Publish to web" (…/pub?output=csv), atau
   - URL Web App dari Apps Script (…/exec) — lihat apps-script.gs

   Biarkan string kosong "" untuk kembali ke mode manual
   (panel Sumber Data akan tampil seperti biasa).
   ========================================================= */
const CONFIG = {
  SOURCE_URL: "",           // <-- tempel URL Anda di sini, di antara tanda kutip
  AUTO_REFRESH_MINUTES: 5   // seberapa sering data disegarkan ulang otomatis
};

const HARI_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

const STORAGE_ROWS_KEY = 'plnk3-dashboard-rows';
const STORAGE_URL_KEY  = 'plnk3-dashboard-source-url';
const STORAGE_THEME_KEY = 'plnk3-dashboard-theme';

const CATEGORY_PALETTE = ['#f0b93f', '#e0704f', '#8b7fd6', '#3fae8f', '#5aa4f5', '#e3b98a'];

let rows = [];
let categoryColor = {};   // { "Pemeliharaan Rutin": "#f0b93f", ... }
let lineChart, donutChart, barChart;
let autoRefreshTimer = null;

/* ---------------- header normalization (same mapping as the sheet) ---------------- */
const HEADER_MAP = {
  'timestamp':'timestamp', 'tanggal':'timestamp', 'waktu':'timestamp',
  'unit up3':'up3', 'up3':'up3',
  'unit ulp':'ulp', 'ulp':'ulp',
  'nama perangkat cctv':'perangkat', 'perangkat cctv':'perangkat', 'nama perangkat':'perangkat',
  'nama pekerjaan':'pekerjaan', 'pekerjaan':'pekerjaan',
  'lokasi pekerjaan':'lokasi', 'lokasi':'lokasi',
  'petugas pelaksana di lapangan':'petugas', 'petugas pelaksana':'petugas', 'petugas':'petugas',
  'dokumentasi cctv':'dokumentasi', 'dokumentasi':'dokumentasi', 'link':'dokumentasi',
  'deskripsi':'deskripsi', 'keterangan':'deskripsi', 'description':'deskripsi'
};

function parseTimestamp(raw){
  if(!raw) return null;
  raw = String(raw).trim();
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){ const [,d,mo,y,h,mi,s] = m; return new Date(+y,+mo-1,+d,+(h||0),+(mi||0),+(s||0)); }
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){ const [,y,mo,d,h,mi,s] = m; return new Date(+y,+mo-1,+d,+(h||0),+(mi||0),+(s||0)); }
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}
function fmtDate(d){
  if(!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function isSameDay(a,b){
  return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function esc(s){
  if(s===undefined || s===null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function normalizeRows(raw){
  if(!raw || !raw.length) return [];
  const headerRow = Object.keys(raw[0]);
  const keyFor = {};
  headerRow.forEach(h=>{
    const clean = String(h).trim().toLowerCase().replace(/\s+/g,' ');
    keyFor[h] = HEADER_MAP[clean] || null;
  });
  return raw.map(r=>{
    const o = {};
    headerRow.forEach(h=>{ const k = keyFor[h]; if(k) o[k] = (r[h] ?? '').toString().trim(); });
    o._date = parseTimestamp(o.timestamp);
    return o;
  }).filter(o => o._date || o.pekerjaan || o.up3);
}

/* ---------------- fetching (CSV or Apps-Script JSON) ---------------- */
async function fetchAndParse(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  const trimmed = text.trim();
  if(trimmed.startsWith('[') || trimmed.startsWith('{')){
    const json = JSON.parse(trimmed);
    return Array.isArray(json) ? json : (json.data || json.rows || []);
  }
  return Papa.parse(text, {header:true, skipEmptyLines:true}).data;
}

/* ---------------- ingest & persistence ---------------- */
function setStatus(msg, type){
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'drawer-status ' + (type||'');
}

function ingest(rawRows, label){
  const norm = normalizeRows(rawRows);
  if(!norm.length){
    setStatus('Tidak ada baris valid. Periksa header kolom (Timestamp, Unit UP3, Unit ULP, dst).', 'err');
    return;
  }
  rows = norm;
  setStatus(`Berhasil memuat ${rows.length} baris dari ${label}.`, 'ok');
  persistRows();
  assignCategoryColors();
  renderAll();
}

function persistRows(){
  try{
    localStorage.setItem(STORAGE_ROWS_KEY, JSON.stringify(rows.map(r=>({...r, _date: r._date ? r._date.toISOString() : null}))));
  }catch(e){ /* storage full or unavailable */ }
}
function restoreRows(){
  try{
    const raw = localStorage.getItem(STORAGE_ROWS_KEY);
    if(!raw) return false;
    const parsed = JSON.parse(raw);
    rows = parsed.map(r => ({...r, _date: r._date ? new Date(r._date) : null}));
    return rows.length > 0;
  }catch(e){ return false; }
}

/* ---------------- category colors ---------------- */
function assignCategoryColors(){
  const counts = {};
  rows.forEach(r => { if(r.pekerjaan) counts[r.pekerjaan] = (counts[r.pekerjaan]||0)+1; });
  const top = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).slice(0, CATEGORY_PALETTE.length);
  categoryColor = {};
  top.forEach((cat,i) => categoryColor[cat] = CATEGORY_PALETTE[i]);
}
function colorFor(cat){ return categoryColor[cat] || '#5d7196'; }

/* ---------------- render: camera / device row ---------------- */
function renderCameraRow(){
  const el = document.getElementById('cameraRow');
  if(!rows.length){
    el.innerHTML = '<div class="camera-placeholder">Belum ada data perangkat CCTV. Klik ikon ⚙ di kanan atas untuk memuat data.</div>';
    return;
  }
  const latestByDevice = {};
  rows.forEach(r=>{
    if(!r.perangkat) return;
    const existing = latestByDevice[r.perangkat];
    if(!existing || (r._date && existing._date && r._date > existing._date)) latestByDevice[r.perangkat] = r;
  });
  const devices = Object.values(latestByDevice)
    .sort((a,b)=>(b._date?.getTime()||0)-(a._date?.getTime()||0))
    .slice(0,4);

  el.innerHTML = devices.map(d=>`
    <div class="cam-card">
      <div class="cam-feed"></div>
      <div class="cam-tag"><span class="rec"></span>${d._date && isSameDay(d._date,new Date()) ? 'AKTIF' : 'TERAKHIR'}</div>
      ${d.dokumentasi ? `<a class="cam-open" href="${esc(d.dokumentasi)}" target="_blank" rel="noopener">↗ Dokumentasi</a>` : ''}
      <div class="cam-info">
        <div class="name">${esc(d.perangkat)}</div>
        <div class="loc">${esc(d.ulp || d.lokasi || '—')}</div>
      </div>
    </div>
  `).join('');
}

/* ---------------- render: line chart (pekerjaan per bulan) ---------------- */
function renderLineChart(){
  const cats = Object.keys(categoryColor);
  const now = new Date();
  const year = now.getFullYear();
  document.getElementById('lineSub').textContent = String(year);

  const datasets = cats.map(cat => {
    const monthly = new Array(12).fill(0);
    rows.forEach(r=>{
      if(r.pekerjaan === cat && r._date && r._date.getFullYear() === year){
        monthly[r._date.getMonth()]++;
      }
    });
    return {
      label: cat,
      data: monthly,
      borderColor: colorFor(cat),
      backgroundColor: colorFor(cat),
      tension: 0.35,
      pointRadius: 3,
      pointBackgroundColor: '#101f38',
      pointBorderColor: colorFor(cat),
      pointBorderWidth: 2,
      borderWidth: 2,
      fill: false
    };
  });

  if(lineChart) lineChart.destroy();
  lineChart = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: { labels: BULAN_ID, datasets },
    options: {
      responsive:true,
      plugins:{ legend:{ display:true, position:'right', labels:{ color:'#93a6c4', boxWidth:9, boxHeight:9, font:{size:11} } } },
      scales:{
        x:{ grid:{ color:'#233a5e' }, ticks:{ color:'#93a6c4', font:{size:11} } },
        y:{ grid:{ color:'#233a5e' }, ticks:{ color:'#93a6c4', font:{size:11}, precision:0 }, beginAtZero:true }
      }
    }
  });
}

/* ---------------- render: donut chart (distribusi Unit UP3) ---------------- */
function renderDonutChart(){
  const counts = {};
  rows.forEach(r => { if(r.up3) counts[r.up3] = (counts[r.up3]||0)+1; });
  let entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(entries.length > 5){
    const rest = entries.slice(4).reduce((s,e)=>s+e[1],0);
    entries = entries.slice(0,4).concat([['Lainnya', rest]]);
  }
  const labels = entries.map(e=>e[0]);
  const data = entries.map(e=>e[1]);
  const colors = labels.map((_,i)=>CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]);

  if(donutChart) donutChart.destroy();
  donutChart = new Chart(document.getElementById('donutChart'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors, borderColor:'#132542', borderWidth:3 }] },
    options:{ responsive:true, cutout:'68%', plugins:{ legend:{ display:false } } }
  });

  document.getElementById('donutLegend').innerHTML = labels.map((l,i)=>`
    <div class="legend-row"><span class="legend-dot" style="background:${colors[i]}"></span>${esc(l)} <b>${data[i]}</b></div>
  `).join('');
}

/* ---------------- render: stacked bar (pekerjaan per Unit ULP) ---------------- */
function renderBarChart(){
  const ulpCounts = {};
  rows.forEach(r=>{ if(r.ulp) ulpCounts[r.ulp] = (ulpCounts[r.ulp]||0)+1; });
  const topUlp = Object.keys(ulpCounts).sort((a,b)=>ulpCounts[b]-ulpCounts[a]).slice(0,7);
  const cats = Object.keys(categoryColor);

  const datasets = cats.map(cat => ({
    label: cat,
    data: topUlp.map(ulp => rows.filter(r => r.ulp===ulp && r.pekerjaan===cat).length),
    backgroundColor: colorFor(cat),
    stack: 'stack1'
  }));

  if(barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type:'bar',
    data:{ labels: topUlp, datasets },
    options:{
      responsive:true,
      plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#93a6c4', boxWidth:9, boxHeight:9, font:{size:11} } } },
      scales:{
        x:{ stacked:true, grid:{ display:false }, ticks:{ color:'#93a6c4', font:{size:11} } },
        y:{ stacked:true, grid:{ color:'#233a5e' }, ticks:{ color:'#93a6c4', font:{size:11}, precision:0 }, beginAtZero:true }
      }
    }
  });
}

/* ---------------- render: recent activity list ---------------- */
function renderRecentList(){
  const el = document.getElementById('recentList');
  const sorted = [...rows].sort((a,b)=>(b._date?.getTime()||0)-(a._date?.getTime()||0)).slice(0,6);
  if(!sorted.length){ el.innerHTML = '<div class="empty-mini">Belum ada data.</div>'; return; }
  el.innerHTML = sorted.map(r=>`
    <div class="recent-item">
      <div>
        <div class="rname">${esc(r.pekerjaan)||'—'}</div>
        <div class="rloc">${esc(r.lokasi || r.ulp || '—')}</div>
      </div>
      <div class="recent-right">
        <span class="rdate">${fmtDate(r._date)}</span>
        <span class="badge" style="background:${colorFor(r.pekerjaan)}">${esc(r.pekerjaan)||'—'}</span>
      </div>
    </div>
  `).join('');
}

/* ---------------- top summary + notifications ---------------- */
function renderSummary(){
  const today = new Date();
  const todays = rows.filter(r => isSameDay(r._date, today));
  document.getElementById('welcomeMsg').textContent = rows.length
    ? `${HARI_ID[today.getDay()]}, ${fmtDate(today)} · ${rows.length} total pekerjaan tercatat, ${todays.length} hari ini.`
    : 'Selamat datang. Belum ada data — buka panel Sumber Data (⚙) untuk mulai.';
  document.getElementById('notifDot').style.display = todays.length ? 'block' : 'none';
}

function renderAll(){
  renderSummary();
  renderCameraRow();
  renderLineChart();
  renderDonutChart();
  renderBarChart();
  renderRecentList();
}

/* ---------------- search (client-side highlight/filter across recent list) ---------------- */
document.getElementById('globalSearch').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  const el = document.getElementById('recentList');
  const source = q
    ? rows.filter(r => [r.pekerjaan,r.petugas,r.lokasi,r.perangkat,r.up3,r.ulp].join(' ').toLowerCase().includes(q))
    : rows;
  const sorted = [...source].sort((a,b)=>(b._date?.getTime()||0)-(a._date?.getTime()||0)).slice(0,8);
  if(!sorted.length){ el.innerHTML = '<div class="empty-mini">Tidak ada hasil.</div>'; return; }
  el.innerHTML = sorted.map(r=>`
    <div class="recent-item">
      <div>
        <div class="rname">${esc(r.pekerjaan)||'—'}</div>
        <div class="rloc">${esc(r.lokasi || r.ulp || '—')}</div>
      </div>
      <div class="recent-right">
        <span class="rdate">${fmtDate(r._date)}</span>
        <span class="badge" style="background:${colorFor(r.pekerjaan)}">${esc(r.pekerjaan)||'—'}</span>
      </div>
    </div>
  `).join('');
});

/* ---------------- data source drawer ---------------- */
const drawer = document.getElementById('dataDrawer');
const overlay = document.getElementById('drawerOverlay');
function openDrawer(){ drawer.classList.add('open'); overlay.classList.add('open'); }
function closeDrawerFn(){ drawer.classList.remove('open'); overlay.classList.remove('open'); }
document.getElementById('settingsBtn').addEventListener('click', openDrawer);
document.getElementById('openDataDrawerLink').addEventListener('click', (e)=>{ e.preventDefault(); openDrawer(); });
document.getElementById('closeDrawer').addEventListener('click', closeDrawerFn);
overlay.addEventListener('click', closeDrawerFn);

document.getElementById('fileInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const name = file.name.toLowerCase();
  const reader = new FileReader();
  reader.onload = function(evt){
    try{
      if(name.endsWith('.csv')){
        ingest(Papa.parse(evt.target.result, {header:true, skipEmptyLines:true}).data, `file "${file.name}"`);
      } else {
        const wb = XLSX.read(evt.target.result, {type:'array'});
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
        ingest(json, `file "${file.name}"`);
      }
    } catch(err){ setStatus('Gagal membaca file: ' + err.message, 'err'); }
  };
  if(name.endsWith('.csv')) reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
});

document.getElementById('loadUrlBtn').addEventListener('click', async ()=>{
  const url = document.getElementById('csvUrlInput').value.trim();
  if(!url){ setStatus('Masukkan URL terlebih dahulu.', 'err'); return; }
  setStatus('Mengambil data dari URL…');
  try{
    const data = await fetchAndParse(url);
    ingest(data, 'sumber otomatis');
    localStorage.setItem(STORAGE_URL_KEY, url);
    document.getElementById('refreshBtn').style.display = 'inline-block';
    startAutoRefresh();
  } catch(err){
    setStatus('Gagal mengambil URL (kemungkinan CORS, atau sheet belum dipublikasikan). Coba Apps Script atau unggah file. Detail: ' + err.message, 'err');
  }
});

document.getElementById('refreshBtn').addEventListener('click', ()=> refreshFromSavedSource(true));

document.getElementById('loadPasteBtn').addEventListener('click', ()=>{
  const text = document.getElementById('csvPasteInput').value.trim();
  if(!text){ setStatus('Tempel data CSV terlebih dahulu.', 'err'); return; }
  ingest(Papa.parse(text, {header:true, skipEmptyLines:true}).data, 'data tempel');
});

document.getElementById('sampleBtn').addEventListener('click', ()=>{
  const sample = [
    {Timestamp:'24/11/2025 8:23:56', 'Unit UP3':'UP3 Kendari', 'Unit ULP':'ULP Wua Wua', 'NAMA PERANGKAT CCTV':'CCTV WUA WUA', 'Nama Pekerjaan':'Pelayanan Gangguan', 'Lokasi Pekerjaan':'Kendari', 'Petugas Pelaksana di Lapangan':'Andi Saputra', 'Dokumentasi CCTV':'https://drive.google.com/open?id=1a', 'Deskripsi':'Perbaikan koneksi jaringan CCTV pasca gangguan listrik.'},
    {Timestamp:'24/11/2025 10:05:12', 'Unit UP3':'UP3 Kendari', 'Unit ULP':'ULP Kolaka', 'NAMA PERANGKAT CCTV':'CCTV KOLAKA 02', 'Nama Pekerjaan':'Pemeliharaan Rutin', 'Lokasi Pekerjaan':'Kolaka', 'Petugas Pelaksana di Lapangan':'Budi Santoso', 'Dokumentasi CCTV':'https://drive.google.com/open?id=1b', 'Deskripsi':'Pembersihan lensa kamera.'},
    {Timestamp:'23/11/2025 14:40:00', 'Unit UP3':'UP3 Bau-Bau', 'Unit ULP':'ULP Baubau Kota', 'NAMA PERANGKAT CCTV':'CCTV GARDU INDUK', 'Nama Pekerjaan':'Instalasi Baru', 'Lokasi Pekerjaan':'Baubau', 'Petugas Pelaksana di Lapangan':'Citra Dewi', 'Dokumentasi CCTV':'https://drive.google.com/open?id=1c', 'Deskripsi':'Pemasangan unit CCTV baru.'},
    {Timestamp:'22/11/2025 9:15:30', 'Unit UP3':'UP3 Kendari', 'Unit ULP':'ULP Wua Wua', 'NAMA PERANGKAT CCTV':'CCTV WUA WUA', 'Nama Pekerjaan':'Perbaikan Perangkat', 'Lokasi Pekerjaan':'Kendari', 'Petugas Pelaksana di Lapangan':'Andi Saputra', 'Dokumentasi CCTV':'https://drive.google.com/open?id=1d', 'Deskripsi':'Penggantian kabel power.'},
    {Timestamp:'21/11/2025 16:02:45', 'Unit UP3':'UP3 Bau-Bau', 'Unit ULP':'ULP Wolio', 'NAMA PERANGKAT CCTV':'CCTV WOLIO', 'Nama Pekerjaan':'Pemeliharaan Rutin', 'Lokasi Pekerjaan':'Wolio', 'Petugas Pelaksana di Lapangan':'Dedi Kurniawan', 'Dokumentasi CCTV':'https://drive.google.com/open?id=1e', 'Deskripsi':'Pengecekan rekaman 7 hari terakhir.'},
    {Timestamp:'18/11/2025 11:30:00', 'Unit UP3':'UP3 Kendari', 'Unit ULP':'ULP Kolaka', 'NAMA PERANGKAT CCTV':'CCTV KOLAKA 02', 'Nama Pekerjaan':'Pelayanan Gangguan', 'Lokasi Pekerjaan':'Kolaka', 'Petugas Pelaksana di Lapangan':'Budi Santoso', 'Dokumentasi CCTV':'https://drive.google.com/open?id=1f', 'Deskripsi':'Gangguan sinyal kamera akibat cuaca ekstrem.'},
    {Timestamp:'15/11/2025 13:10:00', 'Unit UP3':'UP3 Bau-Bau', 'Unit ULP':'ULP Baubau Kota', 'NAMA PERANGKAT CCTV':'CCTV GARDU INDUK', 'Nama Pekerjaan':'Perbaikan Perangkat', 'Lokasi Pekerjaan':'Baubau', 'Petugas Pelaksana di Lapangan':'Citra Dewi', 'Dokumentasi CCTV':'https://drive.google.com/open?id=1g', 'Deskripsi':'Perbaikan bracket kamera yang longgar.'},
  ];
  ingest(sample, 'data contoh');
});

document.getElementById('clearBtn').addEventListener('click', ()=>{
  rows = [];
  localStorage.removeItem(STORAGE_ROWS_KEY);
  localStorage.removeItem(STORAGE_URL_KEY);
  document.getElementById('refreshBtn').style.display = 'none';
  setStatus('Data tersimpan telah dihapus.');
  if(autoRefreshTimer) clearInterval(autoRefreshTimer);
  renderAll();
});

function startAutoRefresh(){
  if(autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(()=> refreshFromSavedSource(false), CONFIG.AUTO_REFRESH_MINUTES*60*1000);
}
async function refreshFromSavedSource(manual){
  const url = CONFIG.SOURCE_URL || localStorage.getItem(STORAGE_URL_KEY);
  if(!url) return;
  try{
    if(manual) setStatus('Menyegarkan data…');
    const data = await fetchAndParse(url);
    ingest(data, 'sumber otomatis (diperbarui)');
  } catch(err){
    if(manual) setStatus('Gagal menyegarkan: ' + err.message, 'err');
  }
}

/* ---------------- theme toggle ---------------- */
document.getElementById('themeToggle').addEventListener('click', ()=>{
  document.body.classList.toggle('theme-light');
  localStorage.setItem(STORAGE_THEME_KEY, document.body.classList.contains('theme-light') ? 'light' : 'dark');
});

/* ---------------- sidebar collapse ---------------- */
document.getElementById('sidebarToggle').addEventListener('click', ()=>{
  document.getElementById('sidebar').classList.toggle('collapsed');
});

/* ---------------- boot ---------------- */
(function init(){
  if(localStorage.getItem(STORAGE_THEME_KEY) === 'light') document.body.classList.add('theme-light');

  const hadCache = restoreRows();
  if(hadCache){ assignCategoryColors(); setStatus(`${rows.length} baris dimuat dari sesi sebelumnya.`, 'ok'); }
  renderAll();

  if(CONFIG.SOURCE_URL){
    // Mode otomatis: URL sudah ditanam di kode, langsung tarik data tanpa interaksi apa pun.
    document.getElementById('csvUrlInput').value = CONFIG.SOURCE_URL;
    document.getElementById('refreshBtn').style.display = 'inline-block';
    setStatus('Mengambil data otomatis…');
    refreshFromSavedSource(false);
    startAutoRefresh();
    return;
  }

  const savedUrl = localStorage.getItem(STORAGE_URL_KEY);
  if(savedUrl){
    document.getElementById('csvUrlInput').value = savedUrl;
    document.getElementById('refreshBtn').style.display = 'inline-block';
    refreshFromSavedSource(false);
    startAutoRefresh();
  } else if(!hadCache){
    openDrawer();
  }
})();