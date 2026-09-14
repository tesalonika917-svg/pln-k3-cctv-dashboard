/* =========================================================
   PLN K3 · CCTV Monitoring Dashboard
   Semua data diproses di browser (client-side only).
   ========================================================= */

const HARI_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

const STORAGE_ROWS_KEY = 'plnk3-dashboard-rows';
const STORAGE_URL_KEY  = 'plnk3-dashboard-source-url';
const STORAGE_THEME_KEY = 'plnk3-dashboard-theme';
const STORAGE_PETUGAS_KEY = 'plnk3-petugas-list';
const STORAGE_PROFILE_KEY = 'plnk3-profile';
const STORAGE_WILAYAH_KEY = 'plnk3-wilayah-coords';

const CATEGORY_PALETTE = ['#f0b93f', '#e0704f', '#8b7fd6', '#3fae8f', '#5aa4f5', '#e3b98a'];

/* =========================================================
   ISI LINK SUMBER DATA DI SINI
   (link CSV hasil "Publish to web" dari Google Sheet,
    atau URL Google Apps Script Web App yang return JSON)
   ========================================================= */
const DEFAULT_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQWRM7E3rtMsJVWf9z1cntdblP4nSP9p0QCC6DeEbVt_3MHbjicUDgP2AsgLPV-NaNAYH3YZfDwFXhI/pub?output=csv';

let rows = [];
let categoryColor = {};
let lineChart, donutChart, barChart, petugasChart, unitChart, akumulasiChart;
let autoRefreshTimer = null;
let calCursor = new Date();

/* ---------------- header normalization ---------------- */
const HEADER_MAP = {
  'timestamp':'timestamp',
  'tanggal':'timestamp',
  'waktu':'timestamp',

  'unit up3':'up3',
  'up3':'up3',

  'unit ulp':'ulp',
  'ulp':'ulp',

  'nama perangkat cctv':'perangkat',
  'perangkat cctv':'perangkat',
  'nama perangkat':'perangkat',

  'nama pekerjaan':'pekerjaan',
  'pekerjaan':'pekerjaan',

  'lokasi pekerjaan':'lokasi',
  'lokasi':'lokasi',

  'petugas pelaksana di lapangan':'petugas',
  'petugas pelaksana':'petugas',
  'petugas':'petugas',

  'dokumentasi cctv':'dokumentasi',
  'dokumentasi':'dokumentasi',
  'link':'dokumentasi',

  'deskripsi':'deskripsi',
  'keterangan':'deskripsi',
  'description':'deskripsi'
};


/* =========================================================
   PARSE TIMESTAMP
   ========================================================= */
function parseTimestamp(raw){
  if(!raw) return null;

  raw = String(raw).trim();

  // Format: DD/MM/YYYY HH:MM:SS
  let m = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );

  if(m){
    const [,d,mo,y,h,mi,s] = m;

    return new Date(
      +y,
      +mo-1,
      +d,
      +(h || 0),
      +(mi || 0),
      +(s || 0)
    );
  }

  // Format: YYYY-MM-DD HH:MM:SS
  m = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );

  if(m){
    const [,y,mo,d,h,mi,s] = m;

    return new Date(
      +y,
      +mo-1,
      +d,
      +(h || 0),
      +(mi || 0),
      +(s || 0)
    );
  }

  const d = new Date(raw);

  return isNaN(d) ? null : d;
}


/* =========================================================
   FORMAT TANGGAL + JAM
   ========================================================= */
function fmtDate(d, rawTimestamp = null){

  /*
   * PENTING:
   * Gunakan Timestamp asli dari Google Sheets terlebih dahulu.
   * Ini mencegah GitHub Pages/browser menghilangkan jam.
   */

  if(
    rawTimestamp !== null &&
    rawTimestamp !== undefined &&
    String(rawTimestamp).trim() !== ''
  ){

    const raw = String(rawTimestamp).trim();

    // Format:
    // DD/MM/YYYY HH:MM:SS
    let m = raw.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

    if(m){

      const dd = String(m[1]).padStart(2, '0');
      const mm = String(m[2]).padStart(2, '0');
      const yyyy = m[3];

      const hh = String(m[4]).padStart(2, '0');
      const mi = String(m[5]).padStart(2, '0');
      const ss = String(m[6] || '00').padStart(2, '0');

      return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
    }


    // Format:
    // YYYY-MM-DD HH:MM:SS
    // YYYY-MM-DDTHH:MM:SS
    m = raw.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

    if(m){

      const yyyy = m[1];
      const mm = String(m[2]).padStart(2, '0');
      const dd = String(m[3]).padStart(2, '0');

      const hh = String(m[4]).padStart(2, '0');
      const mi = String(m[5]).padStart(2, '0');
      const ss = String(m[6] || '00').padStart(2, '0');

      return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
    }

    /*
     * Jika format Timestamp tidak dikenali,
     * tampilkan nilai asli dari Spreadsheet.
     */
    return raw;
  }


  /*
   * FALLBACK:
   * Jika Timestamp hanya tersedia sebagai objek Date.
   */
  if(!d || isNaN(d.getTime())){
    return '—';
  }

  const tanggal =
    String(d.getDate()).padStart(2, '0');

  const bulan =
    String(d.getMonth() + 1).padStart(2, '0');

  const tahun =
    d.getFullYear();

  const jam =
    String(d.getHours()).padStart(2, '0');

  const menit =
    String(d.getMinutes()).padStart(2, '0');

  const detik =
    String(d.getSeconds()).padStart(2, '0');

  return `${tanggal}/${bulan}/${tahun} ${jam}:${menit}:${detik}`;
}


function isSameDay(a,b){
  return a &&
         b &&
         a.getFullYear()===b.getFullYear() &&
         a.getMonth()===b.getMonth() &&
         a.getDate()===b.getDate();
}


function esc(s){
  if(s===undefined || s===null) return '';

  return String(s).replace(
    /[&<>"']/g,
    c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c])
  );
}


function uid(){
  return 'id' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2,7);
}


/* ---------------- normalize rows ---------------- */

function normalizeRows(raw){

  if(!raw || !raw.length) return [];

  const headerRow = Object.keys(raw[0]);

  const keyFor = {};

  headerRow.forEach(h=>{

    const clean =
      String(h)
      .trim()
      .toLowerCase()
      .replace(/\s+/g,' ');

    keyFor[h] =
      HEADER_MAP[clean] || null;
  });


  return raw.map(r=>{

    const o = {};

    headerRow.forEach(h=>{

      const k = keyFor[h];

      if(k){
        o[k] =
          (r[h] ?? '')
          .toString()
          .trim();
      }

    });

    o._date = parseTimestamp(o.timestamp);

    return o;

  }).filter(o =>
    o._date ||
    o.pekerjaan ||
    o.up3
  );
}


/* ---------------- fetching ---------------- */

async function fetchAndParse(url){

  const res = await fetch(url);

  if(!res.ok){
    throw new Error('HTTP ' + res.status);
  }

  const text = await res.text();

  const trimmed = text.trim();

  if(
    trimmed.startsWith('[') ||
    trimmed.startsWith('{')
  ){

    const json = JSON.parse(trimmed);

    return Array.isArray(json)
      ? json
      : (json.data || json.rows || []);
  }

  return Papa.parse(
    text,
    {
      header:true,
      skipEmptyLines:true
    }
  ).data;
}


/* ---------------- ingest ---------------- */

function setStatus(msg, type){

  const el =
    document.getElementById('statusMsg');

  el.textContent = msg;

  el.className =
    'drawer-status ' + (type||'');
}


