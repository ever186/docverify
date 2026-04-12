/**
 * app.js — DocVerify · NTT Data
 * Lógica del cliente: upload, validación, llamada a API, render de resultados
 */

// ── CONFIG ───────────────────────────────────────
// En producción apunta a tu backend en Render
const API_URL = window.DOCVERIFY_API_URL || 'https://docverify-api.onrender.com';

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
const summaryBar     = document.getElementById('summaryBar');
const countOkEl      = document.getElementById('countOk');
const countWarnEl    = document.getElementById('countWarn');
const countErrEl     = document.getElementById('countErr');
const verdictEl      = document.getElementById('verdict');
const btnIdle        = btnVerify.querySelector('.btn-idle');
const btnLoading     = btnVerify.querySelector('.btn-loading');

// ── STATE ─────────────────────────────────────────
let selectedFile = null;

// ── SECTION LABELS ────────────────────────────────
const SECTION_LABELS = {
  parametros: 'Parámetros principales',
  fechas:     'Coherencia de fechas',
  autores:    'Coherencia de autores',
  ortografia: 'Ortografía y gramática',
};

// ── DRAG & DROP ───────────────────────────────────
dropArea.addEventListener('click', () => fileInput.click());

dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.classList.add('drag-over');
});

dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('drag-over');
});

dropArea.addEventListener('drop', (e) => {
  e.preventDefault();
  dropArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

btnClear.addEventListener('click', (e) => {
  e.stopPropagation();
  clearFile();
});

function setFile(file) {
  if (!file.name.endsWith('.docx')) {
    showToast('Solo se aceptan archivos .docx');
    return;
  }
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileInfo.style.display = 'flex';
  dropArea.style.display = 'none';
  updateVerifyBtn();
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.style.display = 'none';
  dropArea.style.display = 'flex';
  updateVerifyBtn();
  hideResults();
}

// ── FIELD LISTENERS ───────────────────────────────
[inputTitulo, inputId, inputConsec].forEach(input => {
  input.addEventListener('input', updateVerifyBtn);
});

function updateVerifyBtn() {
  // Require file + at least one param filled
  const hasFile   = !!selectedFile;
  const hasParams = inputTitulo.value.trim() || inputId.value.trim() || inputConsec.value.trim();
  btnVerify.disabled = !(hasFile && hasParams);
}

// ── VERIFY ────────────────────────────────────────
btnVerify.addEventListener('click', runVerification);

async function runVerification() {
  if (!selectedFile) return;

  setLoading(true);
  hideResults();

  const formData = new FormData();
  formData.append('file',        selectedFile);
  formData.append('titulo',      inputTitulo.value.trim());
  formData.append('id_tarea',    inputId.value.trim());
  formData.append('consecutivo', inputConsec.value.trim());

  try {
    const res = await fetch(`${API_URL}/verificar`, {
      method: 'POST',
      body:   formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido del servidor' }));
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

  const sections = data.resultados || {};
  let totalOk = 0, totalWarn = 0, totalErr = 0;

  // Count totals
  for (const rs of Object.values(sections)) {
    for (const r of rs) {
      if (r.estado === 'OK')    totalOk++;
      if (r.estado === 'WARN')  totalWarn++;
      if (r.estado === 'ERROR') totalErr++;
    }
  }

  // Update summary
  countOkEl.textContent   = totalOk;
  countWarnEl.textContent = totalWarn;
  countErrEl.textContent  = totalErr;

  // Verdict
  verdictEl.className = 'summary-verdict';
  if (totalErr > 0) {
    verdictEl.textContent = '✘ Requiere corrección';
    verdictEl.classList.add('verdict-err');
  } else if (totalWarn > 0) {
    verdictEl.textContent = '⚠ Revisar advertencias';
    verdictEl.classList.add('verdict-warn');
  } else {
    verdictEl.textContent = '✔ Documento coherente';
    verdictEl.classList.add('verdict-ok');
  }

  // Render each section block
  let delay = 0;
  for (const [sectionKey, rows] of Object.entries(sections)) {
    const block = buildBlock(sectionKey, rows, delay);
    resultBlocks.appendChild(block);
    delay += 60;
  }

  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildBlock(sectionKey, rows, delay) {
  const label = SECTION_LABELS[sectionKey] || sectionKey;

  // Count per section
  const ok   = rows.filter(r => r.estado === 'OK').length;
  const warn = rows.filter(r => r.estado === 'WARN').length;
  const err  = rows.filter(r => r.estado === 'ERROR').length;

  const block = document.createElement('div');
  block.className = 'result-block';
  block.style.animationDelay = `${delay}ms`;

  // Header
  const header = document.createElement('div');
  header.className = 'block-header';
  header.innerHTML = `
    <div class="block-title-row">
      <span class="block-section-label">${label}</span>
      <div class="block-badges">
        ${ok   ? `<span class="mini-badge mini-ok">✔ ${ok}</span>`      : ''}
        ${warn ? `<span class="mini-badge mini-warn">⚠ ${warn}</span>`  : ''}
        ${err  ? `<span class="mini-badge mini-err">✘ ${err}</span>`    : ''}
      </div>
    </div>
    <span class="block-toggle open">▼</span>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'block-body';

  for (const row of rows) {
    const rowEl = document.createElement('div');
    const cls = stateToClass(row.estado);
    rowEl.className = `result-row ${cls}`;
    rowEl.innerHTML = `
      <span class="row-icon">${stateToIcon(row.estado)}</span>
      <span class="row-text">${escapeHtml(row.detalle)}</span>
    `;
    body.appendChild(rowEl);
  }

  // Toggle collapse
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

// ── HELPERS ───────────────────────────────────────
function stateToClass(estado) {
  return { OK: 'row-ok', WARN: 'row-warn', ERROR: 'row-err', INFO: 'row-info' }[estado] || 'row-info';
}

function stateToIcon(estado) {
  return { OK: '✔', WARN: '⚠', ERROR: '✘', INFO: 'ℹ' }[estado] || 'ℹ';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setLoading(on) {
  btnVerify.disabled = on;
  btnIdle.style.display    = on ? 'none'  : 'flex';
  btnLoading.style.display = on ? 'flex'  : 'none';
}

function hideResults() {
  resultsSection.style.display = 'none';
  resultBlocks.innerHTML = '';
}

// ── TOAST ─────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}
