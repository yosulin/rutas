/* ============================================================
   Rutas por el Monte — app.js
   Toda la información viene de data/rutas.json (fetch en runtime).
   No hay datos de rutas escritos en este archivo.
   ============================================================ */

const DATA_URL = 'data/rutas.json';

const DIFICULTAD_ORDER = ['Fácil', 'Moderado', 'Difícil', 'Muy difícil'];
const EXIGENCIA_ORDER = ['Baja', 'Media', 'Alta', 'Muy alta'];
const TIPO_ORDER = ['Circular', 'Ida y vuelta', 'Solo ida'];
const SIN_DATO = 'Sin dato';

let ROUTES = [];
let FACETS = { dificultad: [], exigencia: [], tipo_ruta: [], pais: [], region: [], caracteristicas: [] };

const state = {
  q: '',
  dificultad: new Set(),
  exigencia: new Set(),
  tipo_ruta: new Set(),
  pais: new Set(),
  caracteristicas: new Set(),
  distMin: null,
  distMax: null,
  sort: 'nombre',
};

/* ---------------- utilidades ---------------- */
function slug(str) {
  return (str || SIN_DATO)
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function orderedUnique(values, order) {
  const set = new Set(values.map(v => v || SIN_DATO));
  const known = order.filter(o => set.has(o));
  const rest = [...set].filter(v => !order.includes(v)).sort();
  return [...known, ...rest];
}

function fmtKm(v) { return v == null ? '—' : `${v.toLocaleString('es-ES')} km`; }
function fmtM(v) { return v == null ? '—' : `${v.toLocaleString('es-ES')} m`; }
function fmtDur(r) { return r.duracion_texto || (r.duracion_min ? `${r.duracion_min} min` : '—'); }

/* ---------------- carga de datos ---------------- */
async function loadRoutes() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('No se pudo cargar ' + DATA_URL);
  return res.json();
}

function buildFacets() {
  FACETS.dificultad = orderedUnique(ROUTES.map(r => r.dificultad), DIFICULTAD_ORDER);
  FACETS.exigencia = orderedUnique(ROUTES.map(r => r.exigencia), EXIGENCIA_ORDER);
  FACETS.tipo_ruta = orderedUnique(ROUTES.map(r => r.tipo_ruta), TIPO_ORDER);
  FACETS.pais = orderedUnique(ROUTES.map(r => r.pais), []);
  FACETS.region = orderedUnique(ROUTES.map(r => r.region), []);
  const tagSet = new Set();
  ROUTES.forEach(r => (r.caracteristicas || []).forEach(t => tagSet.add(t)));
  FACETS.caracteristicas = [...tagSet].sort();
}