function ingest(rawRows, label){

  const norm =
    normalizeRows(rawRows);

  if(!norm.length){

    setStatus(
      'Tidak ada baris valid. Periksa header kolom (Timestamp, Unit UP3, Unit ULP, dst).',
      'err'
    );

    return;
  }

  rows = norm;

  setStatus(
    `Berhasil memuat ${rows.length} baris dari ${label}.`,
    'ok'
  );

  persistRows();

  assignCategoryColors();

  renderAll();
}


/* ---------------- persistence ---------------- */

function persistRows(){

  try{

    localStorage.setItem(
      STORAGE_ROWS_KEY,
      JSON.stringify(
        rows.map(r=>({
          ...r,
          _date:
            r._date
              ? r._date.toISOString()
              : null
        }))
      )
    );

  }catch(e){}
}


function restoreRows(){

  try{

    const raw =
      localStorage.getItem(STORAGE_ROWS_KEY);

    if(!raw) return false;

    const parsed =
      JSON.parse(raw);

    rows =
      parsed.map(r=>({
        ...r,
        _date:
          r._date
            ? new Date(r._date)
            : null
      }));

    return rows.length > 0;

  }catch(e){

    return false;
  }
}


/* ---------------- category colors ---------------- */

function assignCategoryColors(){

  const counts = {};

  rows.forEach(r=>{

    if(r.pekerjaan){

      counts[r.pekerjaan] =
        (counts[r.pekerjaan]||0) + 1;
    }

  });


  const top =
    Object.keys(counts)
    .sort((a,b)=>counts[b]-counts[a])
    .slice(0,CATEGORY_PALETTE.length);


  categoryColor = {};

  top.forEach((cat,i)=>{

    categoryColor[cat] =
      CATEGORY_PALETTE[i];
  });
}


function colorFor(cat){

  return categoryColor[cat] ||
    '#5d7196';
}


/* ---------------- camera ---------------- */

function renderCameraRow(){

  const el =
    document.getElementById('cameraRow');

  if(!rows.length){

    el.innerHTML =
      '<div class="camera-placeholder">Belum ada data perangkat CCTV. Klik ikon ⚙ di kanan atas untuk memuat data.</div>';

    return;
  }


  const latestByDevice = {};

  rows.forEach(r=>{

    if(!r.perangkat) return;

    const existing =
      latestByDevice[r.perangkat];

    if(
      !existing ||
      (
        r._date &&
        existing._date &&
        r._date > existing._date
      )
    ){

      latestByDevice[r.perangkat] = r;
    }

  });


  const devices =
    Object.values(latestByDevice)
    .sort(
      (a,b)=>
        (b._date?.getTime()||0) -
        (a._date?.getTime()||0)
    )
    .slice(0,4);


  el.innerHTML =
    devices.map(d=>`

      <div class="cam-card">

        <div class="cam-feed"></div>

        <div class="cam-tag">
          <span class="rec"></span>
          ${
            d._date &&
            isSameDay(d._date,new Date())
              ? 'AKTIF'
              : 'TERAKHIR'
          }
        </div>

        ${
          d.dokumentasi
            ? `<a class="cam-open"
                href="${esc(d.dokumentasi)}"
                target="_blank"
                rel="noopener">
                ↗ Dokumentasi
              </a>`
            : ''
        }

        <div class="cam-info">

          <div class="name">
            ${esc(d.perangkat)}
          </div>

          <div class="loc">
            ${esc(d.ulp || d.lokasi || '—')}
          </div>

        </div>

      </div>

    `).join('');
}


/* ---------------- line chart ---------------- */

function renderLineChart(){

  const cats =
    Object.keys(categoryColor);

  const now =
    new Date();

  const year =
    now.getFullYear();

  document.getElementById('lineSub')
    .textContent = String(year);


  const datasets =
    cats.map(cat=>{

      const monthly =
        new Array(12).fill(0);

      rows.forEach(r=>{

        if(
          r.pekerjaan === cat &&
          r._date &&
          r._date.getFullYear() === year
        ){

          monthly[
            r._date.getMonth()
          ]++;
        }

      });


      return {

        label:cat,

        data:monthly,

        borderColor:
          colorFor(cat),

        backgroundColor:
          colorFor(cat),

        tension:0.35,

        pointRadius:3,

        pointBackgroundColor:
          '#101f38',

        pointBorderColor:
          colorFor(cat),

        pointBorderWidth:2,

        borderWidth:2,

        fill:false
      };

    });


  if(lineChart)
    lineChart.destroy();


  lineChart =
    new Chart(
      document.getElementById('lineChart'),
      {
        type:'line',

        data:{
          labels:BULAN_ID,
          datasets
        },

        options:{

          responsive:true,

          plugins:{
            legend:{
              display:true,
              position:'right',
              labels:{
                color:'#93a6c4',
                boxWidth:9,
                boxHeight:9,
                font:{size:11}
              }
            }
          },

          scales:{

            x:{
              grid:{
                color:'#233a5e'
              },
              ticks:{
                color:'#93a6c4',
                font:{size:11}
              }
            },

            y:{
              grid:{
                color:'#233a5e'
              },
              ticks:{
                color:'#93a6c4',
                font:{
                  size:11
                },
                precision:0
              },
              beginAtZero:true
            }

          }

        }

      }
    );
}


/* ---------------- donut chart ---------------- */

function renderDonutChart(){

  const counts = {};

  rows.forEach(r=>{

    if(r.up3){

      counts[r.up3] =
        (counts[r.up3]||0)+1;
    }

  });


  let entries =
    Object.entries(counts)
    .sort((a,b)=>b[1]-a[1]);


  if(entries.length > 5){

    const rest =
      entries
      .slice(4)
      .reduce(
        (s,e)=>s+e[1],
        0
      );

    entries =
      entries
      .slice(0,4)
      .concat([
        ['Lainnya',rest]
      ]);
  }


  const labels =
    entries.map(e=>e[0]);

  const data =
    entries.map(e=>e[1]);

  const colors =
    labels.map(
      (_,i)=>
        CATEGORY_PALETTE[
          i % CATEGORY_PALETTE.length
        ]
    );


  if(donutChart)
    donutChart.destroy();


  donutChart =
    new Chart(
      document.getElementById('donutChart'),
      {
        type:'doughnut',

        data:{
          labels,

          datasets:[{
            data,

            backgroundColor:colors,

            borderColor:'#132542',

            borderWidth:3
          }]
        },

        options:{
          responsive:true,

          cutout:'68%',

          plugins:{
            legend:{
              display:false
            }
          }
        }
      }
    );


  document.getElementById('donutLegend')
    .innerHTML = labels.map((l,i)=>`

      <div class="legend-row">

        <span
          class="legend-dot"
          style="background:${colors[i]}">
        </span>

        ${esc(l)}

        <b>${data[i]}</b>

      </div>

    `).join('');
}


/* ---------------- stacked bar ---------------- */

