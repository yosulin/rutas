/* ============================================================
   Rutas por el Monte — app.js
   Toda la información viene de data/rutas.json (fetch en runtime).
   No hay datos de rutas escritos en este archivo.
   ============================================================ */

const DATA_URL = 'data/rutas.json';
const VERSION_URL = 'data/version.json';

// El dataset completo se descarga y se guarda entero (necesario para poder
// buscar/filtrar sin conexión sobre todas las rutas), pero solo se pintan
// BATCH_SIZE tarjetas de golpe: el resto se van añadiendo al hacer scroll
// (o con el botón "Cargar más"), para no penalizar el primer render cuando
// la colección crezca (hoy 273, pronto ~500).
const BATCH_SIZE = 30;
let visibleCount = BATCH_SIZE;

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
function fmtPct(v) { return v == null ? '—' : `${v}%`; }

/* ---------------- carga de datos ---------------- */
async function loadRoutes() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('No se pudo cargar ' + DATA_URL);
  return res.json();
}

// Metadata del despliegue (cuándo se generaron los datos, cuántas rutas,
// qué build de la app). Si falla (offline la primera vez, fichero ausente
// en una versión antigua...) simplemente no se muestra: nunca bloquea la
// carga de las rutas.
async function loadVersionInfo() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

// Se guarda para poder mostrarla en el modal de Ajustes (⚙️ junto al tema),
// en vez de tener que bajar hasta el pie de página.
let VERSION_INFO = null;

function openSettingsModal() {
  const info = VERSION_INFO;
  const fecha = info ? new Date(info.generado_en) : null;
  const fechaTxt = (fecha && !isNaN(fecha.getTime()))
    ? fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : (info?.generado_en || '—');

  openModal(`
    <div class="modal-head">
      <div><p class="modal-title">Ajustes</p><p class="modal-sub">Rutas por el Monte</p></div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <p class="modal-section-title">Versión</p>
        <div class="settings-list">
          <div class="settings-row"><span class="settings-label">Build</span><span class="settings-value">${info?.app_build || '—'}</span></div>
          <div class="settings-row"><span class="settings-label">Datos actualizados</span><span class="settings-value">${fechaTxt}</span></div>
          <div class="settings-row"><span class="settings-label">Rutas</span><span class="settings-value">${info?.total_rutas ?? ROUTES.length}</span></div>
        </div>
      </div>
    </div>
  `, '440px');
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
const ICON_MAP = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3Z"/><line x1="9" y1="7" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="17"/></svg>`;
const ICON_DIRECTIONS = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 19h14"/></svg>`;

/* Ruta de la ruta activa cuyo modal de mapa está abierto, para poder
   destruir correctamente la instancia de Leaflet al cerrar/sustituir el modal. */
let activeLeafletMap = null;
function destroyActiveMap() {
  if (activeLeafletMap) {
    try { activeLeafletMap.remove(); } catch (err) { console.warn('Error al destruir el mapa', err); }
    activeLeafletMap = null;
  }
}

function hasValidMap(r) {
  return !!(r && r.mapa_habilitado === true && r.estado_track === 'VALIDADO');
}

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
      applyFilters();
    });
  });

  document.getElementById('dist-min').value = state.distMin ?? '';
  document.getElementById('dist-max').value = state.distMax ?? '';
  document.getElementById('dist-min').addEventListener('input', e => {
    state.distMin = e.target.value === '' ? null : Number(e.target.value);
    applyFilters();
  });
  document.getElementById('dist-max').addEventListener('input', e => {
    state.distMax = e.target.value === '' ? null : Number(e.target.value);
    applyFilters();
  });

  const sortSelect = document.getElementById('sort-select');
  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', e => { state.sort = e.target.value; applyFilters(); });

  document.getElementById('clear-filters').addEventListener('click', () => {
    state.dificultad.clear(); state.exigencia.clear(); state.tipo_ruta.clear();
    state.pais.clear(); state.caracteristicas.clear();
    state.distMin = null; state.distMax = null; state.sort = 'nombre';
    renderFilters();
    applyFilters();
  });
}