/* ---------------- filtrado y orden ---------------- */
function matchesFilters(r) {
  if (state.q) {
    const hay = `${r.nombre} ${r.localidad || ''} ${r.region || ''}`.toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  if (state.dificultad.size && !state.dificultad.has(r.dificultad || SIN_DATO)) return false;
  if (state.exigencia.size && !state.exigencia.has(r.exigencia || SIN_DATO)) return false;
  if (state.tipo_ruta.size && !state.tipo_ruta.has(r.tipo_ruta || SIN_DATO)) return false;
  if (state.pais.size && !state.pais.has(r.pais || SIN_DATO)) return false;
  if (state.caracteristicas.size) {
    const tags = new Set(r.caracteristicas || []);
    for (const t of state.caracteristicas) if (!tags.has(t)) return false;
  }
  if (state.distMin != null && (r.distancia_km == null || r.distancia_km < state.distMin)) return false;
  if (state.distMax != null && (r.distancia_km == null || r.distancia_km > state.distMax)) return false;
  return true;
}

function sortRoutes(list) {
  const arr = [...list];
  switch (state.sort) {
    case 'trailrank_desc':
      arr.sort((a, b) => (b.trailrank ?? -1) - (a.trailrank ?? -1)); break;
    case 'distancia_asc':
      arr.sort((a, b) => (a.distancia_km ?? 1e9) - (b.distancia_km ?? 1e9)); break;
    case 'distancia_desc':
      arr.sort((a, b) => (b.distancia_km ?? -1) - (a.distancia_km ?? -1)); break;
    case 'desnivel_asc':
      arr.sort((a, b) => (a.desnivel_positivo_m ?? 1e9) - (b.desnivel_positivo_m ?? 1e9)); break;
    default:
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  return arr;
}

function getFiltered() {
  return sortRoutes(ROUTES.filter(matchesFilters));
}

/* ---------------- iconos inline ---------------- */
const ICON_SEARCH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_CHART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="12" width="3.5" height="8"/><rect x="11" y="6" width="3.5" height="14"/><rect x="17" y="9" width="3.5" height="11"/></svg>`;
const ICON_WIKILOC = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>`;
const ICON_YOUTUBE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><path d="M10.5 9.2 15 12l-4.5 2.8Z" fill="currentColor" stroke="none"/></svg>`;
const ICON_SOURCE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6"/><line x1="5" y1="10" x2="5" y2="19"/><line x1="10" y1="10" x2="10" y2="19"/><line x1="14" y1="10" x2="14" y2="19"/><line x1="19" y1="10" x2="19" y2="19"/><line x1="3" y1="19" x2="21" y2="19"/></svg>`;

/* ---------------- render: barra resumen ---------------- */
function renderSummary() {
  const total = ROUTES.length;
  const km = Math.round(ROUTES.reduce((a, r) => a + (r.distancia_km || 0), 0));
  const conVideo = ROUTES.filter(r => r.youtube_url).length;
  const paises = new Set(ROUTES.map(r => r.pais).filter(Boolean)).size;
  document.getElementById('summary').innerHTML = `
    <div class="summary-cell"><div class="summary-num">${total}</div><div class="summary-label">Rutas totales</div></div>
    <div class="summary-cell"><div class="summary-num">${km.toLocaleString('es-ES')}</div><div class="summary-label">Km acumulados</div></div>
    <div class="summary-cell"><div class="summary-num">${conVideo}</div><div class="summary-label">Con vídeo</div></div>
    <div class="summary-cell"><div class="summary-num">${paises}</div><div class="summary-label">Países</div></div>
  `;
}

/* ---------------- render: filtros ---------------- */
function chipRow(groupKey, values) {
  return values.map(v => {
    const active = state[groupKey].has(v);
    return `<div class="chip ${active ? 'active' : ''}" data-group="${groupKey}" data-value="${v.replace(/"/g, '&quot;')}">${v}</div>`;
  }).join('');
}

function renderFilters() {
  const panel = document.getElementById('filters-panel');
  panel.innerHTML = `
    <div class="filter-group">
      <h4>Dificultad</h4>
      <div class="chip-row" id="f-dificultad">${chipRow('dificultad', FACETS.dificultad)}</div>
    </div>
    <div class="filter-group">
      <h4>Exigencia física</h4>
      <div class="chip-row" id="f-exigencia">${chipRow('exigencia', FACETS.exigencia)}</div>
    </div>
    <div class="filter-group">
      <h4>Tipo de ruta</h4>
      <div class="chip-row" id="f-tipo">${chipRow('tipo_ruta', FACETS.tipo_ruta)}</div>
    </div>
    <div class="filter-group">
      <h4>País</h4>
      <div class="chip-row" id="f-pais">${chipRow('pais', FACETS.pais)}</div>
    </div>
    <div class="filter-group" style="grid-column:1/-1">
      <h4>Características</h4>
      <div class="chip-row" id="f-caract">${chipRow('caracteristicas', FACETS.caracteristicas)}</div>
    </div>
    <div class="filter-group">
      <h4>Distancia (km)</h4>
      <div class="range-inputs">
        <input type="number" min="0" id="dist-min" placeholder="min">
        <span>—</span>
        <input type="number" min="0" id="dist-max" placeholder="max">
      </div>
    </div>
    <div class="filter-group">
      <h4>Orden</h4>
      <select id="sort-select" class="btn" style="width:100%;">
        <option value="nombre">Nombre (A-Z)</option>
        <option value="trailrank_desc">Más populares (trailrank)</option>
        <option value="distancia_asc">Distancia (menor a mayor)</option>
        <option value="distancia_desc">Distancia (mayor a menor)</option>
        <option value="desnivel_asc">Desnivel (menor a mayor)</option>
      </select>
    </div>
    <div class="filters-footer">
      <button class="btn" id="clear-filters">Limpiar filtros</button>
    </div>
  `;

  panel.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.group;
      const value = chip.dataset.value;
      if (state[group].has(value)) state[group].delete(value);
      else state[group].add(value);
      renderFilters();
      renderRoutes();
    });
  });

  document.getElementById('dist-min').value = state.distMin ?? '';
  document.getElementById('dist-max').value = state.distMax ?? '';
  document.getElementById('dist-min').addEventListener('input', e => {
    state.distMin = e.target.value === '' ? null : Number(e.target.value);
    renderRoutes();
  });
  document.getElementById('dist-max').addEventListener('input', e => {
    state.distMax = e.target.value === '' ? null : Number(e.target.value);
    renderRoutes();
  });

  const sortSelect = document.getElementById('sort-select');
  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', e => { state.sort = e.target.value; renderRoutes(); });

  document.getElementById('clear-filters').addEventListener('click', () => {
    state.dificultad.clear(); state.exigencia.clear(); state.tipo_ruta.clear();
    state.pais.clear(); state.caracteristicas.clear();
    state.distMin = null; state.distMax = null; state.sort = 'nombre';
    renderFilters();
    renderRoutes();
  });
}