function renderBarChart(){

  const ulpCounts = {};

  rows.forEach(r=>{

    if(r.ulp){

      ulpCounts[r.ulp] =
        (ulpCounts[r.ulp]||0)+1;
    }

  });


  const topUlp =
    Object.keys(ulpCounts)
    .sort((a,b)=>ulpCounts[b]-ulpCounts[a])
    .slice(0,7);


  const cats =
    Object.keys(categoryColor);


  const datasets =
    cats.map(cat=>({

      label:cat,

      data:
        topUlp.map(
          ulp =>
            rows.filter(
              r =>
                r.ulp===ulp &&
                r.pekerjaan===cat
            ).length
        ),

      backgroundColor:
        colorFor(cat),

      stack:'stack1'

    }));


  if(barChart)
    barChart.destroy();


  barChart =
    new Chart(
      document.getElementById('barChart'),
      {
        type:'bar',

        data:{
          labels:topUlp,
          datasets
        },

        options:{

          responsive:true,

          plugins:{
            legend:{
              display:true,
              position:'bottom',

              labels:{
                color:'#93a6c4',
                boxWidth:9,
                boxHeight:9,
                font:{size:11}
              }
            }
          },

          scales:{

            x:{
              stacked:true,
              grid:{
                display:false
              },
              ticks:{
                color:'#93a6c4',
                font:{size:11}
              }
            },

            y:{
              stacked:true,

              grid:{
                color:'#233a5e'
              },

              ticks:{
                color:'#93a6c4',
                font:{
                  size:11
                },
                precision:0
              },

              beginAtZero:true
            }

          }

        }

      }
    );
}


/* =========================================================
   RECENT ACTIVITY
   ========================================================= */

function renderRecentList(){

  const el =
    document.getElementById('recentList');

  const sorted =
    [...rows]
    .sort(
      (a,b)=>
        (b._date?.getTime()||0) -
        (a._date?.getTime()||0)
    )
    .slice(0,6);


  if(!sorted.length){

    el.innerHTML =
      '<div class="empty-mini">Belum ada data.</div>';

    return;
  }


  el.innerHTML =
    sorted.map(r=>`

      <div class="recent-item">

        <div>

          <div class="rname">
            ${esc(r.pekerjaan)||'—'}
          </div>

          <div class="rloc">
            ${esc(r.lokasi || r.ulp || '—')}
          </div>

        </div>


        <div class="recent-right">

          <!-- DIPERBAIKI: timestamp asli -->
          <span class="rdate">
            ${fmtDate(r._date, r.timestamp)}
          </span>

          <span
            class="badge"
            style="background:${colorFor(r.pekerjaan)}">

            ${esc(r.pekerjaan)||'—'}

          </span>

        </div>

      </div>

    `).join('');
}


/* =========================================================
   SUMMARY
   ========================================================= */

function renderSummary(){

  const today =
    new Date();

  const todays =
    rows.filter(
      r =>
        isSameDay(
          r._date,
          today
        )
    );


  document.getElementById('welcomeMsg')
    .textContent =
      rows.length

        ? `${HARI_ID[today.getDay()]}, ${fmtDate(today)} · ${rows.length} total pekerjaan tercatat, ${todays.length} hari ini.`

        : 'Selamat datang. Belum ada data — buka panel Sumber Data (⚙) untuk mulai.';


  document.getElementById('notifDot')
    .style.display =
      todays.length
        ? 'block'
        : 'none';
}


/* =========================================================
   RENDER ALL
   ========================================================= */

function renderAll(){

  renderSummary();

  renderCameraRow();

  renderLineChart();

  renderDonutChart();

  renderBarChart();

  renderRecentList();

  renderCurrentView();
}


/* =========================================================
   SEARCH
   ========================================================= */

document
  .getElementById('globalSearch')
  .addEventListener(
    'input',
    (e)=>{

      const q =
        e.target.value
        .trim()
        .toLowerCase();


      const el =
        document.getElementById(
          'recentList'
        );


      const source =
        q

          ? rows.filter(
              r =>
                [
                  r.pekerjaan,
                  r.petugas,
                  r.lokasi,
                  r.perangkat,
                  r.up3,
                  r.ulp
                ]
                .join(' ')
                .toLowerCase()
                .includes(q)
            )

          : rows;


      const sorted =
        [...source]
        .sort(
          (a,b)=>
            (b._date?.getTime()||0) -
            (a._date?.getTime()||0)
        )
        .slice(0,8);


      if(!sorted.length){

        el.innerHTML =
          '<div class="empty-mini">Tidak ada hasil.</div>';

        return;
      }


      el.innerHTML =
        sorted.map(r=>`

          <div class="recent-item">

            <div>

              <div class="rname">
                ${esc(r.pekerjaan)||'—'}
              </div>

              <div class="rloc">
                ${esc(r.lokasi || r.ulp || '—')}
              </div>

            </div>


            <div class="recent-right">

              <!-- DIPERBAIKI -->
              <span class="rdate">
                ${fmtDate(r._date, r.timestamp)}
              </span>

              <span
                class="badge"
                style="background:${colorFor(r.pekerjaan)}">

                ${esc(r.pekerjaan)||'—'}

              </span>

            </div>

          </div>

        `).join('');

    }
  );


/* =========================================================
   DATA SOURCE DRAWER
   ========================================================= */

const drawer =
  document.getElementById('dataDrawer');

const overlay =
  document.getElementById('drawerOverlay');


function openDrawer(){

  drawer.classList.add('open');

  overlay.classList.add('open');
}


function closeDrawerFn(){

  drawer.classList.remove('open');

  overlay.classList.remove('open');
}


document
  .getElementById('settingsBtn')
  .addEventListener(
    'click',
    openDrawer
  );


document
  .getElementById('openDataDrawerLink')
  .addEventListener(
    'click',
    (e)=>{
      e.preventDefault();
      openDrawer();
    }
  );


document
  .getElementById('closeDrawer')
  .addEventListener(
    'click',
    closeDrawerFn
  );


overlay.addEventListener(
  'click',
  closeDrawerFn
);


/* =========================================================
   FILE INPUT
   ========================================================= */

document
  .getElementById('fileInput')
  .addEventListener(
    'change',
    function(e){

      const file =
        e.target.files[0];

      if(!file) return;


      const name =
        file.name.toLowerCase();


      const reader =
        new FileReader();


      reader.onload =
        function(evt){

          try{

            if(name.endsWith('.csv')){

              ingest(
                Papa.parse(
                  evt.target.result,
                  {
                    header:true,
                    skipEmptyLines:true
                  }
                ).data,

                `file "${file.name}"`
              );

            }else{

              const wb =
                XLSX.read(
                  evt.target.result,
                  {type:'array'}
                );


              const json =
                XLSX.utils.sheet_to_json(
                  wb.Sheets[
                    wb.SheetNames[0]
                  ],
                  {defval:''}
                );


              ingest(
                json,
                `file "${file.name}"`
              );
            }

          }catch(err){

            setStatus(
              'Gagal membaca file: ' +
              err.message,
              'err'
            );
          }

        };


      if(name.endsWith('.csv'))

        reader.readAsText(file);

      else

        reader.readAsArrayBuffer(file);

    }
  );


/* =========================================================
   LOAD URL
   ========================================================= */

document
  .getElementById('loadUrlBtn')
  .addEventListener(
    'click',
    async ()=>{

      const url =
        document
        .getElementById(
          'csvUrlInput'
        )
        .value
        .trim();


      if(!url){

        setStatus(
          'Masukkan URL terlebih dahulu.',
          'err'
        );

        return;
      }


      setStatus(
        'Mengambil data dari URL…'
      );


      try{

        const data =
          await fetchAndParse(url);


        ingest(
          data,
          'sumber otomatis'
        );


        localStorage.setItem(
          STORAGE_URL_KEY,
          url
        );


        document
          .getElementById('refreshBtn')
          .style.display =
            'inline-block';


        startAutoRefresh();

      }catch(err){

        setStatus(
          'Gagal mengambil URL (kemungkinan CORS, atau sheet belum dipublikasikan). Coba Apps Script atau unggah file. Detail: ' +
          err.message,
          'err'
        );
      }

    }
  );


