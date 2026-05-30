const SHEET_ID = '1eYVpy1qEdCy91aqyV77jTkqFbYPOT4ubSouZokIXLSk';
const SHEET_GID = '0';
const REFRESH_SECONDS = 30;

let allData = [];
let archivedLeads = JSON.parse(localStorage.getItem('archived_leads') || '[]');
let currentFilter = 'todos';
let countdown = REFRESH_SECONDS;
let countdownTimer = null;
let refreshTimer = null;
let chartUsado = null, chartFin = null;
let currentTab = 'leads';

// Standard normalizer
function norm(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Find spreadsheet column value
function col(row, ...keys) {
  for (const k of keys) {
    const found = Object.keys(row).find(rk => norm(rk) === norm(k));
    if (found !== undefined && row[found] !== undefined) return row[found];
  }
  return '';
}

// Toast notification helper
function showToast(msg, ok = true) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = (ok ? '✅ ' : '❌ ') + msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// Unique key identifier helper for a lead row
function getLeadKey(row) {
  const tel = col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono').trim();
  const name = col(row, 'nombre', 'Nombre').trim();
  return tel || name || Math.random().toString();
}

// Tab View Controller
function switchTab(tabName) {
  currentTab = tabName;
  
  // Tab container list
  const tabs = ['leads', 'charts', 'archived'];
  tabs.forEach(t => {
    const tabEl = document.getElementById(`${t}Tab`);
    const btnEl = document.getElementById(`navBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    
    if (tabEl) {
      if (t === tabName) {
        tabEl.classList.remove('hidden');
        tabEl.classList.add('flex');
      } else {
        tabEl.classList.remove('flex');
        tabEl.classList.add('hidden');
      }
    }
    
    if (btnEl) {
      const iconSpan = btnEl.querySelector('.material-symbols-outlined');
      if (t === tabName) {
        btnEl.className = "flex flex-col items-center justify-center text-primary font-bold scale-105 transition-all duration-200 w-20";
        if (iconSpan) iconSpan.style.fontVariationSettings = "'FILL' 1";
      } else {
        btnEl.className = "flex flex-col items-center justify-center text-on-surface-variant/60 hover:text-primary/80 transition-all duration-200 w-20";
        if (iconSpan) iconSpan.style.fontVariationSettings = "";
      }
    }
  });

  // Update AppBar Title
  const titleEl = document.getElementById('viewTitle');
  if (titleEl) {
    if (tabName === 'leads') titleEl.textContent = 'Leads';
    else if (tabName === 'charts') titleEl.textContent = 'Gráficos';
    else if (tabName === 'archived') titleEl.textContent = 'Archivados';
  }

  // Action switches
  if (tabName === 'charts') {
    buildCharts();
  } else if (tabName === 'archived') {
    renderArchivedCards();
  }
}

// Fetch spreadsheet lead CSV data
async function fetchData(manual = false) {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.classList.add('spinning');
  
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const csv = await res.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    
    allData = parsed.data;
    
    updateKPIs();
    renderCards();
    renderArchivedCards();
    
    if (currentTab === 'charts') buildCharts();
    
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'Live';
    
    if (manual) showToast(`${allData.length} leads cargados`);
    resetCountdown();
  } catch (e) {
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'Error';
    
    showToast('No se pudo cargar el sheet', false);
    document.getElementById('cardContainer').innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-red-500 text-center px-4">
        <span class="material-symbols-outlined text-5xl mb-3">error</span>
        <p class="text-sm font-bold mb-2">Error al cargar datos</p>
        <p class="text-xs opacity-80 break-all">${e.message || 'Error de red'}</p>
        <p class="text-[10px] opacity-60 mt-3 max-w-[280px]">Verifica tu conexión a internet o el acceso a la planilla compartida.</p>
      </div>`;
  }
  
  if (icon) icon.classList.remove('spinning');
}

// Circular rings SVG animator helper
function updateCircleProgress(elId, percent) {
  const circle = document.getElementById(elId);
  if (!circle) return;
  const circumference = 263.89; // 2 * pi * r(42)
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  circle.style.strokeDashoffset = offset;
}

// Calculate and animate active stats and rings
function updateKPIs() {
  // Stats ONLY for active (non-archived) leads
  const activeLeads = allData.filter(r => !archivedLeads.includes(getLeadKey(r)));
  const totalActive = activeLeads.length;
  const totalUsed = activeLeads.filter(r => norm(col(r, 'entrega usado', 'entrega_usado')) === 'si').length;
  
  // Set count animations
  [['kpiTotal', totalActive], ['kpiUsado', totalUsed]].forEach(([id, target]) => {
    const el = document.getElementById(id);
    if (!el) return;
    let n = 0;
    clearInterval(el._t);
    el._t = setInterval(() => {
      n = Math.min(n + Math.ceil(target / 15) || 1, target);
      el.textContent = n;
      if (n >= target) {
        el.textContent = target;
        clearInterval(el._t);
      }
    }, 25);
  });

  // Animate dynamic circles
  const activePct = allData.length > 0 ? (totalActive / allData.length) * 100 : 0;
  const usedPct = totalActive > 0 ? (totalUsed / totalActive) * 100 : 0;
  
  updateCircleProgress('ringTotal', activePct);
  updateCircleProgress('ringUsado', usedPct);
}

// Lead status card styles
function getCardStyle(row) {
  const u = norm(col(row, 'entrega usado', 'entrega_usado'));
  const f = norm(col(row, 'financiacion', 'financiacion'));
  if (u === 'si') return { color: '#10b981', label: 'ENTREGA USADO', badgeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
  if (f.includes('plan')) return { color: '#2c74b3', label: 'CON PLAN', badgeCls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  if (f === 'si') return { color: '#2c74b3', label: 'FINANCIADO', badgeCls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  if (u === 'no' || f === 'no') return { color: '#38bdf8', label: 'SIN ENTREGA', badgeCls: 'bg-sky-500/20 text-sky-300 border-sky-500/30' };
  return { color: '#475569', label: 'LEAD', badgeCls: 'bg-slate-700/20 text-slate-300 border-slate-700/30' };
}

// Render active leads list
function renderCards() {
  const searchInput = document.getElementById('searchInput');
  const search = searchInput ? norm(searchInput.value) : '';
  
  // Filter out archived leads
  let data = allData.filter(r => !archivedLeads.includes(getLeadKey(r)));

  if (search) {
    data = data.filter(r => {
      return norm(col(r, 'nombre', 'Nombre')).includes(search) ||
        norm(col(r, 'telefono', 'teléfono', 'Telefono', 'Teléfono')).includes(search);
    });
  }

  const container = document.getElementById('cardContainer');
  const counterText = document.getElementById('foundLeadsText');
  
  if (counterText) {
    counterText.textContent = `${data.length} leads encontrados`;
  }

  if (data.length === 0) {
    if (container) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-text-muted">
          <span class="material-symbols-outlined text-5xl mb-3 opacity-40">search_off</span>
          <p class="text-xs font-semibold">Sin resultados</p>
        </div>`;
    }
    return;
  }

  if (container) {
    container.innerHTML = `
      ${data.map(r => buildCard(r, allData.indexOf(r))).join('')}
      <div class="flex flex-col items-center justify-center py-10 text-text-muted/40 animate-fade-in-up stagger-3">
        <span class="material-symbols-outlined text-4xl mb-3 opacity-30">anchor</span>
        <span class="font-label-caps text-[10px] italic">Fin de la lista</span>
        <div class="mt-6 px-4 py-2 rounded-full bg-surface-card border border-white/5 flex items-center gap-2 text-[10px] text-text-muted shadow-lg">
          <span class="material-symbols-outlined text-status-live text-sm">check_box</span>
          ${data.length} LEADS CARGADOS
        </div>
      </div>`;
  }
}

// Build custom Vertical Card layout from spec
function buildCard(row, idx) {
  const nombre = col(row, 'nombre', 'Nombre') || 'Sin nombre';
  const tel = col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono') || '—';
  const usado = col(row, 'entrega usado', 'entrega_usado', 'Entrega usado') || '—';
  const fin = col(row, 'financiacion', 'financiacion') || '—';
  const st = getCardStyle(row);

  return `
  <div class="lead-card rounded-[2rem] p-6 flex flex-col gap-6 animate-fade-in-up stagger-2" id="lead-card-${idx}" style="border-left: 4px solid ${st.color}">
    <!-- Top Section: Name and Phone -->
    <div class="flex justify-between items-center gap-4">
      <div class="flex-1 min-w-0 pr-2">
        <h3 class="font-headline-md text-lg text-text-primary truncate" title="${nombre}">${nombre}</h3>
      </div>
      <div class="flex items-center gap-1.5 text-primary font-body-md bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20 whitespace-nowrap text-[11px] font-bold">
        <span class="material-symbols-outlined text-[13px]">call</span>
        ${tel}
      </div>
    </div>
    <!-- Details Grid -->
    <div class="grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1 p-3 rounded-2xl bg-white/5 border border-white/5">
        <span class="font-label-caps text-[9px] text-text-muted/65 uppercase tracking-wide">Entrega Usado</span>
        <span class="text-text-primary/90 text-xs font-semibold truncate" title="${usado}">${usado}</span>
      </div>
      <div class="flex flex-col gap-1 p-3 rounded-2xl bg-white/5 border border-white/5">
        <span class="font-label-caps text-[9px] text-text-muted/65 uppercase tracking-wide">Financiación</span>
        <span class="text-xs font-semibold truncate" style="color: ${st.color}" title="${fin}">${fin}</span>
      </div>
    </div>
    <!-- Action Grid (Vertical Emphasis layout variant) -->
    <div class="grid grid-cols-2 gap-3 pt-1">
      <button class="flex items-center justify-center gap-2 py-3 bg-surface-container-highest/50 text-text-muted rounded-2xl border border-white/5 hover:text-primary transition-colors text-xs font-bold active:scale-[0.97]" onclick="openDetail(${idx})">
        <span class="material-symbols-outlined text-base">visibility</span>Detalles
      </button>
      <button class="flex items-center justify-center gap-2 py-3 bg-surface-container-highest/50 text-text-muted rounded-2xl border border-white/5 hover:text-brand-orange transition-colors text-xs font-bold active:scale-[0.97]" onclick="archiveLead('${idx}')">
        <span class="material-symbols-outlined text-base">inventory_2</span>Archivar
      </button>
    </div>
  </div>`;
}

// Archive lead helper via localStorage
function archiveLead(idx) {
  const row = allData[idx];
  if (!row) return;
  const key = getLeadKey(row);
  const cardEl = document.getElementById(`lead-card-${idx}`);
  
  if (cardEl) {
    cardEl.classList.add('archiving');
    setTimeout(() => {
      if (!archivedLeads.includes(key)) {
        archivedLeads.push(key);
        localStorage.setItem('archived_leads', JSON.stringify(archivedLeads));
      }
      updateKPIs();
      renderCards();
      renderArchivedCards();
      showToast('Lead archivado correctamente', true);
    }, 400);
  }
}

// Render archived leads list view tab
function renderArchivedCards() {
  const searchInput = document.getElementById('archivedSearchInput');
  const search = searchInput ? norm(searchInput.value) : '';
  
  // Filter leads that are archived
  let data = allData.filter(r => archivedLeads.includes(getLeadKey(r)));

  if (search) {
    data = data.filter(r => {
      return norm(col(r, 'nombre', 'Nombre')).includes(search) ||
        norm(col(r, 'telefono', 'teléfono', 'Telefono', 'Teléfono')).includes(search);
    });
  }

  const container = document.getElementById('archivedCardContainer');
  const emptyState = document.getElementById('archivedEmptyState');
  const counterText = document.getElementById('foundArchivedLeadsText');
  
  if (counterText) {
    counterText.textContent = `${data.length} leads archivados`;
  }

  if (data.length === 0) {
    if (container) container.innerHTML = '';
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    }
    return;
  }

  if (emptyState) {
    emptyState.classList.remove('flex');
    emptyState.classList.add('hidden');
  }

  if (container) {
    container.innerHTML = data.map(r => buildArchivedCard(r, allData.indexOf(r))).join('');
  }
}

// Build custom Archived Lead Card from redesign
function buildArchivedCard(row, idx) {
  const nombre = col(row, 'nombre', 'Nombre') || 'Sin nombre';
  const tel = col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono') || '—';
  const usado = col(row, 'entrega usado', 'entrega_usado', 'Entrega usado') || '—';
  const fin = col(row, 'financiacion', 'financiacion') || '—';
  const st = getCardStyle(row);

  return `
  <div class="glass-card p-5 rounded-[2rem] flex flex-col gap-5 animate-fade-in-up stagger-2" id="archived-card-${idx}" style="border-left: 4px solid ${st.color}">
    <!-- Top Section -->
    <div class="flex justify-between items-center gap-4">
      <div class="flex-1 min-w-0 pr-2">
        <h3 class="font-headline-md text-lg text-text-primary truncate" title="${nombre}">${nombre}</h3>
      </div>
      <div class="flex items-center gap-1.5 text-primary font-body-md bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20 whitespace-nowrap text-[11px] font-bold">
        <span class="material-symbols-outlined text-[13px]">call</span>
        ${tel}
      </div>
    </div>
    <!-- Chip Tags -->
    <div class="flex flex-wrap gap-2 mt-0.5">
      <span class="px-2.5 py-1 rounded-full bg-surface-container-high border border-white/5 font-label-caps text-[9px] text-text-muted uppercase tracking-wider">Archivado</span>
      <span class="px-2.5 py-1 rounded-full bg-brand-orange/10 border border-brand-orange/20 font-label-caps text-[9px] text-brand-orange uppercase tracking-wider truncate max-w-[130px]">${usado}</span>
      <span class="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 font-label-caps text-[9px] text-primary uppercase tracking-wider truncate max-w-[130px]">${fin}</span>
    </div>
    <!-- Action Grid -->
    <div class="grid grid-cols-2 gap-3 pt-1">
      <button class="flex items-center justify-center gap-2 py-3 bg-surface-container-highest/30 text-text-muted rounded-2xl border border-white/5 hover:text-primary transition-colors text-xs font-bold active:scale-[0.97]" onclick="openDetail(${idx})">
        <span class="material-symbols-outlined text-base">visibility</span>Detalles
      </button>
      <button class="flex items-center justify-center gap-2 py-3 bg-surface-container-highest/30 text-text-muted rounded-2xl border border-white/5 hover:text-brand-orange transition-colors text-xs font-bold active:scale-[0.97]" onclick="unarchiveLead('${idx}')">
        <span class="material-symbols-outlined text-base">unarchive</span>Restaurar
      </button>
    </div>
  </div>`;
}

// Unarchive lead helper
function unarchiveLead(idx) {
  const row = allData[idx];
  if (!row) return;
  const key = getLeadKey(row);
  const cardEl = document.getElementById(`archived-card-${idx}`);
  
  if (cardEl) {
    cardEl.style.transition = 'all 0.4s ease';
    cardEl.style.transform = 'scale(0.9) translateX(100px)';
    cardEl.style.opacity = '0';
    
    setTimeout(() => {
      archivedLeads = archivedLeads.filter(k => k !== key);
      localStorage.setItem('archived_leads', JSON.stringify(archivedLeads));
      updateKPIs();
      renderCards();
      renderArchivedCards();
      showToast('Lead restaurado al panel activo', true);
    }, 400);
  }
}

// Details overlay modal drawer content
function openDetail(idx) {
  const row = allData[idx];
  const nombre = col(row, 'nombre', 'Nombre') || 'Sin nombre';
  const tel = col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono') || '—';
  const usado = col(row, 'entrega usado', 'entrega_usado', 'Entrega usado') || '—';
  const fin = col(row, 'financiacion', 'financiacion') || '—';
  const mensaje = col(row, 'mensaje', 'Mensaje') || '—';
  const st = getCardStyle(row);
  
  let waNum = tel.replace(/\D/g, '');
  if (waNum && !waNum.startsWith('54')) {
    if (waNum.startsWith('0')) waNum = waNum.substring(1);
    waNum = '54' + waNum;
  }
  const mensajeWA = encodeURIComponent('Hola ' + nombre + ', me comunico de Náutica Aire Libre.');

  document.getElementById('detailSheet').innerHTML = `
  <div class="flex items-center relative px-4 pt-4 pb-2">
    <button onclick="closeDetail()" class="w-9 h-9 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center border border-red-500/30 active:bg-red-500/35 active:scale-90 transition-all z-10">
      <span class="material-symbols-outlined text-lg">close</span>
    </button>
    <div class="w-10 h-1 bg-white/20 rounded-full absolute left-1/2 -translate-x-1/2"></div>
  </div>
  <div class="px-5 pb-8 animate-fade-in-up">
    <!-- Accent Header Hero Details Layout from Spec -->
    <div class="rounded-3xl p-5 mb-5 relative overflow-hidden" style="background:linear-gradient(135deg,${st.color}25,${st.color}08);border:1px solid ${st.color}20">
      <div class="flex justify-between items-start">
        <div class="flex-1 min-w-0 pr-2">
          <p class="text-[9px] font-black uppercase tracking-widest mb-1 text-primary opacity-80">Detalle de Lead</p>
          <h2 class="text-xl font-black text-white leading-tight truncate" title="${nombre}">${nombre}</h2>
        </div>
        <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase flex-shrink-0 bg-surface-deep text-primary border border-primary/25">${st.label}</span>
      </div>
      <span class="material-symbols-outlined absolute -bottom-5 -right-5 pointer-events-none select-none text-[90px] opacity-[0.08]" style="color:${st.color}">directions_boat</span>
    </div>

    <!-- Contacts section -->
    <p class="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-3">Contacto</p>
    <div class="space-y-3 mb-5">
      <div class="glass rounded-2xl p-4 flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${st.color}15">
          <span class="material-symbols-outlined" style="color:${st.color}">person</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[9px] text-text-muted font-bold uppercase tracking-wider">Nombre</p>
          <p class="text-sm font-bold text-white truncate" title="${nombre}">${nombre}</p>
        </div>
      </div>
      <div class="glass rounded-2xl p-4 flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-emerald-400">call</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[9px] text-text-muted font-bold uppercase tracking-wider">Teléfono</p>
          <p class="text-sm font-bold text-white truncate">${tel}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <a href="tel:${tel}" class="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 active:bg-emerald-500/30 transition-colors">
            <span class="material-symbols-outlined text-base">phone</span>
          </a>
          <a href="https://api.whatsapp.com/send?phone=${waNum}&text=${mensajeWA}" target="_blank" class="w-9 h-9 rounded-full bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center text-emerald-300 active:bg-emerald-600/30 transition-colors">
            <span class="material-symbols-outlined text-base">chat</span>
          </a>
        </div>
      </div>
    </div>

    <!-- Data Details Section -->
    <p class="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-3">Datos del Lead</p>
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div class="glass rounded-2xl p-4">
        <p class="text-[9px] text-text-muted font-bold uppercase mb-2 tracking-wider">Entrega Usado</p>
        <span class="px-3 py-1.5 rounded-xl text-[12px] font-bold bg-slate-800 text-slate-200 border border-white/5 inline-block">${usado}</span>
      </div>
      <div class="glass rounded-2xl p-4">
        <p class="text-[9px] text-text-muted font-bold uppercase mb-2 tracking-wider">Financiación</p>
        <span class="px-3 py-1.5 rounded-xl text-[12px] font-bold bg-slate-800 text-slate-200 border border-white/5 inline-block truncate max-w-[130px]" title="${fin}">${fin}</span>
      </div>
    </div>

    <!-- Message bubble -->
    <div class="glass rounded-2xl p-4 mb-5">
      <p class="text-[9px] text-text-muted font-bold uppercase mb-2 tracking-wider">Mensaje</p>
      <p class="text-xs font-medium text-on-surface leading-relaxed whitespace-pre-wrap">${mensaje}</p>
    </div>

    <!-- Action instrument bar -->
    <div class="glass rounded-3xl p-3 flex gap-2">
      <a href="https://api.whatsapp.com/send?phone=${waNum}&text=${mensajeWA}" target="_blank"
        class="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all uppercase tracking-wide">
        <span class="material-symbols-outlined text-base">chat</span>WhatsApp
      </a>
      <a href="tel:${tel}"
        class="flex-1 h-12 bg-brand-blue hover:bg-brand-blue/80 active:scale-95 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all uppercase tracking-wide">
        <span class="material-symbols-outlined text-base">call</span>Llamar
      </a>
    </div>
  </div>`;

  document.getElementById('detailOverlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
}

// Generate dark-themed dynamic Chart.js analytics graphics
function buildCharts() {
  const activeLeads = allData.filter(r => !archivedLeads.includes(getLeadKey(r)));
  
  const usadoCounts = { 'Sí': 0, 'No': 0, 'Otro': 0 };
  const finCounts = {};
  
  activeLeads.forEach(r => {
    const u = norm(col(r, 'entrega usado', 'entrega_usado'));
    if (u === 'si') usadoCounts['Sí']++;
    else if (u === 'no') usadoCounts['No']++;
    else usadoCounts['Otro']++;
    
    const f = (col(r, 'financiacion', 'financiacion') || 'Sin datos').trim();
    const fk = f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
    finCounts[fk] = (finCounts[fk] || 0) + 1;
  });

  const base = { 
    responsive: true, 
    maintainAspectRatio: false, 
    plugins: { 
      legend: { 
        labels: { 
          color: '#94a3b8', 
          font: { family: 'Inter', size: 10, weight: 'bold' }, 
          padding: 10 
        } 
      } 
    } 
  };

  // Used Boat Doughnut
  if (chartUsado) chartUsado.destroy();
  chartUsado = new Chart(document.getElementById('chartUsado'), {
    type: 'doughnut',
    data: {
      labels: ['Sí', 'No', 'Otro'], 
      datasets: [{
        data: [usadoCounts['Sí'], usadoCounts['No'], usadoCounts['Otro']],
        backgroundColor: ['rgba(34,197,94,0.85)', 'rgba(156,202,255,0.85)', 'rgba(71,85,105,0.5)'],
        borderColor: ['#22c55e', '#9ccaff', '#475569'], 
        borderWidth: 1.5, 
        hoverOffset: 6
      }]
    },
    options: { 
      ...base, 
      cutout: '65%' 
    }
  });

  // Financing Bar Chart
  if (chartFin) chartFin.destroy();
  const fl = Object.keys(finCounts);
  const colors = ['rgba(156,202,255,0.85)', 'rgba(34,197,94,0.85)', 'rgba(255,184,119,0.85)', 'rgba(251,191,36,0.85)', 'rgba(239,68,68,0.85)'];
  chartFin = new Chart(document.getElementById('chartFin'), {
    type: 'bar',
    data: {
      labels: fl, 
      datasets: [{
        data: fl.map(k => finCounts[k]),
        backgroundColor: fl.map((_, i) => colors[i % colors.length]),
        borderRadius: 6, 
        borderSkipped: false
      }]
    },
    options: {
      ...base,
      scales: {
        x: { ticks: { color: '#94a3b8', font: { family: 'Inter', size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8', stepSize: 1, font: { family: 'Inter', size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      },
      plugins: { ...base.plugins, legend: { display: false } }
    }
  });
}

// Reset Countdown Live Timer
function resetCountdown() {
  clearInterval(countdownTimer);
  clearTimeout(refreshTimer);
  countdown = REFRESH_SECONDS;
  
  const refreshText = document.getElementById('nextRefresh');
  if (refreshText) refreshText.textContent = `${countdown}s`;
  
  countdownTimer = setInterval(() => {
    countdown--;
    if (refreshText) refreshText.textContent = `${countdown}s`;
    if (countdown <= 0) clearInterval(countdownTimer);
  }, 1000);
  
  refreshTimer = setTimeout(() => fetchData(false), REFRESH_SECONDS * 1000);
}

// Setup background overlay close listeners
['detailOverlay'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });
  }
});

// Initial View Trigger
switchTab('leads');
fetchData(true);