/* ---------------- render: tarjetas ---------------- */
function renderCard(r) {
  const difClass = `dif-${slug(r.dificultad)}`;
  const wikiBtn = r.wikiloc_url
    ? `<a class="icon-btn" href="${r.wikiloc_url}" target="_blank" rel="noopener" title="Ver en Wikiloc" onclick="event.stopPropagation()">${ICON_WIKILOC}</a>` : '';
  const ytBtn = r.youtube_url
    ? `<a class="icon-btn" href="${r.youtube_url}" target="_blank" rel="noopener" title="Ver vídeo en YouTube" onclick="event.stopPropagation()">${ICON_YOUTUBE}</a>` : '';

  return `
    <div class="card" data-id="${r.id}">
      <div class="card-head">
        <div>
          <p class="route-name">${r.nombre}</p>
          <div class="route-place">${[r.localidad, r.region].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        <span class="pill ${difClass}">${r.dificultad || SIN_DATO}</span>
      </div>
      <div class="route-tags">
        <span class="tag">${r.tipo_ruta || SIN_DATO}</span>
        ${r.pais ? `<span class="tag">${r.pais}</span>` : ''}
      </div>
      <div class="route-stats">
        <div class="route-stat"><b>${fmtKm(r.distancia_km)}</b>Distancia</div>
        <div class="route-stat"><b>${fmtM(r.desnivel_positivo_m)}</b>Desnivel +</div>
        <div class="route-stat"><b>${fmtDur(r)}</b>Duración</div>
      </div>
      <div class="card-footer">
        ${wikiBtn}${ytBtn}
        <span class="spacer"></span>
        <span class="detail-link">Ver detalle →</span>
      </div>
    </div>
  `;
}

function renderRoutes() {
  const filtered = getFiltered();
  document.getElementById('result-count').textContent =
    `${filtered.length} ruta${filtered.length === 1 ? '' : 's'} de ${ROUTES.length}`;
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  if (!filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = filtered.map(renderCard).join('');
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openRouteModal(card.dataset.id));
  });
}