document
  .getElementById('refreshBtn')
  .addEventListener(
    'click',
    ()=>refreshFromSavedSource(true)
  );


/* =========================================================
   PASTE CSV
   ========================================================= */

document
  .getElementById('loadPasteBtn')
  .addEventListener(
    'click',
    ()=>{

      const text =
        document
        .getElementById(
          'csvPasteInput'
        )
        .value
        .trim();


      if(!text){

        setStatus(
          'Tempel data CSV terlebih dahulu.',
          'err'
        );

        return;
      }


      ingest(
        Papa.parse(
          text,
          {
            header:true,
            skipEmptyLines:true
          }
        ).data,

        'data tempel'
      );

    }
  );


/* =========================================================
   SAMPLE DATA
   ========================================================= */

document
  .getElementById('sampleBtn')
  .addEventListener(
    'click',
    ()=>{

      const sample = [

        {
          Timestamp:'24/11/2025 8:23:56',
          'Unit UP3':'UP3 Kendari',
          'Unit ULP':'ULP Wua Wua',
          'NAMA PERANGKAT CCTV':'CCTV WUA WUA',
          'Nama Pekerjaan':'Pelayanan Gangguan',
          'Lokasi Pekerjaan':'Kendari',
          'Petugas Pelaksana di Lapangan':'Andi Saputra',
          'Dokumentasi CCTV':'https://drive.google.com/open?id=1a',
          'Deskripsi':'Perbaikan koneksi jaringan CCTV pasca gangguan listrik.'
        },

        {
          Timestamp:'24/11/2025 10:05:12',
          'Unit UP3':'UP3 Kendari',
          'Unit ULP':'ULP Kolaka',
          'NAMA PERANGKAT CCTV':'CCTV KOLAKA 02',
          'Nama Pekerjaan':'Pemeliharaan Rutin',
          'Lokasi Pekerjaan':'Kolaka',
          'Petugas Pelaksana di Lapangan':'Budi Santoso',
          'Dokumentasi CCTV':'https://drive.google.com/open?id=1b',
          'Deskripsi':'Pembersihan lensa kamera.'
        },

        {
          Timestamp:'23/11/2025 14:40:00',
          'Unit UP3':'UP3 Bau-Bau',
          'Unit ULP':'ULP Baubau Kota',
          'NAMA PERANGKAT CCTV':'CCTV GARDU INDUK',
          'Nama Pekerjaan':'Instalasi Baru',
          'Lokasi Pekerjaan':'Baubau',
          'Petugas Pelaksana di Lapangan':'Citra Dewi',
          'Dokumentasi CCTV':'https://drive.google.com/open?id=1c',
          'Deskripsi':'Pemasangan unit CCTV baru.'
        },

        {
          Timestamp:'22/11/2025 9:15:30',
          'Unit UP3':'UP3 Kendari',
          'Unit ULP':'ULP Wua Wua',
          'NAMA PERANGKAT CCTV':'CCTV WUA WUA',
          'Nama Pekerjaan':'Perbaikan Perangkat',
          'Lokasi Pekerjaan':'Kendari',
          'Petugas Pelaksana di Lapangan':'Andi Saputra',
          'Dokumentasi CCTV':'https://drive.google.com/open?id=1d',
          'Deskripsi':'Penggantian kabel power.'
        },

        {
          Timestamp:'21/11/2025 16:02:45',
          'Unit UP3':'UP3 Bau-Bau',
          'Unit ULP':'ULP Wolio',
          'NAMA PERANGKAT CCTV':'CCTV WOLIO',
          'Nama Pekerjaan':'Pemeliharaan Rutin',
          'Lokasi Pekerjaan':'Wolio',
          'Petugas Pelaksana di Lapangan':'Dedi Kurniawan',
          'Dokumentasi CCTV':'https://drive.google.com/open?id=1e',
          'Deskripsi':'Pengecekan rekaman 7 hari terakhir.'
        },

        {
          Timestamp:'18/11/2025 11:30:00',
          'Unit UP3':'UP3 Kendari',
          'Unit ULP':'ULP Kolaka',
          'NAMA PERANGKAT CCTV':'CCTV KOLAKA 02',
          'Nama Pekerjaan':'Pelayanan Gangguan',
          'Lokasi Pekerjaan':'Kolaka',
          'Petugas Pelaksana di Lapangan':'Budi Santoso',
          'Dokumentasi CCTV':'https://drive.google.com/open?id=1f',
          'Deskripsi':'Gangguan sinyal kamera akibat cuaca ekstrem.'
        },

        {
          Timestamp:'15/11/2025 13:10:00',
          'Unit UP3':'UP3 Bau-Bau',
          'Unit ULP':'ULP Baubau Kota',
          'NAMA PERANGKAT CCTV':'CCTV GARDU INDUK',
          'Nama Pekerjaan':'Perbaikan Perangkat',
          'Lokasi Pekerjaan':'Baubau',
          'Petugas Pelaksana di Lapangan':'Citra Dewi',
          'Dokumentasi CCTV':'https://drive.google.com/open?id=1g',
          'Deskripsi':'Perbaikan bracket kamera yang longgar.'
        }

      ];


      ingest(
        sample,
        'data contoh'
      );

    }
  );


/* =========================================================
   CLEAR DATA
   ========================================================= */

document
  .getElementById('clearBtn')
  .addEventListener(
    'click',
    ()=>{

      rows = [];

      localStorage.removeItem(
        STORAGE_ROWS_KEY
      );

      localStorage.removeItem(
        STORAGE_URL_KEY
      );


      document
        .getElementById('refreshBtn')
        .style.display =
          'none';


      setStatus(
        'Data tersimpan telah dihapus.'
      );


      if(autoRefreshTimer)
        clearInterval(
          autoRefreshTimer
        );


      renderAll();

    }
  );


/* =========================================================
   AUTO REFRESH
   ========================================================= */

function startAutoRefresh(){

  if(autoRefreshTimer)
    clearInterval(
      autoRefreshTimer
    );


  autoRefreshTimer =
    setInterval(
      ()=>refreshFromSavedSource(false),
      5*60*1000
    );
}


async function refreshFromSavedSource(manual){

  const url =
    localStorage.getItem(
      STORAGE_URL_KEY
    );


  if(!url) return;


  try{

    if(manual)
      setStatus(
        'Menyegarkan data…'
      );


    const data =
      await fetchAndParse(url);


    ingest(
      data,
      'sumber otomatis (diperbarui)'
    );

  }catch(err){

    if(manual)
      setStatus(
        'Gagal menyegarkan: ' +
        err.message,
        'err'
      );
  }
}


/* =========================================================
   THEME
   ========================================================= */

document
  .getElementById('themeToggle')
  .addEventListener(
    'click',
    ()=>{

      document.body
        .classList
        .toggle('theme-light');


      localStorage.setItem(
        STORAGE_THEME_KEY,

        document.body
          .classList
          .contains('theme-light')
          ? 'light'
          : 'dark'
      );

    }
  );


/* =========================================================
   SIDEBAR
   ========================================================= */

document
  .getElementById('sidebarToggle')
  .addEventListener(
    'click',
    ()=>{

      document
        .getElementById('sidebar')
        .classList
        .toggle('collapsed');

    }
  );


/* =========================================================
   VIEW SWITCHING
   ========================================================= */