/* ---------------- render: tarjetas ---------------- */
function renderCard(r) {
  const difClass = `dif-${slug(r.dificultad)}`;
  const wikiBtn = r.wikiloc_url
    ? `<a class="icon-btn" href="${r.wikiloc_url}" target="_blank" rel="noopener" title="Ver en Wikiloc" onclick="event.stopPropagation()">${ICON_WIKILOC}</a>` : '';
  const ytBtn = r.youtube_url
    ? `<a class="icon-btn" href="${r.youtube_url}" target="_blank" rel="noopener" title="Ver vídeo en YouTube" onclick="event.stopPropagation()">${ICON_YOUTUBE}</a>` : '';
  // Solo un indicador (no una acción aparte): el mapa vive dentro del
  // detalle de la ruta, así que aquí basta con avisar de que existe.
  const mapIcon = hasValidMap(r)
    ? `<span class="icon-btn" title="Con mapa y recorrido">${ICON_MAP}</span>` : '';

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
        <div class="route-stat"><b>${fmtPct(r.pendiente_media_pct)}</b>Pend. media</div>
      </div>
      <div class="card-footer">
        ${wikiBtn}${ytBtn}${mapIcon}
        <span class="spacer"></span>
        <span class="detail-link">Ver detalle →</span>
      </div>
    </div>
  `;
}

// Se llama cuando cambia algún filtro/búsqueda/orden: siempre se vuelve a
// empezar desde el primer lote de resultados (si no, al filtrar podríamos
// quedarnos con "visibleCount" alto pero muy pocos resultados nuevos).
function applyFilters() {
  visibleCount = BATCH_SIZE;
  renderRoutes();
}

function loadMore() {
  visibleCount += BATCH_SIZE;
  renderRoutes();
}

let loadMoreObserver = null;
function ensureLoadMoreObserver() {
  if (loadMoreObserver || !('IntersectionObserver' in window)) return;
  const sentinel = document.getElementById('load-more-sentinel');
  if (!sentinel) return;
  loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) loadMore();
  }, { rootMargin: '600px 0px' });
  loadMoreObserver.observe(sentinel);
}

function renderRoutes() {
  const filtered = getFiltered();
  const showing = filtered.slice(0, visibleCount);
  const countEl = document.getElementById('result-count');
  const loadMoreWrap = document.getElementById('load-more-wrap');

  if (!filtered.length) {
    countEl.textContent = `0 rutas de ${ROUTES.length}`;
  } else if (showing.length < filtered.length) {
    countEl.textContent = `Mostrando ${showing.length} de ${filtered.length} ruta${filtered.length === 1 ? '' : 's'} (${ROUTES.length} en total)`;
  } else {
    countEl.textContent = `${filtered.length} ruta${filtered.length === 1 ? '' : 's'} de ${ROUTES.length}`;
  }

  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  if (!filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    loadMoreWrap.hidden = true;
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = showing.map(renderCard).join('');
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openRouteModal(card.dataset.id));
  });

  const hayMas = showing.length < filtered.length;
  loadMoreWrap.hidden = !hayMas;
  if (hayMas) ensureLoadMoreObserver();
}

/* ---------------- modal: detalle de ruta ---------------- */
const overlay = document.getElementById('modal-overlay');
const modalCard = document.getElementById('modal-card');

function closeModal() {
  overlay.classList.remove('show');
  destroyActiveMap();
}
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openModal(html, maxWidth) {
  destroyActiveMap(); // por si se sustituye un modal de mapa ya abierto
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

  // El mapa y sus acciones viven dentro del propio detalle (no en un modal
  // aparte): si la ruta lo tiene, "Cómo llegar"/"Descargar GPX" se añaden
  // al mismo grupo de enlaces que Wikiloc/YouTube/fuente, justo debajo del mapa.
  const conMapa = hasValidMap(r);
  const comoLlegarUrl = conMapa
    ? (r.mapa_origen_url || (r.latitud_origen != null && r.longitud_origen != null
        ? `https://www.google.com/maps/dir/?api=1&destination=${r.latitud_origen},${r.longitud_origen}`
        : null))
    : null;

  const linksHtml = `
    ${comoLlegarUrl ? `<a href="${comoLlegarUrl}" target="_blank" rel="noopener">${ICON_DIRECTIONS} Cómo llegar al inicio</a>` : ''}
    ${conMapa && r.track_gpx ? `<a href="${r.track_gpx}" download>${ICON_DOWNLOAD} Descargar GPX</a>` : ''}
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
          <div class="kpi-cell"><div class="kpi-num">${fmtPct(r.pendiente_media_pct)}</div><div class="kpi-label">Pendiente media</div></div>
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
      ${conMapa ? `
      <div class="modal-section">
        <p class="modal-section-title">Mapa y recorrido</p>
        <div id="map-container" class="map-container"><div class="map-loading">Cargando mapa…</div></div>
        <div id="elevation-container" class="elevation-container"></div>
      </div>` : ''}
      <div class="modal-section">
        <div class="modal-links">${linksHtml.trim() ? linksHtml : '<span class="tag">Sin enlaces disponibles</span>'}</div>
      </div>
    </div>
  `, conMapa ? '1000px' : '820px');

  if (conMapa) {
    // El contenedor ya está en el DOM tras openModal(); esperamos al
    // siguiente frame para que tenga tamaño real antes de inicializar Leaflet.
    requestAnimationFrame(() => initLeafletMap(r));
  }
}