/* ---------------- modal: detalle de ruta ---------------- */
const overlay = document.getElementById('modal-overlay');
const modalCard = document.getElementById('modal-card');

function closeModal() { overlay.classList.remove('show'); }
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openModal(html, maxWidth) {
  modalCard.style.maxWidth = maxWidth || '820px';
  modalCard.innerHTML = html;
  modalCard.querySelector('#modal-close').addEventListener('click', closeModal);
  overlay.classList.add('show');
}

function openRouteModal(id) {
  const r = ROUTES.find(x => x.id === id);
  if (!r) return;
  const difClass = `dif-${slug(r.dificultad)}`;
  const origen = r.origen || 'Wikiloc personal';
  const origenClass = /^wikiloc/i.test(origen) ? 'origen-wikiloc' : 'origen-oficial';
  const tagsHtml = (r.caracteristicas || []).map(t => `<span class="tag">${t}</span>`).join('') || '<span class="tag">Sin datos</span>';
  const linksHtml = `
    ${r.wikiloc_url ? `<a href="${r.wikiloc_url}" target="_blank" rel="noopener">${ICON_WIKILOC} Ver en Wikiloc</a>` : ''}
    ${r.youtube_url ? `<a href="${r.youtube_url}" target="_blank" rel="noopener">${ICON_YOUTUBE} Ver vídeo</a>` : ''}
    ${r.fuente_url ? `<a href="${r.fuente_url}" target="_blank" rel="noopener">${ICON_SOURCE} Ver fuente oficial</a>` : ''}
  `;

  openModal(`
    <div class="modal-head">
      <div>
        <p class="modal-title">${r.nombre}</p>
        <p class="modal-sub">${[r.localidad, r.region, r.pais].filter(Boolean).join(' · ')}</p>
      </div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="modal-pills">
          <span class="pill ${difClass}">${r.dificultad || SIN_DATO}</span>
          <span class="tag">Exigencia: ${r.exigencia || SIN_DATO}</span>
          <span class="tag">${r.tipo_ruta || SIN_DATO}</span>
          ${r.trailrank != null ? `<span class="tag">Trailrank: ${r.trailrank}</span>` : ''}
          <span class="pill ${origenClass}" title="Procedencia del dato">${origen}</span>
        </div>
      </div>
      <div class="modal-section">
        <div class="kpi-row">
          <div class="kpi-cell"><div class="kpi-num">${fmtKm(r.distancia_km)}</div><div class="kpi-label">Distancia</div></div>
          <div class="kpi-cell"><div class="kpi-num">${fmtM(r.desnivel_positivo_m)}</div><div class="kpi-label">Desnivel +</div></div>
          <div class="kpi-cell"><div class="kpi-num">${fmtM(r.desnivel_negativo_m)}</div><div class="kpi-label">Desnivel −</div></div>
          <div class="kpi-cell"><div class="kpi-num">${fmtDur(r)}</div><div class="kpi-label">Duración</div></div>
          <div class="kpi-cell"><div class="kpi-num">${fmtM(r.altitud_maxima_m)}</div><div class="kpi-label">Altitud máx.</div></div>
          <div class="kpi-cell"><div class="kpi-num">${fmtM(r.altitud_minima_m)}</div><div class="kpi-label">Altitud mín.</div></div>
        </div>
      </div>
      <div class="modal-section">
        <p class="modal-section-title">Características</p>
        <div class="tags-wrap">${tagsHtml}</div>
      </div>
      ${r.precauciones ? `
      <div class="modal-section">
        <p class="modal-section-title">Precauciones</p>
        <div class="insight-note warn">⚠️ ${r.precauciones}</div>
      </div>` : ''}
      ${r.descripcion ? `
      <div class="modal-section">
        <p class="modal-section-title">Descripción</p>
        <div class="insight-note">${r.descripcion}</div>
      </div>` : ''}
      <div class="modal-section">
        <div class="modal-links">${linksHtml || '<span class="tag">Sin enlaces disponibles</span>'}</div>
      </div>
    </div>
  `);
}