const VIEW_RENDERERS = {

  'petugas-tambah':
    renderPetugasTambahView,

  'petugas-kontak':
    renderPetugasKontakView,

  'petugas-grafik':
    renderPetugasGrafikView,

  'cctv-direktori':
    renderDirektoriView,

  'data-kelola':
    renderKelolaDataView,

  'laporan-rekap':
    renderRekapView,

  'profil':
    renderProfilView,

  'kalender':
    renderKalenderView,

  'faq':
    renderFaqView,

  'metrik-unit':
    renderMetrikUnitView,

  'metrik-akumulasi':
    renderMetrikAkumulasiView,

  'metrik-peta':
    renderMetrikPetaView
};


let currentView =
  'dashboard';


function showView(viewId){

  document
    .querySelectorAll('.view')
    .forEach(
      v =>
        v.classList.remove(
          'active'
        )
    );


  const target =
    document.getElementById(
      'view-' + viewId
    );


  if(!target) return;


  target.classList.add('active');

  currentView =
    viewId;


  document
    .querySelectorAll(
      '.nav-link[data-view]'
    )
    .forEach(l=>{

      l.classList.toggle(
        'active',
        l.dataset.view === viewId
      );

    });


  if(VIEW_RENDERERS[viewId])
    VIEW_RENDERERS[viewId]();
}


function renderCurrentView(){

  if(
    currentView !== 'dashboard' &&
    VIEW_RENDERERS[currentView]
  ){

    VIEW_RENDERERS[currentView]();
  }
}


document
  .querySelectorAll(
    '.nav-link[data-view]'
  )
  .forEach(link=>{

    link.addEventListener(
      'click',
      (e)=>{

        e.preventDefault();

        showView(
          link.dataset.view
        );

      }
    );

  });


/* =========================================================
   DATA PETUGAS
   ========================================================= */

function loadPetugas(){

  try{

    return JSON.parse(
      localStorage.getItem(
        STORAGE_PETUGAS_KEY
      )
    ) || [];

  }catch(e){

    return [];
  }
}


function savePetugas(list){

  localStorage.setItem(
    STORAGE_PETUGAS_KEY,
    JSON.stringify(list)
  );
}


function renderPetugasTambahView(){

  renderPetugasTable();
}


function renderPetugasTable(){

  const list =
    loadPetugas();

  const tbody =
    document.querySelector(
      '#petugasTable tbody'
    );


  if(!list.length){

    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-mini">Belum ada petugas ditambahkan.</td></tr>';

    return;
  }


  tbody.innerHTML =
    list.map(p=>`

      <tr>

        <td>
          ${esc(p.nama)}
        </td>

        <td>
          ${esc(p.telepon)||'—'}
        </td>

        <td>
          ${esc(p.email)||'—'}
        </td>

        <td>
          ${esc(p.unit)||'—'}
        </td>

        <td>

          <span
            class="link-btn"
            data-edit="${p.id}">
            Edit
          </span>

          <span
            class="link-btn danger"
            data-del="${p.id}">
            Hapus
          </span>

        </td>

      </tr>

    `).join('');


  tbody
    .querySelectorAll('[data-edit]')
    .forEach(
      el =>
        el.addEventListener(
          'click',
          ()=>startEditPetugas(
            el.dataset.edit
          )
        )
    );


  tbody
    .querySelectorAll('[data-del]')
    .forEach(
      el =>
        el.addEventListener(
          'click',
          ()=>deletePetugas(
            el.dataset.del
          )
        )
    );
}


function startEditPetugas(id){

  const p =
    loadPetugas()
    .find(x=>x.id===id);


  if(!p) return;


  document
    .getElementById('petugasEditId')
    .value = p.id;


  document
    .getElementById('petugasNama')
    .value = p.nama || '';


  document
    .getElementById('petugasTelepon')
    .value = p.telepon || '';


  document
    .getElementById('petugasEmail')
    .value = p.email || '';


  document
    .getElementById('petugasUnit')
    .value = p.unit || '';


  document
    .getElementById('petugasFormTitle')
    .textContent =
      'Edit Petugas';


  document
    .getElementById('petugasSubmitBtn')
    .textContent =
      'Simpan Perubahan';


  document
    .getElementById('petugasCancelEdit')
    .style.display =
      'inline-block';
}


function resetPetugasForm(){

  document
    .getElementById('petugasForm')
    .reset();


  document
    .getElementById('petugasEditId')
    .value = '';


  document
    .getElementById('petugasFormTitle')
    .textContent =
      'Tambah Petugas Baru';


  document
    .getElementById('petugasSubmitBtn')
    .textContent =
      'Simpan Petugas';


  document
    .getElementById('petugasCancelEdit')
    .style.display =
      'none';
}


function deletePetugas(id){

  const list =
    loadPetugas()
    .filter(
      p=>p.id!==id
    );


  savePetugas(list);

  renderPetugasTable();


  if(currentView==='petugas-kontak')
    renderKontakGrid();
}


document
  .getElementById('petugasForm')
  .addEventListener(
    'submit',
    (e)=>{

      e.preventDefault();


      const id =
        document
        .getElementById(
          'petugasEditId'
        )
        .value;


      const nama =
        document
        .getElementById(
          'petugasNama'
        )
        .value
        .trim();


      if(!nama) return;


      const data = {

        id:
          id || uid(),

        nama,

        telepon:
          document
          .getElementById(
            'petugasTelepon'
          )
          .value
          .trim(),

        email:
          document
          .getElementById(
            'petugasEmail'
          )
          .value
          .trim(),

        unit:
          document
          .getElementById(
            'petugasUnit'
          )
          .value
          .trim()

      };


      let list =
        loadPetugas();


      if(id){

        list =
          list.map(
            p =>
              p.id===id
                ? data
                : p
          );

      }else{

        list.push(data);
      }


      savePetugas(list);

      resetPetugasForm();

      renderPetugasTable();

    }
  );


document
  .getElementById(
    'petugasCancelEdit'
  )
  .addEventListener(
    'click',
    resetPetugasForm
  );


function renderPetugasKontakView(){

  renderKontakGrid();
}


function renderKontakGrid(){

  const list =
    loadPetugas();


  const el =
    document.getElementById(
      'kontakGrid'
    );


  if(!list.length){

    el.innerHTML =
      '<div class="empty-mini">Belum ada petugas terdaftar. Tambahkan lewat menu "Tambah Petugas".</div>';

    return;
  }


  el.innerHTML =
    list.map(p=>`

      <div class="kontak-card">

        <div class="kname">
          ${esc(p.nama)}
        </div>

        <div class="krow">
          <b>Telepon:</b>
          ${esc(p.telepon)||'—'}
        </div>

        <div class="krow">
          <b>Email:</b>
          ${esc(p.email)||'—'}
        </div>

        <div class="krow">
          <b>Unit:</b>
          ${esc(p.unit)||'—'}
        </div>

      </div>

    `).join('');
}


function renderPetugasGrafikView(){

  const counts = {};

  rows.forEach(r=>{

    if(r.petugas){

      counts[r.petugas] =
        (counts[r.petugas]||0)+1;
    }

  });


  const entries =
    Object.entries(counts)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,12);


  if(petugasChart)
    petugasChart.destroy();


  petugasChart =
    new Chart(
      document.getElementById(
        'petugasChart'
      ),
      {

        type:'bar',

        data:{

          labels:
            entries.map(e=>e[0]),

          datasets:[{

            label:'Jumlah Pekerjaan',

            data:
              entries.map(e=>e[1]),

            backgroundColor:
              '#5aa4f5'

          }]

        },

        options:{

          indexAxis:'y',

          responsive:true,

          plugins:{
            legend:{
              display:false
            }
          },

          scales:{

            x:{
              grid:{
                color:'#233a5e'
              },

              ticks:{
                color:'#93a6c4',
                precision:0
              },

              beginAtZero:true
            },

            y:{
              grid:{
                display:false
              },

              ticks:{
                color:'#93a6c4',
                font:{
                  size:11
                }
              }
            }

          }

        }

      }
    );
}