/* ---------------- perfil de elevación (a partir del mismo GeoJSON del mapa) ---------------- */
function haversineMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Coordenadas del "lienzo" del SVG del perfil (viewBox), compartidas entre
// el renderizado y la interacción de arrastrar el dedo/ratón sobre él.
const ELEV_W = 600, ELEV_H = 130, ELEV_PAD_L = 34, ELEV_PAD_R = 8, ELEV_PAD_T = 10, ELEV_PAD_B = 18;

// Extrae [{d: distancia acumulada en m, ele: altitud en m, lat, lon}] de la
// primera LineString del GeoJSON, siempre que traiga elevación (3er valor de
// cada coordenada [lon, lat, ele]). Si no la trae, no hay perfil que dibujar.
function buildElevationSeries(geojson) {
  const feature = (geojson.features || []).find(f => f.geometry && f.geometry.type === 'LineString');
  const coords = feature && feature.geometry.coordinates;
  if (!coords || coords.length < 2 || coords[0].length < 3) return null;

  const pts = [{ d: 0, ele: coords[0][2], lat: coords[0][1], lon: coords[0][0] }];
  let cum = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2, ele2] = coords[i];
    cum += haversineMetros(lat1, lon1, lat2, lon2);
    pts.push({ d: cum, ele: ele2, lat: lat2, lon: lon2 });
  }
  return pts;
}