/* ---------------- modal: estadísticas globales ---------------- */
function topEntries(obj, n) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}
function barRows(entries, maxVal, altClass) {
  return entries.map(([label, val]) => `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill ${altClass || ''}" style="width:${Math.max((val / maxVal) * 100, 4)}%"></div></div>
      <div class="bar-value">${val}</div>
    </div>
  `).join('');
}

function computeGlobalStats() {
  const byDificultad = {}, byExigencia = {}, byPais = {}, byRegion = {}, byTag = {};
  let totalKm = 0, totalDesnivel = 0, totalMin = 0, trailrankSum = 0, trailrankCount = 0;

  ROUTES.forEach(r => {
    const dif = r.dificultad || SIN_DATO;
    byDificultad[dif] = (byDificultad[dif] || 0) + 1;
    const exi = r.exigencia || SIN_DATO;
    byExigencia[exi] = (byExigencia[exi] || 0) + 1;
    if (r.pais) byPais[r.pais] = (byPais[r.pais] || 0) + 1;
    if (r.region) byRegion[r.region] = (byRegion[r.region] || 0) + 1;
    (r.caracteristicas || []).forEach(t => { byTag[t] = (byTag[t] || 0) + 1; });
    totalKm += r.distancia_km || 0;
    totalDesnivel += r.desnivel_positivo_m || 0;
    totalMin += r.duracion_min || 0;
    if (r.trailrank != null) { trailrankSum += r.trailrank; trailrankCount++; }
  });

  const topRanked = [...ROUTES].filter(r => r.trailrank != null)
    .sort((a, b) => b.trailrank - a.trailrank).slice(0, 8);

  return {
    total: ROUTES.length, totalKm, totalDesnivel, totalMin,
    avgTrailrank: trailrankCount ? Math.round((trailrankSum / trailrankCount) * 10) / 10 : null,
    byDificultad, byExigencia, byPais, byRegion, byTag, topRanked,
  };
}

function openGlobalStatsModal() {
  const g = computeGlobalStats();
  const difOrder = DIFICULTAD_ORDER.filter(d => g.byDificultad[d]).concat(
    Object.keys(g.byDificultad).filter(d => !DIFICULTAD_ORDER.includes(d))
  );
  const difEntries = difOrder.map(d => [d, g.byDificultad[d]]);
  const difMax = Math.max(...Object.values(g.byDificultad), 1);

  const paisEntries = topEntries(g.byPais, 6);
  const paisMax = Math.max(...Object.values(g.byPais), 1);

  const tagEntries = topEntries(g.byTag, 8);
  const tagMax = Math.max(...Object.values(g.byTag), 1);

  const regionEntries = topEntries(g.byRegion, 8);
  const regionMax = Math.max(...Object.values(g.byRegion), 1);

  const topRankedHtml = g.topRanked.map(r => `
    <div class="bar-row">
      <div class="bar-label">${r.nombre}</div>
      <div class="bar-track"><div class="bar-fill alt" style="width:${(r.trailrank / 100) * 100}%"></div></div>
      <div class="bar-value">${r.trailrank}</div>
    </div>
  `).join('');

  const horas = Math.floor(g.totalMin / 60);

  openModal(`
    <div class="modal-head">
      <div><p class="modal-title">Estadísticas generales</p><p class="modal-sub">${g.total} rutas en la colección</p></div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="kpi-row">
          <div class="kpi-cell"><div class="kpi-num">${g.total}</div><div class="kpi-label">Rutas</div></div>
          <div class="kpi-cell"><div class="kpi-num">${Math.round(g.totalKm).toLocaleString('es-ES')} km</div><div class="kpi-label">Distancia acumulada</div></div>
          <div class="kpi-cell"><div class="kpi-num">${Math.round(g.totalDesnivel).toLocaleString('es-ES')} m</div><div class="kpi-label">Desnivel acumulado</div></div>
          <div class="kpi-cell"><div class="kpi-num">${horas} h</div><div class="kpi-label">Duración acumulada</div></div>
          <div class="kpi-cell"><div class="kpi-num">${g.avgTrailrank ?? '—'}</div><div class="kpi-label">Trailrank medio</div></div>
        </div>
      </div>

      <div class="modal-section two-col">
        <div>
          <p class="modal-section-title">Por dificultad</p>
          ${barRows(difEntries, difMax)}
        </div>
        <div>
          <p class="modal-section-title">Por país</p>
          ${barRows(paisEntries, paisMax, 'alt')}
        </div>
      </div>

      <div class="modal-section">
        <p class="modal-section-title">Por región (top 8)</p>
        ${barRows(regionEntries, regionMax)}
      </div>

      <div class="modal-section">
        <p class="modal-section-title">Características más frecuentes</p>
        ${barRows(tagEntries, tagMax, 'alt')}
      </div>

      <div class="modal-section">
        <p class="modal-section-title">Rutas más populares (trailrank)</p>
        ${topRankedHtml || '<p class="empty">Sin datos</p>'}
      </div>
    </div>
  `, '900px');
}