/* =========================================================
   DIREKTORI CCTV
   ========================================================= */

function renderDirektoriView(){

  const byDevice = {};


  rows.forEach(r=>{

    if(!r.perangkat) return;


    if(!byDevice[r.perangkat]){

      byDevice[r.perangkat] = {
        count:0,
        latest:null
      };

    }


    byDevice[r.perangkat].count++;


    if(
      !byDevice[r.perangkat].latest ||
      (
        r._date &&
        r._date >
        byDevice[r.perangkat]
          .latest._date
      )
    ){

      byDevice[r.perangkat]
        .latest = r;
    }

  });


  const tbody =
    document.querySelector(
      '#direktoriTable tbody'
    );


  const entries =
    Object.entries(byDevice);


  if(!entries.length){

    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-mini">Belum ada data perangkat.</td></tr>';

    return;
  }


  tbody.innerHTML =
    entries.map(
      ([name,info])=>`

      <tr>

        <td>
          ${esc(name)}
        </td>

        <td>
          ${esc(
            info.latest.ulp ||
            info.latest.lokasi ||
            '—'
          )}
        </td>

        <!-- DIPERBAIKI -->
        <td>
          ${fmtDate(
            info.latest._date,
            info.latest.timestamp
          )}
        </td>

        <td>
          ${info.count}
        </td>

        <td>

          ${
            info.latest.dokumentasi

              ? `<a
                  class="link-btn"
                  href="${esc(info.latest.dokumentasi)}"
                  target="_blank"
                  rel="noopener">
                  ↗ Buka
                </a>`

              : '—'
          }

        </td>

      </tr>

    `).join('');
}


/* =========================================================
   KELOLA DATA
   ========================================================= */

function renderKelolaDataView(){

  renderKelolaTable(rows);
}


function renderKelolaTable(source){

  const tbody =
    document.querySelector(
      '#kelolaTable tbody'
    );


  const sorted =
    [...source]
    .sort(
      (a,b)=>
        (b._date?.getTime()||0) -
        (a._date?.getTime()||0)
    );


  if(!sorted.length){

    tbody.innerHTML =
      '<tr><td colspan="7" class="empty-mini">Belum ada data.</td></tr>';

    return;
  }


  tbody.innerHTML =
    sorted.map(r=>`

      <tr>

        <!-- DIPERBAIKI -->
        <td>
          ${fmtDate(
            r._date,
            r.timestamp
          )}
        </td>

        <td>
          ${esc(r.up3)||'—'}
        </td>

        <td>
          ${esc(r.ulp)||'—'}
        </td>

        <td>
          ${esc(r.perangkat)||'—'}
        </td>

        <td>
          ${esc(r.pekerjaan)||'—'}
        </td>

        <td>
          ${esc(r.lokasi)||'—'}
        </td>

        <td>
          ${esc(r.petugas)||'—'}
        </td>

      </tr>

    `).join('');
}


document
  .getElementById('kelolaSearch')
  .addEventListener(
    'input',
    (e)=>{

      const q =
        e.target.value
        .trim()
        .toLowerCase();


      const source =
        q

          ? rows.filter(
              r =>
                [
                  r.pekerjaan,
                  r.petugas,
                  r.lokasi,
                  r.perangkat,
                  r.up3,
                  r.ulp
                ]
                .join(' ')
                .toLowerCase()
                .includes(q)
            )

          : rows;


      renderKelolaTable(source);

    }
  );


/* =========================================================
   EXPORT DATA
   ========================================================= */

document
  .getElementById('kelolaExportBtn')
  .addEventListener(
    'click',
    ()=>{

      const csv =
        Papa.unparse(

          rows.map(r=>({

            // DIPERBAIKI
            Tanggal:
              fmtDate(
                r._date,
                r.timestamp
              ),

            'Unit UP3':
              r.up3||'',

            'Unit ULP':
              r.ulp||'',

            Perangkat:
              r.perangkat||'',

            Pekerjaan:
              r.pekerjaan||'',

            Lokasi:
              r.lokasi||'',

            Petugas:
              r.petugas||''

          }))

        );


      downloadCsv(
        csv,
        'kelola-data.csv'
      );

    }
  );


function downloadCsv(
  csvText,
  filename
){

  const blob =
    new Blob(
      [csvText],
      {
        type:
          'text/csv;charset=utf-8;'
      }
    );


  const url =
    URL.createObjectURL(blob);


  const a =
    document.createElement('a');


  a.href = url;

  a.download = filename;


  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);


  URL.revokeObjectURL(url);
}


/* =========================================================
   REKAP
   ========================================================= */

function renderRekapView(){

  const sel =
    document.getElementById(
      'rekapBulan'
    );


  const months =
    Array.from(
      new Set(
        rows
        .filter(r=>r._date)
        .map(
          r =>
            `${r._date.getFullYear()}-${r._date.getMonth()}`
        )
      )
    )
    .sort()
    .reverse();


  sel.innerHTML =
    '<option value="all">Semua periode</option>' +

    months.map(m=>{

      const [y,mo] =
        m.split('-').map(Number);


      return `
        <option value="${m}">
          ${BULAN_ID[mo]} ${y}
        </option>
      `;

    }).join('');


  sel.onchange =
    renderRekapTable;


  renderRekapTable();
}


function renderRekapTable(){

  const sel =
    document.getElementById(
      'rekapBulan'
    ).value || 'all';


  const source =
    sel==='all'

      ? rows

      : rows.filter(r=>{

          if(!r._date)
            return false;


          const [y,mo] =
            sel
            .split('-')
            .map(Number);


          return
            r._date.getFullYear()===y &&
            r._date.getMonth()===mo;

        });


  const counts = {};


  source.forEach(r=>{

    if(r.pekerjaan){

      counts[r.pekerjaan] =
        (counts[r.pekerjaan]||0)+1;
    }

  });


  const entries =
    Object.entries(counts)
    .sort((a,b)=>b[1]-a[1]);


  const tbody =
    document.querySelector(
      '#rekapTable tbody'
    );


  tbody.innerHTML =
    entries.length

      ? entries
          .map(
            ([cat,n])=>
              `<tr>
                <td>${esc(cat)}</td>
                <td>${n}</td>
              </tr>`
          )
          .join('')

      : '<tr><td colspan="2" class="empty-mini">Tidak ada data pada periode ini.</td></tr>';
}


document
  .getElementById('rekapExportBtn')
  .addEventListener(
    'click',
    ()=>{

      const rowsForExport =

        [
          ...document
            .querySelectorAll(
              '#rekapTable tbody tr'
            )
        ]

        .map(tr=>{

          const tds =
            tr.querySelectorAll('td');


          return tds.length===2

            ? {
                Kategori:
                  tds[0].textContent,

                Jumlah:
                  tds[1].textContent
              }

            : null;

        })

        .filter(Boolean);


      if(!rowsForExport.length)
        return;


      downloadCsv(
        Papa.unparse(rowsForExport),
        'rekap-laporan.csv'
      );

    }
  );


/* =========================================================
   PROFIL
   ========================================================= */

