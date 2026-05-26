const SHEET_ID = '1M2IaUBWA2PfXyn0BMdBXdy8lQq2bfiAPoIh8ERDeDCA';
const SHEET_GID = '0';
const REFRESH_SECONDS = 30;

let allData = [];
let currentFilter = 'todos';
let countdown = REFRESH_SECONDS;
let countdownTimer = null;
let refreshTimer = null;
let chartUsado = null, chartFin = null;

function norm(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function col(row, ...keys) {
  for (const k of keys) {
    const found = Object.keys(row).find(rk => norm(rk) === norm(k));
    if (found !== undefined && row[found] !== undefined) return row[found];
  }
  return '';
}

function showToast(msg, ok = true) {
  const t = document.getElementById('toast');
  t.textContent = (ok ? '✅ ' : '❌ ') + msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

async function fetchData(manual = false) {
  const icon = document.getElementById('refreshIcon');
  icon.classList.add('spinning');
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const csv = await res.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    allData = parsed.data;
    updateKPIs();
    renderCards();
    if (document.getElementById('chartsOverlay').classList.contains('open')) buildCharts();
    document.getElementById('statusText').textContent = 'Live';
    if (manual) showToast(`${allData.length} leads cargados`);
    resetCountdown();
  } catch (e) {
    document.getElementById('statusText').textContent = 'Error';
    showToast('No se pudo cargar el sheet', false);
    document.getElementById('cardContainer').innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-red-500 text-center px-4">
      <span class="material-symbols-outlined text-5xl mb-3">error</span>
      <p class="text-sm font-bold mb-2">Error al cargar datos</p>
      <p class="text-xs opacity-80 break-all">${e.message}</p>
      <p class="text-xs opacity-80 mt-2">¿Estás abriendo el archivo localmente (file://)? Algunos navegadores bloquean estas peticiones por seguridad. Prueba usar un servidor local.</p>
    </div>`;
  }
  icon.classList.remove('spinning');
}

function updateKPIs() {
  const total = allData.length;
  const usado = allData.filter(r => norm(col(r, 'entrega usado', 'entrega_usado')) === 'si').length;
  const finSi = allData.filter(r => {
    const f = norm(col(r, 'financiacion', 'financiacion'));
    return f.includes('plan') || f === 'si' || f === 'si';
  }).length;
  const finNo = allData.filter(r => norm(col(r, 'financiacion', 'financiacion')) === 'no').length;

  [['kpiTotal', total], ['kpiUsado', usado], ['kpiFinanciacion', finSi], ['kpiNo', finNo]].forEach(([id, target]) => {
    const el = document.getElementById(id);
    if (!el) return;
    let n = 0;
    clearInterval(el._t);
    el._t = setInterval(() => {
      n = Math.min(n + Math.ceil(target / 20), target);
      el.textContent = n;
      if (n >= target) clearInterval(el._t);
    }, 30);
  });
}

function getCardStyle(row) {
  const u = norm(col(row, 'entrega usado', 'entrega_usado'));
  const f = norm(col(row, 'financiacion', 'financiacion'));
  if (u === 'si') return { cls: 'card-si', color: '#10b981', label: 'ENTREGA USADO', badgeCls: 'bg-emerald-500 text-emerald-950' };
  if (f.includes('plan')) return { cls: 'card-plan', color: '#3498db', label: 'CON PLAN', badgeCls: 'bg-[#3498db] text-white' };
  if (f === 'si') return { cls: 'card-plan', color: '#3498db', label: 'FINANCIADO', badgeCls: 'bg-[#3498db] text-white' };
  if (u === 'no' || f === 'no') return { cls: 'card-no', color: '#38bdf8', label: 'SIN ENTREGA', badgeCls: 'bg-sky-800 text-sky-200' };
  return { cls: 'card-default', color: '#475569', label: 'LEAD', badgeCls: 'bg-slate-700 text-slate-300' };
}

function finBadge(val) {
  const v = norm(val);
  if (v === 'si') return `<span class="px-4 py-1.5 rounded-xl text-[14px] font-black bg-[#3498db] text-white shadow-sm shadow-[#3498db]/20">SI</span>`;
  if (v === 'no') return `<span class="px-4 py-1.5 rounded-xl text-[14px] font-black bg-slate-700 text-slate-300 shadow-sm shadow-black/20">NO</span>`;
  if (v.includes('plan')) return `<span class="px-4 py-1.5 rounded-xl text-[14px] font-black bg-[#3498db] text-white shadow-sm shadow-[#3498db]/20">PLAN</span>`;
  if (val && val !== '—') return `<span class="px-4 py-1.5 rounded-xl text-[14px] font-black bg-slate-700 text-slate-300">${val}</span>`;
  return `<span class="text-slate-500 text-sm font-bold">—</span>`;
}

function renderCards() {
  const search = norm(document.getElementById('searchInput').value);
  let data = [...allData];

  if (currentFilter === 'si') data = data.filter(r => norm(col(r, 'entrega usado', 'entrega_usado')) === 'si');
  else if (currentFilter === 'no') data = data.filter(r => norm(col(r, 'entrega usado', 'entrega_usado')) === 'no');

  if (search) data = data.filter(r => {
    return norm(col(r, 'nombre', 'Nombre')).includes(search) ||
      norm(col(r, 'telefono', 'teléfono', 'Telefono', 'Teléfono')).includes(search);
  });

  const container = document.getElementById('cardContainer');

  if (data.length === 0) {
    container.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-slate-500">
  <span class="material-symbols-outlined text-5xl mb-3">search_off</span>
  <p class="text-sm font-medium">Sin resultados</p></div>`;
    return;
  }

  container.innerHTML = `
<div class="flex items-center justify-between px-1 mb-2">
  <h2 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${data.length} leads</h2>
  <div class="flex items-center gap-1.5 text-[10px] font-bold text-primary">
    <span>LIVE</span>
    <span class="w-1.5 h-1.5 rounded-full bg-primary status-pulse"></span>
  </div>
</div>
${data.map(r => buildCard(r, allData.indexOf(r))).join('')}
<div class="py-10 text-center">
  <span class="material-symbols-outlined text-slate-700 text-3xl">anchor</span>
  <p class="text-slate-600 text-xs mt-1 italic">Fin de la lista</p>
</div>`;
}

function buildCard(row, idx) {
  const nombre = col(row, 'nombre', 'Nombre') || 'Sin nombre';
  const tel = col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono') || '—';
  const usado = col(row, 'entrega usado', 'entrega_usado', 'Entrega usado') || '—';
  const fin = col(row, 'financiacion', 'financiacion') || '—';
  const st = getCardStyle(row);

  return `
<div class="${st.cls} rounded-3xl p-5 border backdrop-blur-xl shadow-sm cursor-pointer active:scale-[0.98] transition-transform" onclick="openDetail(${idx})">
  <div class="flex justify-between items-start mb-2">
    <div class="flex-1 min-w-0 pr-3">
      <h3 class="text-lg font-bold text-white leading-tight truncate">${nombre}</h3>
      <div class="flex items-center gap-1.5 mt-1.5">
        <span class="material-symbols-outlined" style="font-size:14px;color:${st.color}">phone</span>
        <span class="text-sm text-slate-400 font-medium">${tel}</span>
      </div>
    </div>
  </div>
  <div class="grid grid-cols-2 gap-3 py-4 border-y mb-4 mt-2" style="border-color:${st.color}20">
    <div>
      <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Entrega Usado</p>
      ${finBadge(usado)}
    </div>
    <div class="text-right flex flex-col items-end">
      <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Financiación</p>
      ${finBadge(fin)}
    </div>
  </div>
  <div class="flex items-center justify-center gap-1.5 py-2 rounded-2xl text-xs font-bold transition-colors" style="background:${st.color}12;color:${st.color};border:1px solid ${st.color}25">
    Ver detalles
    <span class="material-symbols-outlined text-base">chevron_right</span>
  </div>
</div>`;
}

function openDetail(idx) {
  const row = allData[idx];
  const nombre = col(row, 'nombre', 'Nombre') || 'Sin nombre';
  const tel = col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono') || '—';
  const usado = col(row, 'entrega usado', 'entrega_usado', 'Entrega usado') || '—';
  const fin = col(row, 'financiacion', 'financiacion') || '—';
  const st = getCardStyle(row);
  let waNum = tel.replace(/\D/g, '');
  if (waNum && !waNum.startsWith('54')) {
    if (waNum.startsWith('0')) waNum = waNum.substring(1);
    waNum = '54' + waNum;
  }
  const mensajeWA = encodeURIComponent('Hola ' + nombre + ', me comunico de Náutica Aire Libre.');

  document.getElementById('detailSheet').innerHTML = `
<div class="flex items-center relative px-4 pt-4 pb-2">
  <button onclick="closeDetail()" class="w-9 h-9 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center border border-red-500/30 active:bg-red-500/30 transition-colors z-10">
    <span class="material-symbols-outlined text-lg">close</span>
  </button>
  <div class="w-10 h-1 bg-white/20 rounded-full absolute left-1/2 -translate-x-1/2"></div>
</div>
<div class="px-5 pb-8">
  <div class="rounded-3xl p-5 mb-5 relative overflow-hidden" style="background:linear-gradient(135deg,${st.color}25,${st.color}08);border:1px solid ${st.color}20">
    <div class="flex justify-between items-start">
      <div>
        <p class="text-[9px] font-black uppercase tracking-widest mb-1" style="color:${st.color}80">Detalle de Lead</p>
        <h2 class="text-2xl font-black text-white leading-tight">${nombre}</h2>
      </div>
      <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase flex-shrink-0 ${st.badgeCls}">${st.label}</span>
    </div>
    <span class="material-symbols-outlined absolute -bottom-5 -right-5 pointer-events-none select-none" style="font-size:100px;color:${st.color}12">directions_boat</span>
  </div>

  <p class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Contacto</p>
  <div class="space-y-3 mb-5">
    <div class="glass rounded-2xl p-4 flex items-center gap-3">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${st.color}15">
        <span class="material-symbols-outlined" style="color:${st.color}">person</span>
      </div>
      <div>
        <p class="text-[9px] text-slate-500 font-bold uppercase">Nombre</p>
        <p class="text-base font-bold text-white">${nombre}</p>
      </div>
    </div>
    <div class="glass rounded-2xl p-4 flex items-center gap-3">
      <div class="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
        <span class="material-symbols-outlined text-emerald-400">call</span>
      </div>
      <div class="flex-1">
        <p class="text-[9px] text-slate-500 font-bold uppercase">Teléfono</p>
        <p class="text-base font-bold text-white">${tel}</p>
      </div>
      <div class="flex gap-2">
        <a href="tel:${tel}" class="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 active:bg-emerald-500/30 transition-colors">
          <span class="material-symbols-outlined text-lg">phone</span>
        </a>
        <a href="https://api.whatsapp.com/send?phone=${waNum}&text=${mensajeWA}" target="_blank" class="w-9 h-9 rounded-full bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center text-emerald-300 active:bg-emerald-600/30 transition-colors">
          <span class="material-symbols-outlined text-lg">chat</span>
        </a>
      </div>
    </div>
  </div>

  <p class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Datos del Lead</p>
  <div class="grid grid-cols-2 gap-3 mb-5">
    <div class="glass rounded-2xl p-4">
      <p class="text-[9px] text-slate-500 font-bold uppercase mb-2">Entrega Usado</p>
      ${finBadge(usado)}
    </div>
    <div class="glass rounded-2xl p-4">
      <p class="text-[9px] text-slate-500 font-bold uppercase mb-2">Financiación</p>
      ${finBadge(fin)}
    </div>
  </div>

  <div class="glass rounded-3xl p-3 flex gap-2">
    <a href="https://api.whatsapp.com/send?phone=${waNum}&text=${mensajeWA}" target="_blank"
      class="flex-1 h-12 bg-emerald-600 active:bg-emerald-500 active:scale-95 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all uppercase tracking-wide">
      <span class="material-symbols-outlined text-lg">chat</span>WhatsApp
    </a>
    <a href="tel:${tel}"
      class="flex-1 h-12 bg-primary active:bg-primary/90 active:scale-95 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all uppercase tracking-wide">
      <span class="material-symbols-outlined text-lg">call</span>Llamar
    </a>
  </div>
</div>`;

  document.getElementById('detailOverlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
}

function toggleCharts() {
  const ov = document.getElementById('chartsOverlay');
  ov.classList.toggle('open');
  if (ov.classList.contains('open')) buildCharts();
}

function buildCharts() {
  const usadoCounts = { 'Sí': 0, 'No': 0, 'Otro': 0 };
  const finCounts = {};
  allData.forEach(r => {
    const u = norm(col(r, 'entrega usado', 'entrega_usado'));
    if (u === 'si') usadoCounts['Sí']++;
    else if (u === 'no') usadoCounts['No']++;
    else usadoCounts['Otro']++;
    const f = (col(r, 'financiacion', 'financiacion') || 'Sin datos').trim();
    const fk = f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
    finCounts[fk] = (finCounts[fk] || 0) + 1;
  });

  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 } } } };
  if (chartUsado) chartUsado.destroy();
  chartUsado = new Chart(document.getElementById('chartUsado'), {
    type: 'doughnut',
    data: {
      labels: ['Sí', 'No', 'Otro'], datasets: [{
        data: [usadoCounts['Sí'], usadoCounts['No'], usadoCounts['Otro']],
        backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(56,189,248,0.8)', 'rgba(71,85,105,0.5)'],
        borderColor: ['#10b981', '#38bdf8', '#475569'], borderWidth: 1.5, hoverOffset: 6
      }]
    },
    options: { ...base, cutout: '65%' }
  });

  if (chartFin) chartFin.destroy();
  const fl = Object.keys(finCounts);
  const colors = ['rgba(52,152,219,0.8)', 'rgba(16,185,129,0.8)', 'rgba(56,189,248,0.8)', 'rgba(251,191,36,0.8)', 'rgba(248,113,113,0.8)'];
  chartFin = new Chart(document.getElementById('chartFin'), {
    type: 'bar',
    data: {
      labels: fl, datasets: [{
        data: fl.map(k => finCounts[k]),
        backgroundColor: fl.map((_, i) => colors[i % colors.length]),
        borderRadius: 6, borderSkipped: false
      }]
    },
    options: {
      ...base,
      scales: {
        x: { ticks: { color: '#94a3b8', font: { family: 'Inter' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      },
      plugins: { ...base.plugins, legend: { display: false } }
    }
  });
}

function setFilter(f) {
  currentFilter = f;
  ['todos', 'si', 'no'].forEach(id => {
    document.getElementById(`chip-${id}`).className =
      document.getElementById(`chip-${id}`).className
        .replace(/chip-(active|inactive)/g, '') +
      (id === f ? ' chip-active' : ' chip-inactive');
  });
  renderCards();
}

function resetCountdown() {
  clearInterval(countdownTimer);
  clearTimeout(refreshTimer);
  countdown = REFRESH_SECONDS;
  countdownTimer = setInterval(() => {
    countdown--;
    document.getElementById('nextRefresh').textContent = `${countdown}s`;
    if (countdown <= 0) clearInterval(countdownTimer);
  }, 1000);
  refreshTimer = setTimeout(() => fetchData(false), REFRESH_SECONDS * 1000);
}

['detailOverlay', 'chartsOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('open');
  });
});

fetchData(true);