function renderElevationSvg(pts) {
  const totalD = pts[pts.length - 1].d;
  if (!totalD) return '';
  const eles = pts.map(p => p.ele);
  const minE = Math.min(...eles), maxE = Math.max(...eles);
  const spanE = Math.max(maxE - minE, 1);

  const x = d => ELEV_PAD_L + (d / totalD) * (ELEV_W - ELEV_PAD_L - ELEV_PAD_R);
  const y = e => ELEV_PAD_T + (1 - (e - minE) / spanE) * (ELEV_H - ELEV_PAD_T - ELEV_PAD_B);

  const linePts = pts.map(p => `${x(p.d).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ');
  const base = (ELEV_H - ELEV_PAD_B).toFixed(1);
  const areaPts = `${x(0).toFixed(1)},${base} ${linePts} ${x(totalD).toFixed(1)},${base}`;

  return `
    <svg viewBox="0 0 ${ELEV_W} ${ELEV_H}" class="elevation-svg" preserveAspectRatio="none">
      <polygon points="${areaPts}" class="elevation-area"></polygon>
      <polyline points="${linePts}" class="elevation-line"></polyline>
      <text x="${ELEV_PAD_L}" y="${ELEV_H - 5}" class="elevation-axis-label">0 km</text>
      <text x="${(ELEV_W - ELEV_PAD_R).toFixed(1)}" y="${ELEV_H - 5}" text-anchor="end" class="elevation-axis-label">${(totalD / 1000).toFixed(1)} km</text>
      <text x="${(ELEV_PAD_L - 4).toFixed(1)}" y="${y(maxE).toFixed(1)}" text-anchor="end" class="elevation-axis-label">${Math.round(maxE)} m</text>
      <text x="${(ELEV_PAD_L - 4).toFixed(1)}" y="${y(minE).toFixed(1)}" text-anchor="end" class="elevation-axis-label">${Math.round(minE)} m</text>
      <line class="elevation-cursor-line" style="display:none"></line>
      <circle class="elevation-cursor-dot" r="4" style="display:none"></circle>
    </svg>
  `;
}

// Permite "seguir" el perfil con el ratón/dedo: dibuja una guía vertical y un
// punto sobre la altitud correspondiente, muestra distancia/altitud en un
// pequeño texto, y sincroniza un marcador sobre el mapa (si sigue abierto).
function wireElevationInteraction(container, pts) {
  const svg = container.querySelector('.elevation-svg');
  const readout = container.querySelector('.elevation-readout');
  const cursorLine = container.querySelector('.elevation-cursor-line');
  const cursorDot = container.querySelector('.elevation-cursor-dot');
  if (!svg || !cursorLine || !cursorDot || pts.length < 2) return;

  const totalD = pts[pts.length - 1].d;
  const eles = pts.map(p => p.ele);
  const minE = Math.min(...eles), maxE = Math.max(...eles);
  const spanE = Math.max(maxE - minE, 1);
  const xOf = d => ELEV_PAD_L + (d / totalD) * (ELEV_W - ELEV_PAD_L - ELEV_PAD_R);
  const yOf = e => ELEV_PAD_T + (1 - (e - minE) / spanE) * (ELEV_H - ELEV_PAD_T - ELEV_PAD_B);

  let marker = null;

  function nearestPoint(d) {
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].d < d) lo = mid + 1; else hi = mid;
    }
    return pts[lo];
  }

  function update(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const pt = nearestPoint(frac * totalD);
    const px = xOf(pt.d);

    cursorLine.setAttribute('x1', px);
    cursorLine.setAttribute('x2', px);
    cursorLine.setAttribute('y1', ELEV_PAD_T);
    cursorLine.setAttribute('y2', ELEV_H - ELEV_PAD_B);
    cursorDot.setAttribute('cx', px);
    cursorDot.setAttribute('cy', yOf(pt.ele));
    cursorLine.style.display = 'block';
    cursorDot.style.display = 'block';

    if (readout) readout.textContent = `${(pt.d / 1000).toFixed(2)} km · ${Math.round(pt.ele)} m`;

    if (activeLeafletMap && typeof L !== 'undefined' && pt.lat != null && pt.lon != null) {
      if (!marker) {
        marker = L.circleMarker([pt.lat, pt.lon], {
          radius: 7, color: '#fff', weight: 2, fillColor: '#e2664d', fillOpacity: 1,
        }).addTo(activeLeafletMap);
      } else {
        marker.setLatLng([pt.lat, pt.lon]);
      }
    }
  }

  function clear() {
    cursorLine.style.display = 'none';
    cursorDot.style.display = 'none';
    if (readout) readout.textContent = 'Desliza sobre el perfil para ver altitud y distancia';
    if (marker) { marker.remove(); marker = null; }
  }

  svg.addEventListener('mousemove', e => update(e.clientX));
  svg.addEventListener('mouseleave', clear);
  svg.addEventListener('touchmove', e => {
    if (e.touches && e.touches[0]) { update(e.touches[0].clientX); e.preventDefault(); }
  }, { passive: false });
  svg.addEventListener('touchend', clear);
}

function renderElevationProfile(container, geojson, r) {
  if (!container) return;
  const pts = buildElevationSeries(geojson);
  if (!pts) { container.innerHTML = ''; return; }
  const maxTxt = r.pendiente_maxima_pct != null ? ` · pendiente máx. ${r.pendiente_maxima_pct}%` : '';
  container.innerHTML = `
    <div class="elevation-readout">Desliza sobre el perfil para ver altitud y distancia</div>
    ${renderElevationSvg(pts)}
    <div class="elevation-caption">Perfil de elevación${maxTxt}</div>
  `;
  wireElevationInteraction(container, pts);
}

/* ---------------- mapa embebido en el detalle (Leaflet + GeoJSON bajo demanda) ---------------- */
async function initLeafletMap(r) {
  const container = document.getElementById('map-container');
  if (!container) return; // el modal se cerró antes de llegar aquí

  if (typeof L === 'undefined') {
    container.innerHTML = '<div class="map-error">No se ha podido cargar la librería de mapas (sin conexión la primera vez que se usa).</div>';
    return;
  }
  if (!r.track_geojson) {
    container.innerHTML = '<div class="map-error">Esta ruta no tiene un recorrido disponible todavía.</div>';
    return;
  }

  let geojson;
  try {
    const res = await fetch(r.track_geojson);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    geojson = await res.json();
  } catch (err) {
    console.error('No se pudo cargar el GeoJSON de la ruta', r.id, err);
    if (document.body.contains(container)) {
      container.innerHTML = '<div class="map-error">No se ha podido cargar el recorrido. Comprueba tu conexión e inténtalo de nuevo.</div>';
    }
    return;
  }

  // El modal pudo cerrarse mientras esperábamos la respuesta de fetch().
  if (!document.body.contains(container)) return;

  // El perfil de elevación reutiliza este mismo GeoJSON (ya descargado para
  // el mapa): no hace falta una segunda petición. Es independiente del mapa
  // interactivo, así que se pinta aunque Leaflet fallase más abajo.
  renderElevationProfile(document.getElementById('elevation-container'), geojson, r);

  container.innerHTML = '';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4fcf9d';

  let map;
  try {
    map = L.map(container, { scrollWheelZoom: false });
    activeLeafletMap = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);

    const trackLayer = L.geoJSON(geojson, {
      style: { color: accent, weight: 4, opacity: 0.9 },
    }).addTo(map);

    const bounds = trackLayer.getBounds();
    if (!bounds.isValid()) throw new Error('El GeoJSON no tiene coordenadas válidas');
    map.fitBounds(bounds, { padding: [24, 24] });

    if (r.latitud_origen != null && r.longitud_origen != null) {
      L.circleMarker([r.latitud_origen, r.longitud_origen], {
        radius: 8, color: '#fff', weight: 2, fillColor: accent, fillOpacity: 1,
      }).addTo(map).bindTooltip('Inicio');

      if (r.latitud_final != null && r.longitud_final != null) {
        const separacion = map.distance(
          [r.latitud_origen, r.longitud_origen],
          [r.latitud_final, r.longitud_final]
        );
        if (separacion > 80) {
          L.circleMarker([r.latitud_final, r.longitud_final], {
            radius: 8, color: '#fff', weight: 2, fillColor: '#e2664d', fillOpacity: 1,
          }).addTo(map).bindTooltip('Final');
        }
      }
    }
  } catch (err) {
    console.error('Error dibujando el mapa', r.id, err);
    if (map) { try { map.remove(); } catch (e2) { /* noop */ } }
    activeLeafletMap = null;
    if (document.body.contains(container)) {
      container.innerHTML = '<div class="map-error">El recorrido de esta ruta no se ha podido representar.</div>';
    }
    return;
  }

  // El modal ya tiene su tamaño final tras la transición CSS (~180ms);
  // sin esto Leaflet puede quedarse con un tamaño de mapa incorrecto.
  setTimeout(() => { if (activeLeafletMap === map) map.invalidateSize(); }, 220);
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
  document.getElementById('settings-btn').addEventListener('click', openSettingsModal);

  const filtersToggle = document.getElementById('filters-toggle');
  const filtersPanel = document.getElementById('filters-panel');
  filtersToggle.addEventListener('click', () => filtersPanel.classList.toggle('open'));

  document.getElementById('search-input').addEventListener('input', e => {
    state.q = e.target.value.trim().toLowerCase();
    applyFilters();
  });

  document.getElementById('load-more-btn').addEventListener('click', loadMore);

  let routes;
  try {
    routes = await loadRoutes();
  } catch (err) {
    document.getElementById('grid').innerHTML =
      `<p class="empty" style="display:block">No se han podido cargar las rutas. Comprueba tu conexión.</p>`;
    console.error(err);
    return;
  }
  ROUTES = routes;

  // La metadata de versión es puramente informativa: si falla, no debe
  // impedir que se muestren las rutas (por eso va en su propio try/catch
  // dentro de loadVersionInfo, y se pide después de tener ya las rutas).
  // Se guarda para mostrarla bajo demanda en el modal de Ajustes.
  VERSION_INFO = await loadVersionInfo();

  buildFacets();
  renderSummary();
  renderFilters();
  renderRoutes();
}

init();