function loadProfile(){

  try{

    return JSON.parse(
      localStorage.getItem(
        STORAGE_PROFILE_KEY
      )
    ) || {
      nama:'Admin',
      role:'K3 Supervisor'
    };

  }catch(e){

    return {
      nama:'Admin',
      role:'K3 Supervisor'
    };

  }
}


function applyProfileToSidebar(){

  const p =
    loadProfile();


  document
    .getElementById('profileName')
    .textContent =
      p.nama || 'Admin';


  document
    .getElementById('profileRole')
    .textContent =
      p.role || 'K3 Supervisor';


  document
    .getElementById('avatarInitial')
    .textContent =
      (
        p.nama || 'A'
      )
      .trim()
      .charAt(0)
      .toUpperCase() || 'A';
}


function renderProfilView(){

  const p =
    loadProfile();


  document
    .getElementById('profilNama')
    .value =
      p.nama || '';


  document
    .getElementById('profilRole')
    .value =
      p.role || '';
}


document
  .getElementById('profilForm')
  .addEventListener(
    'submit',
    (e)=>{

      e.preventDefault();


      const data = {

        nama:
          document
          .getElementById(
            'profilNama'
          )
          .value
          .trim() ||
          'Admin',

        role:
          document
          .getElementById(
            'profilRole'
          )
          .value
          .trim() ||
          'K3 Supervisor'

      };


      localStorage.setItem(
        STORAGE_PROFILE_KEY,
        JSON.stringify(data)
      );


      applyProfileToSidebar();

    }
  );


/* =========================================================
   KALENDER
   ========================================================= */

function renderKalenderView(){

  renderCalendar();
}


function renderCalendar(){

  const year =
    calCursor.getFullYear();

  const month =
    calCursor.getMonth();


  document
    .getElementById('calLabel')
    .textContent =
      `${[
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember'
      ][month]} ${year}`;


  const countByDay = {};


  rows.forEach(r=>{

    if(
      r._date &&
      r._date.getFullYear()===year &&
      r._date.getMonth()===month
    ){

      const d =
        r._date.getDate();

      countByDay[d] =
        (countByDay[d]||0)+1;

    }

  });


  const firstDow =
    new Date(
      year,
      month,
      1
    ).getDay();


  const daysInMonth =
    new Date(
      year,
      month+1,
      0
    ).getDate();


  const today =
    new Date();


  let cells =
    [
      'Min',
      'Sen',
      'Sel',
      'Rab',
      'Kam',
      'Jum',
      'Sab'
    ]
    .map(
      d =>
        `<div class="cal-dow">${d}</div>`
    )
    .join('');


  for(
    let i=0;
    i<firstDow;
    i++
  ){

    cells +=
      '<div class="cal-day empty"></div>';
  }


  for(
    let d=1;
    d<=daysInMonth;
    d++
  ){

    const isToday =
      today.getFullYear()===year &&
      today.getMonth()===month &&
      today.getDate()===d;


    cells += `

      <div
        class="cal-day${isToday?' today':''}"
        data-day="${d}">

        <span class="dnum">
          ${d}
        </span>

        ${
          countByDay[d]
            ? `<span class="dcount">
                ${countByDay[d]}
              </span>`
            : ''
        }

      </div>

    `;
  }


  const grid =
    document.getElementById(
      'calendarGrid'
    );


  grid.innerHTML =
    cells;


  grid
    .querySelectorAll(
      '.cal-day[data-day]'
    )
    .forEach(cell=>{

      cell.addEventListener(
        'click',
        ()=>showCalDayDetail(
          year,
          month,
          parseInt(
            cell.dataset.day,
            10
          )
        )
      );

    });
}


function showCalDayDetail(
  year,
  month,
  day
){

  const dayRows =
    rows.filter(
      r =>
        r._date &&
        r._date.getFullYear()===year &&
        r._date.getMonth()===month &&
        r._date.getDate()===day
    );


  document
    .getElementById('calDayTitle')
    .textContent =
      `${day} ${
        [
          'Januari',
          'Februari',
          'Maret',
          'April',
          'Mei',
          'Juni',
          'Juli',
          'Agustus',
          'September',
          'Oktober',
          'November',
          'Desember'
        ][month]
      } ${year} · ${
        dayRows.length
      } pekerjaan`;


  const el =
    document.getElementById(
      'calDayList'
    );


  el.innerHTML =
    dayRows.length

      ? dayRows
          .map(r=>`

            <div class="recent-item">

              <div>

                <div class="rname">
                  ${esc(r.pekerjaan)||'—'}
                </div>

                <div class="rloc">
                  ${esc(
                    r.lokasi ||
                    r.ulp ||
                    '—'
                  )}
                  ·
                  ${esc(
                    r.petugas
                  )||'—'}
                </div>

              </div>

              <span
                class="badge"
                style="background:${colorFor(r.pekerjaan)}">

                ${esc(r.pekerjaan)||'—'}

              </span>

            </div>

          `)
          .join('')

      : '<div class="empty-mini">Tidak ada pekerjaan pada tanggal ini.</div>';
}


document
  .getElementById('calPrev')
  .addEventListener(
    'click',
    ()=>{

      calCursor =
        new Date(
          calCursor.getFullYear(),
          calCursor.getMonth()-1,
          1
        );

      renderCalendar();

    }
  );


document
  .getElementById('calNext')
  .addEventListener(
    'click',
    ()=>{

      calCursor =
        new Date(
          calCursor.getFullYear(),
          calCursor.getMonth()+1,
          1
        );

      renderCalendar();

    }
  );


/* =========================================================
   FAQ
   ========================================================= */

const FAQ_ITEMS = [

  {
    q:'Bagaimana cara memuat data ke dashboard?',
    a:'Buka ikon ⚙ (Sumber Data) di kanan atas, lalu pilih salah satu cara: unggah file spreadsheet, tempel URL CSV/Apps Script otomatis, atau tempel data CSV secara manual.'
  },

  {
    q:'Apakah data diperbarui otomatis?',
    a:'Ya, jika kamu menggunakan opsi "Sumber otomatis (live)" dengan URL CSV, dashboard akan menyegarkan data setiap 5 menit secara otomatis, dan juga bisa disegarkan manual lewat tombol "Segarkan sekarang".'
  },

  {
    q:'Ke mana data petugas dan profil disimpan?',
    a:'Data petugas dan profil admin disimpan langsung di browser (localStorage), bukan di spreadsheet. Artinya data ini khusus untuk perangkat/browser yang dipakai.'
  },

  {
    q:'Bagaimana cara menambahkan koordinat di Peta Wilayah?',
    a:'Buka menu "Peta Wilayah", isi kolom Latitude dan Longitude pada baris lokasi yang sesuai, lalu data akan otomatis tersimpan di browser.'
  },

  {
    q:'Kenapa grafik terlihat kosong?',
    a:'Grafik akan kosong jika belum ada data yang dimuat, atau data yang dimuat tidak memiliki kolom Timestamp/Nama Pekerjaan yang valid. Periksa kembali format kolom di sumber data.'
  }

];


function renderFaqView(){

  const el =
    document.getElementById(
      'faqList'
    );


  el.innerHTML =
    FAQ_ITEMS
    .map(
      (f,i)=>`

        <div
          class="faq-item"
          data-i="${i}">

          <div class="faq-q">

            ${esc(f.q)}

            <span>+</span>

          </div>

          <div class="faq-a">

            ${esc(f.a)}

          </div>

        </div>

      `
    )
    .join('');


  el
    .querySelectorAll(
      '.faq-item'
    )
    .forEach(item=>{

      item
        .querySelector('.faq-q')
        .addEventListener(
          'click',
          () =>
            item
              .classList
              .toggle('open')
        );

    });
}