/* ---------------- tema claro/oscuro ---------------- */
const THEME_KEY = 'rutas-theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const knob = document.querySelector('.theme-switch .knob');
  if (knob) knob.textContent = theme === 'light' ? '☀️' : '🌙';
}
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const preferred = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(preferred);
  document.getElementById('theme-switch').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });
}

/* ---------------- instalación PWA ---------------- */
let deferredPrompt = null;
function initInstall() {
  const banner = document.getElementById('install-banner');
  const installBtn = document.getElementById('install-btn');
  const closeBtn = document.getElementById('close-install-banner');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  if (isStandalone) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.hidden = true;
  });

  closeBtn.addEventListener('click', () => { banner.hidden = true; });

  window.addEventListener('appinstalled', () => { banner.hidden = true; });

  // iOS Safari no dispara beforeinstallprompt: mostramos instrucción manual
  const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const isSafari = /safari/.test(window.navigator.userAgent.toLowerCase()) && !/crios|fxios/.test(window.navigator.userAgent.toLowerCase());
  if (isIOS && isSafari) {
    document.getElementById('install-text').textContent =
      'Instala esta app: pulsa Compartir → Añadir a pantalla de inicio.';
    installBtn.hidden = true;
    banner.hidden = false;
  }
}

/* ---------------- estado offline ---------------- */
function initOfflinePill() {
  const pill = document.getElementById('offline-pill');
  const update = () => pill.classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

/* ---------------- service worker ---------------- */
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error', err));
    });
  }
}

/* ---------------- arranque ---------------- */
async function init() {
  initTheme();
  initInstall();
  initOfflinePill();
  initServiceWorker();

  document.getElementById('stats-cta').addEventListener('click', openGlobalStatsModal);

  const filtersToggle = document.getElementById('filters-toggle');
  const filtersPanel = document.getElementById('filters-panel');
  filtersToggle.addEventListener('click', () => filtersPanel.classList.toggle('open'));

  document.getElementById('search-input').addEventListener('input', e => {
    state.q = e.target.value.trim().toLowerCase();
    renderRoutes();
  });

  try {
    ROUTES = await loadRoutes();
  } catch (err) {
    document.getElementById('grid').innerHTML =
      `<p class="empty" style="display:block">No se han podido cargar las rutas. Comprueba tu conexión.</p>`;
    console.error(err);
    return;
  }

  buildFacets();
  renderSummary();
  renderFilters();
  renderRoutes();
}

init();
