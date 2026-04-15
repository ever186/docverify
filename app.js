/**
 * app.js — Verificador de coherencia .docx
 */

const API_URL = 'https://docverify-api.onrender.com';

// ── DOM REFS ─────────────────────────────────────
const dropArea       = document.getElementById('dropArea');
const fileInput      = document.getElementById('fileInput');
const fileInfo       = document.getElementById('fileInfo');
const fileNameEl     = document.getElementById('fileName');
const btnClear       = document.getElementById('btnClear');
const btnVerify      = document.getElementById('btnVerify');
const inputTitulo    = document.getElementById('inputTitulo');
const inputId        = document.getElementById('inputId');
const inputConsec    = document.getElementById('inputConsecutivo');
const resultsSection = document.getElementById('resultsSection');
const resultBlocks   = document.getElementById('resultBlocks');
const countOkEl      = document.getElementById('countOk');
const countWarnEl    = document.getElementById('countWarn');
const countErrEl     = document.getElementById('countErr');
const verdictEl      = document.getElementById('verdict');
const btnIdle        = btnVerify.querySelector('.btn-idle');
const btnLoading     = btnVerify.querySelector('.btn-loading');

let selectedFile = null;

// ── DRAG & DROP ───────────────────────────────────
dropArea.addEventListener('click', () => fileInput.click());
dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
dropArea.addEventListener('drop', e => {
  e.preventDefault(); dropArea.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
btnClear.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

function setFile(file) {
  if (!file.name.endsWith('.docx')) { showToast('Solo se aceptan archivos .docx'); return; }
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileInfo.style.display = 'flex';
  dropArea.style.display = 'none';
  updateBtn();
}
function clearFile() {
  selectedFile = null; fileInput.value = '';
  fileInfo.style.display = 'none'; dropArea.style.display = 'flex';
  updateBtn(); hideResults();
}
[inputTitulo, inputId, inputConsec].forEach(i => i.addEventListener('input', updateBtn));
function updateBtn() {
  const hasFile = !!selectedFile;
  const hasParams = inputTitulo.value.trim() || inputId.value.trim() || inputConsec.value.trim();
  btnVerify.disabled = !(hasFile && hasParams);
}

// ── VERIFY ────────────────────────────────────────
btnVerify.addEventListener('click', runVerification);

async function runVerification() {
  if (!selectedFile) return;
  setLoading(true); hideResults();

  const form = new FormData();
  form.append('file',        selectedFile);
  form.append('titulo',      inputTitulo.value.trim());
  form.append('id_tarea',    inputId.value.trim());
  form.append('consecutivo', inputConsec.value.trim());

  try {
    const res = await fetch(`${API_URL}/verificar`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

// ── RENDER RESULTS ────────────────────────────────
function renderResults(data) {
  resultBlocks.innerHTML = '';
  const secciones = data.secciones || [];
  const resumen   = data.resumen   || {};

  countOkEl.textContent   = resumen.ok      || 0;
  countWarnEl.textContent = resumen.alertas  || 0;
  countErrEl.textContent  = resumen.errores  || 0;

  verdictEl.className = 'summary-verdict';
  if ((resumen.errores || 0) > 0) {
    verdictEl.textContent = '✘ Requiere corrección';
    verdictEl.classList.add('verdict-err');
  } else if ((resumen.alertas || 0) > 0) {
    verdictEl.textContent = '⚠ Revisar advertencias';
    verdictEl.classList.add('verdict-warn');
  } else {
    verdictEl.textContent = '✔ Documento coherente';
    verdictEl.classList.add('verdict-ok');
  }

  secciones.forEach((sec, i) => {
    const block = buildSeccionBlock(sec, i * 70);
    resultBlocks.appendChild(block);
  });

  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── BUILD SECTION BLOCK ───────────────────────────
function buildSeccionBlock(sec, delay) {
  const block = document.createElement('div');
  block.className = 'result-block';
  block.style.animationDelay = `${delay}ms`;

  // ── Header del bloque
  const estadoIcon  = { OK:'✔', WARN:'⚠', ERROR:'✘', INFO:'ℹ' }[sec.estado] || 'ℹ';
  const estadoClass = { OK:'mini-ok', WARN:'mini-warn', ERROR:'mini-err', INFO:'mini-info' }[sec.estado] || '';

  const header = document.createElement('div');
  header.className = 'block-header';
  header.innerHTML = `
    <div class="block-title-row">
      <span class="block-section-label">${escapeHtml(sec.titulo)}</span>
      <span class="mini-badge ${estadoClass}">${estadoIcon} ${sec.estado}</span>
    </div>
    <span class="block-toggle open">▼</span>
  `;

  // ── Body
  const body = document.createElement('div');
  body.className = 'block-body';

  // Fragmento visual según tipo
  const tipo = sec.tipo || '';

  if (tipo === 'tabla_info' && Array.isArray(sec.fragmento)) {
    body.appendChild(buildTablaInfo(sec.fragmento));
  } else if (tipo === 'tabla_historial' && sec.fragmento && sec.fragmento.filas) {
    body.appendChild(buildTablaHistorial(sec.fragmento));
  } else if (tipo === 'conclusiones' && sec.fragmento) {
    body.appendChild(buildConclusiones(sec.fragmento));
  } else if (tipo === 'fechas' && Array.isArray(sec.fragmento) && sec.fragmento.length > 0) {
    body.appendChild(buildFechas(sec.fragmento));
  } else if (tipo === 'ortografia' && Array.isArray(sec.fragmento) && sec.fragmento.length > 0) {
    body.appendChild(buildOrtografia(sec.fragmento));
  } else if (Array.isArray(sec.fragmento) && sec.fragmento.length > 0) {
    // Encabezado — lista de textos
    const pre = document.createElement('div');
    pre.className = 'fragmento-encabezado';
    sec.fragmento.forEach(linea => {
      const p = document.createElement('p');
      p.className = 'enc-linea';
      p.textContent = linea;
      pre.appendChild(p);
    });
    body.appendChild(pre);
  }

  // Separador
  if (sec.validaciones && sec.validaciones.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'validaciones-sep';
    sep.textContent = 'Validaciones';
    body.appendChild(sep);

    sec.validaciones.forEach(v => {
      const row = document.createElement('div');
      const cls = stateToClass(v.estado);
      row.className = `result-row ${cls}`;
      row.innerHTML = `
        <span class="row-icon">${stateToIcon(v.estado)}</span>
        <span class="row-text">${escapeHtml(v.detalle)}</span>
      `;
      body.appendChild(row);
    });
  }

  // Toggle
  const toggle = header.querySelector('.block-toggle');
  header.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'flex';
    toggle.classList.toggle('open', !isOpen);
  });

  block.appendChild(header);
  block.appendChild(body);
  return block;
}

// ── FRAGMENTO: TABLA INFO ─────────────────────────
function buildTablaInfo(campos) {
  const wrap = document.createElement('div');
  wrap.className = 'fragmento-tabla';
  campos.forEach(c => {
    if (!c.campo) return;
    const row = document.createElement('div');
    row.className = 'frag-row' + (c.es_placeholder ? ' frag-placeholder' : '');
    row.innerHTML = `
      <span class="frag-campo">${escapeHtml(c.campo)}</span>
      <span class="frag-valor">${escapeHtml(c.valor)}</span>
    `;
    wrap.appendChild(row);
  });
  return wrap;
}

// ── FRAGMENTO: HISTORIAL ──────────────────────────
function buildTablaHistorial(fragmento) {
  const wrap = document.createElement('div');
  wrap.className = 'fragmento-historial';

  const table = document.createElement('table');
  table.className = 'hist-table';

  // Header
  if (fragmento.encabezados && fragmento.encabezados.length) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    fragmento.encabezados.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  // Body
  const tbody = document.createElement('tbody');
  (fragmento.filas || []).forEach(fila => {
    const tr = document.createElement('tr');
    fila.forEach(celda => {
      const td = document.createElement('td');
      td.className = es_placeholder_val(celda) ? 'ph-cell' : '';
      td.textContent = celda || '—';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ── FRAGMENTO: CONCLUSIONES ───────────────────────
function buildConclusiones(fragmento) {
  const wrap = document.createElement('div');
  wrap.className = 'fragmento-conclusiones';

  if (fragmento.parrafo) {
    const p = document.createElement('p');
    p.className = 'conc-parrafo';
    p.textContent = fragmento.parrafo;
    wrap.appendChild(p);
  }

  if (fragmento.tabla_campos && fragmento.tabla_campos.length) {
    const tabla = document.createElement('div');
    tabla.className = 'fragmento-tabla';
    fragmento.tabla_campos.forEach(c => {
      if (!c.campo) return;
      const row = document.createElement('div');
      row.className = 'frag-row' + (c.es_placeholder ? ' frag-placeholder' : '');
      row.innerHTML = `
        <span class="frag-campo">${escapeHtml(c.campo)}</span>
        <span class="frag-valor">${escapeHtml(c.valor)}</span>
      `;
      tabla.appendChild(row);
    });
    wrap.appendChild(tabla);
  }

  return wrap;
}

// ── FRAGMENTO: FECHAS ─────────────────────────────
function buildFechas(fechas) {
  const wrap = document.createElement('div');
  wrap.className = 'fragmento-fechas';
  fechas.forEach(item => {
    const row = document.createElement('div');
    row.className = 'fecha-row';
    row.innerHTML = `
      <span class="fecha-valor">${escapeHtml(item.fecha)}</span>
      <span class="fecha-ubicacion">${escapeHtml(item.ubicacion)}</span>
    `;
    wrap.appendChild(row);
  });
  return wrap;
}

// ── FRAGMENTO: ORTOGRAFÍA ─────────────────────────
function buildOrtografia(sugerencias) {
  const wrap = document.createElement('div');
  wrap.className = 'fragmento-ortografia';

  const nota = document.createElement('p');
  nota.className = 'orto-nota';
  nota.textContent = 'Las siguientes son sugerencias — verificar manualmente en el documento:';
  wrap.appendChild(nota);

  const grid = document.createElement('div');
  grid.className = 'orto-grid';
  sugerencias.forEach(s => {
    const chip = document.createElement('div');
    chip.className = 'orto-chip';
    chip.innerHTML = s.sugerencia
      ? `<span class="orto-error">${escapeHtml(s.palabra)}</span><span class="orto-arrow">→</span><span class="orto-sug">${escapeHtml(s.sugerencia)}</span>`
      : `<span class="orto-error">${escapeHtml(s.palabra)}</span><span class="orto-arrow">→</span><span class="orto-nosug">sin sugerencia</span>`;
    grid.appendChild(chip);
  });
  wrap.appendChild(grid);
  return wrap;
}

// ── HELPERS ───────────────────────────────────────
function es_placeholder_val(v) {
  return v && /^<[^>]+>$/.test(v.trim());
}
function stateToClass(s) {
  return { OK:'row-ok', WARN:'row-warn', ERROR:'row-err', INFO:'row-info' }[s] || 'row-info';
}
function stateToIcon(s) {
  return { OK:'✔', WARN:'⚠', ERROR:'✘', INFO:'ℹ' }[s] || 'ℹ';
}
function escapeHtml(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setLoading(on) {
  btnVerify.disabled = on;
  btnIdle.style.display    = on ? 'none' : 'flex';
  btnLoading.style.display = on ? 'flex' : 'none';
}
function hideResults() {
  resultsSection.style.display = 'none';
  resultBlocks.innerHTML = '';
}

let toastTimeout;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ── TEMA + PARTÍCULAS ─────────────────────────────
const btnTheme = document.getElementById('btnTheme');
const html     = document.documentElement;
const savedTheme = localStorage.getItem('dv-theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

btnTheme.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('dv-theme', next);
  initParticles();
});

const canvas = document.getElementById('particles');
const ctx    = canvas.getContext('2d');
let particles = [], animFrame;

function getParticleColor() {
  return html.getAttribute('data-theme') === 'light' ? 'rgba(124,58,237,' : 'rgba(0,255,179,';
}
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
function rnd(a,b) { return a + Math.random()*(b-a); }
function mkParticle() {
  return { x:rnd(0,canvas.width), y:rnd(0,canvas.height), r:rnd(1.5,4),
           dx:rnd(-0.4,0.4), dy:rnd(-0.5,-0.1), alpha:rnd(0.2,0.7), pulse:rnd(0,Math.PI*2) };
}
function initParticles() {
  cancelAnimationFrame(animFrame);
  particles = Array.from({length:55}, mkParticle);
  animate();
}
function animate() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const col = getParticleColor();
  for (const p of particles) {
    p.x += p.dx; p.y += p.dy; p.pulse += 0.02;
    const a = Math.max(0.05, Math.min(0.85, p.alpha + Math.sin(p.pulse)*0.15));
    if (p.y < -10) { p.y = canvas.height+10; p.x = rnd(0,canvas.width); }
    if (p.x < -10) p.x = canvas.width+10;
    if (p.x > canvas.width+10) p.x = -10;
    const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3);
    g.addColorStop(0, `${col}${a})`);
    g.addColorStop(0.4, `${col}${a*0.4})`);
    g.addColorStop(1, `${col}0)`);
    ctx.beginPath(); ctx.fillStyle = g;
    ctx.arc(p.x,p.y,p.r*3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = `${col}${a})`;
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  animFrame = requestAnimationFrame(animate);
}
resize();
window.addEventListener('resize', () => { resize(); initParticles(); });
initParticles();