/* =========================================================
   METRIK UNIT
   ========================================================= */

function renderMetrikUnitView(){

  const counts = {};


  rows.forEach(r=>{

    if(r.ulp){

      counts[r.ulp] =
        (counts[r.ulp]||0)+1;
    }

  });


  const entries =
    Object.entries(counts)
    .sort(
      (a,b)=>b[1]-a[1]
    );


  if(unitChart)
    unitChart.destroy();


  unitChart =
    new Chart(
      document.getElementById(
        'unitChart'
      ),
      {

        type:'bar',

        data:{

          labels:
            entries.map(e=>e[0]),

          datasets:[{

            label:
              'Total Pekerjaan',

            data:
              entries.map(e=>e[1]),

            backgroundColor:
              '#3fae8f'

          }]

        },

        options:{

          responsive:true,

          plugins:{
            legend:{
              display:false
            }
          },

          scales:{

            x:{
              grid:{
                display:false
              },

              ticks:{
                color:'#93a6c4',
                font:{size:11}
              }
            },

            y:{
              grid:{
                color:'#233a5e'
              },

              ticks:{
                color:'#93a6c4',
                precision:0
              },

              beginAtZero:true
            }

          }

        }

      }
    );


  const tbody =
    document.querySelector(
      '#unitTable tbody'
    );


  tbody.innerHTML =
    entries.length

      ? entries
          .map(
            ([u,n])=>
              `<tr>
                <td>${esc(u)}</td>
                <td>${n}</td>
              </tr>`
          )
          .join('')

      : '<tr><td colspan="2" class="empty-mini">Belum ada data.</td></tr>';
}


/* =========================================================
   METRIK AKUMULASI
   ========================================================= */

function renderMetrikAkumulasiView(){

  const sorted =
    [...rows]
    .filter(r=>r._date)
    .sort(
      (a,b)=>
        a._date-b._date
    );


  const labels = [];

  const data = [];

  let running = 0;


  sorted.forEach(r=>{

    running++;


    /*
     * Gunakan Timestamp asli
     * agar label grafik juga tidak kehilangan jam.
     */
    labels.push(
      fmtDate(
        r._date,
        r.timestamp
      )
    );


    data.push(
      running
    );

  });


  if(akumulasiChart)
    akumulasiChart.destroy();


  akumulasiChart =
    new Chart(
      document.getElementById(
        'akumulasiChart'
      ),
      {

        type:'line',

        data:{

          labels,

          datasets:[{

            label:
              'Total Kumulatif',

            data,

            borderColor:
              '#5aa4f5',

            backgroundColor:
              'rgba(90,164,245,.15)',

            fill:true,

            tension:.25,

            pointRadius:0,

            borderWidth:2

          }]

        },

        options:{

          responsive:true,

          plugins:{
            legend:{
              display:false
            }
          },

          scales:{

            x:{
              grid:{
                display:false
              },

              ticks:{
                color:'#93a6c4',
                maxTicksLimit:8,
                font:{size:10}
              }
            },

            y:{
              grid:{
                color:'#233a5e'
              },

              ticks:{
                color:'#93a6c4',
                precision:0
              },

              beginAtZero:true
            }

          }

        }

      }
    );
}


/* =========================================================
   PETA WILAYAH
   ========================================================= */

function loadWilayahCoords(){

  try{

    return JSON.parse(
      localStorage.getItem(
        STORAGE_WILAYAH_KEY
      )
    ) || {};

  }catch(e){

    return {};
  }
}


function saveWilayahCoords(map){

  localStorage.setItem(
    STORAGE_WILAYAH_KEY,
    JSON.stringify(map)
  );
}


function renderMetrikPetaView(){

  const counts = {};


  rows.forEach(r=>{

    const key =
      r.ulp || r.lokasi;


    if(key){

      counts[key] =
        (counts[key]||0)+1;
    }

  });


  const coords =
    loadWilayahCoords();


  const entries =
    Object.entries(counts)
    .sort(
      (a,b)=>b[1]-a[1]
    );


  const tbody =
    document.querySelector(
      '#petaTable tbody'
    );


  if(!entries.length){

    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-mini">Belum ada data wilayah.</td></tr>';

    return;
  }


  tbody.innerHTML =
    entries.map(
      ([loc,n])=>{

        const c =
          coords[loc] || {};


        return `

          <tr data-loc="${esc(loc)}">

            <td>
              ${esc(loc)}
            </td>

            <td>
              ${n}
            </td>

            <td>
              <input
                type="text"
                class="lat-input"
                value="${esc(c.lat||'')}"
                placeholder="-3.99">
            </td>

            <td>
              <input
                type="text"
                class="lng-input"
                value="${esc(c.lng||'')}"
                placeholder="122.51">
            </td>

            <td>

              <span
                class="link-btn"
                data-save-loc="${esc(loc)}">

                Simpan

              </span>

            </td>

          </tr>

        `;
      }
    ).join('');


  tbody
    .querySelectorAll(
      '[data-save-loc]'
    )
    .forEach(btn=>{

      btn.addEventListener(
        'click',
        ()=>{

          const loc =
            btn.dataset.saveLoc;


          const tr =
            btn.closest('tr');


          const lat =
            tr
            .querySelector(
              '.lat-input'
            )
            .value
            .trim();


          const lng =
            tr
            .querySelector(
              '.lng-input'
            )
            .value
            .trim();


          const map =
            loadWilayahCoords();


          map[loc] = {
            lat,
            lng
          };


          saveWilayahCoords(
            map
          );


          btn.textContent =
            'Tersimpan ✓';


          setTimeout(
            ()=>btn.textContent='Simpan',
            1200
          );

        }
      );

    });
}


/* =========================================================
   BOOT
   ========================================================= */

(function init(){

  if(
    localStorage.getItem(
      STORAGE_THEME_KEY
    ) === 'light'
  ){

    document.body
      .classList
      .add('theme-light');
  }


  applyProfileToSidebar();


  const hadCache =
    restoreRows();


  if(hadCache){

    assignCategoryColors();

    setStatus(
      `${rows.length} baris dimuat dari sesi sebelumnya.`,
      'ok'
    );
  }


  renderAll();


  /*
   * Prioritas 1:
   * URL default
   */
  if(
    DEFAULT_SOURCE_URL &&
    DEFAULT_SOURCE_URL !==
      'TEMPEL_LINK_ANDA_DI_SINI'
  ){

    localStorage.setItem(
      STORAGE_URL_KEY,
      DEFAULT_SOURCE_URL
    );


    document
      .getElementById(
        'csvUrlInput'
      )
      .value =
        DEFAULT_SOURCE_URL;


    document
      .getElementById(
        'refreshBtn'
      )
      .style.display =
        'inline-block';


    setStatus(
      'Mengambil data dari sumber…'
    );


    refreshFromSavedSource(
      false
    );


    startAutoRefresh();

    return;
  }


  /*
   * Prioritas 2:
   * URL yang pernah disimpan
   */
  const savedUrl =
    localStorage.getItem(
      STORAGE_URL_KEY
    );


  if(savedUrl){

    document
      .getElementById(
        'csvUrlInput'
      )
      .value =
        savedUrl;


    document
      .getElementById(
        'refreshBtn'
      )
      .style.display =
        'inline-block';


    refreshFromSavedSource(
      false
    );


    startAutoRefresh();

  }else if(!hadCache){

    openDrawer();
  }

})();
