'use strict';

// ─── Tag config ───────────────────────────────────────────────────────────────

const TAGS = [
  { id: 'bug',     label: '#bug' },
  { id: 'feature', label: '#feature' },
  { id: 'meeting', label: '#meeting' },
  { id: 'review',  label: '#review' },
  { id: 'test',    label: '#test' },
  { id: 'fix',     label: '#fix' },
];

// ─── State ────────────────────────────────────────────────────────────────────

let state = { columns: [] };
const startedAt = {}; // cardId → timestamp (ms)

// UI-only (not persisted)
let filterSearch       = '';
let filterTag          = '';
let archiveSectionOpen = false;

// ─── Utilities ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

function fmt(totalSec) {
  const s = Math.floor(Math.max(0, totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

const pad = n => String(n).padStart(2, '0');

function getElapsed(card) {
  return startedAt[card.id]
    ? card.elapsed + (Date.now() - startedAt[card.id]) / 1000
    : card.elapsed;
}

function colTotal(col) {
  return col.cards.reduce((sum, c) => sum + getElapsed(c), 0);
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function loadTheme() {
  const theme = localStorage.getItem('timerboard-theme') || 'dark';
  document.documentElement.dataset.theme = theme;
  syncThemeBtn(theme);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('timerboard-theme', next);
  syncThemeBtn(next);
}

function syncThemeBtn(theme) {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function save() {
  const snap = {
    columns: state.columns.map(col => ({
      ...col,
      cards: col.cards.map(card => ({
        ...card,
        elapsed: getElapsed(card),
        running: !!startedAt[card.id],
      })),
    })),
  };
  localStorage.setItem('timerboard', JSON.stringify(snap));
}

function load() {
  try {
    const raw = localStorage.getItem('timerboard');
    if (!raw) throw new Error('empty');
    state = JSON.parse(raw);
    state.columns.forEach(col => {
      if (col.archived == null) col.archived = false;
      col.cards.forEach(card => {
        if (card.running)   startedAt[card.id] = Date.now();
        if (card.collapsed == null) card.collapsed = true;
        if (!Array.isArray(card.tags)) card.tags = [];
      });
    });
  } catch {
    state = {
      columns: [{ id: uid(), title: 'Mi Proyecto', archived: false, cards: [] }],
    };
  }
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

let tickId = null;

function ensureTick() {
  if (tickId || Object.keys(startedAt).length === 0) return;
  tickId = setInterval(tick, 1000);
}

function tick() {
  if (Object.keys(startedAt).length === 0) {
    clearInterval(tickId);
    tickId = null;
    return;
  }
  for (const col of state.columns) {
    let total = 0;
    for (const card of col.cards) {
      const elapsed = getElapsed(card);
      total += elapsed;
      if (startedAt[card.id]) {
        const el = document.querySelector(`[data-card-timer="${card.id}"]`);
        if (el) el.textContent = fmt(elapsed);
      }
    }
    const el = document.querySelector(`[data-col-total="${col.id}"]`);
    if (el) el.textContent = fmt(total);
  }
  save();
}

// ─── Find helpers ─────────────────────────────────────────────────────────────

function findCard(cardId) {
  for (const col of state.columns) {
    const card = col.cards.find(c => c.id === cardId);
    if (card) return { col, card };
  }
  return null;
}

// ─── Timer actions ────────────────────────────────────────────────────────────

function startTimer(cardId) {
  if (startedAt[cardId]) return;
  startedAt[cardId] = Date.now();
  ensureTick();
  save();
  render();
}

function stopTimer(cardId) {
  if (!startedAt[cardId]) return;
  const found = findCard(cardId);
  const delta = (Date.now() - startedAt[cardId]) / 1000;
  if (found) found.card.elapsed += delta;
  // log to daily summary
  const key = todayKey();
  state.dailyLog = state.dailyLog || {};
  state.dailyLog[key] = (state.dailyLog[key] || 0) + delta;
  delete startedAt[cardId];
  save();
  render();
}

function resetTimer(cardId) {
  const found = findCard(cardId);
  if (!found) return;
  delete startedAt[cardId];
  found.card.elapsed = 0;
  save();
  render();
}

// ─── Board mutations ──────────────────────────────────────────────────────────

function addColumn() {
  const col = { id: uid(), title: 'Nueva Columna', archived: false, cards: [] };
  state.columns.push(col);
  save();
  render();
  const inputs = document.querySelectorAll('.col-title-input');
  inputs[inputs.length - 1]?.select();
}

function archiveColumn(colId) {
  const col = state.columns.find(c => c.id === colId);
  if (col) {
    // stop all running timers in this column before archiving
    col.cards.forEach(c => { if (startedAt[c.id]) stopTimer(c.id); });
    col.archived = true;
  }
  save();
  render();
}

function restoreColumn(colId) {
  const col = state.columns.find(c => c.id === colId);
  if (col) col.archived = false;
  save();
  render();
}

function deleteColumn(colId) {
  if (!confirm('¿Eliminar esta columna permanentemente?')) return;
  const col = state.columns.find(c => c.id === colId);
  if (col) col.cards.forEach(c => delete startedAt[c.id]);
  state.columns = state.columns.filter(c => c.id !== colId);
  save();
  render();
}

function addCard(colId) {
  const col = state.columns.find(c => c.id === colId);
  if (!col) return;
  const card = {
    id: uid(), title: '',
    elapsed: 0, running: false,
    notes: '', collapsed: false, tags: [],
  };
  col.cards.push(card);
  save();
  render();
  // Focus title in the expanded new card
  const inputs = document.querySelectorAll(`[data-col-id="${colId}"] .card-title-input`);
  inputs[inputs.length - 1]?.focus();
}

function deleteCard(cardId) {
  delete startedAt[cardId];
  for (const col of state.columns) {
    const i = col.cards.findIndex(c => c.id === cardId);
    if (i !== -1) { col.cards.splice(i, 1); break; }
  }
  save();
  render();
}

function updateColTitle(colId, val) {
  const col = state.columns.find(c => c.id === colId);
  if (col) col.title = val;
  save();
}

function updateCardTitle(cardId, val) {
  const found = findCard(cardId);
  if (found) found.card.title = val;
  save();
}

function updateNotes(cardId, val) {
  const found = findCard(cardId);
  if (found) found.card.notes = val;
  save();
}

function toggleCardCollapse(cardId) {
  const found = findCard(cardId);
  if (!found) return;
  found.card.collapsed = !found.card.collapsed;
  save();
  render();
}

function toggleTag(cardId, tag) {
  const found = findCard(cardId);
  if (!found) return;
  const tags = found.card.tags || [];
  const idx  = tags.indexOf(tag);
  if (idx === -1) tags.push(tag);
  else tags.splice(idx, 1);
  found.card.tags = tags;
  save();
  render();
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function applyFilters() {
  const q = filterSearch.toLowerCase().trim();
  document.querySelectorAll('.card').forEach(el => {
    const cardId   = el.dataset.cardId;
    const found     = findCard(cardId);
    const cardTitle = (found?.card?.title || '').toLowerCase();
    const cardTags  = found?.card?.tags || [];

    const matchSearch = !q || cardTitle.includes(q);
    const matchTag    = !filterTag || cardTags.includes(filterTag);

    el.classList.toggle('card-hidden', !(matchSearch && matchTag));
  });

  // Show a "no results" message in columns where all cards are hidden
  document.querySelectorAll('.cards-container').forEach(container => {
    const existing = container.querySelector('.no-results');
    const cards    = [...container.querySelectorAll('.card')];
    const allHidden = cards.length > 0 && cards.every(c => c.classList.contains('card-hidden'));
    if (allHidden && !existing) {
      const msg = document.createElement('p');
      msg.className = 'no-results';
      msg.textContent = 'Sin resultados';
      container.appendChild(msg);
    } else if (!allHidden && existing) {
      existing.remove();
    }
  });
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

let drag = null;

function setupDragDrop(board) {
  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.card');
    const col  = e.target.closest('.column');
    if (card) {
      drag = { type: 'card', cardId: card.dataset.cardId, srcColId: card.dataset.colId };
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    } else if (col) {
      drag = { type: 'column', colId: col.dataset.colId };
      col.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  board.addEventListener('dragend', () => {
    document.querySelectorAll('.dragging, .drag-over')
      .forEach(el => el.classList.remove('dragging', 'drag-over'));
    drag = null;
  });

  board.addEventListener('dragover', e => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drag-over')
      .forEach(el => el.classList.remove('drag-over'));
    const overCard = e.target.closest('.card');
    const overCol  = e.target.closest('.column');
    if (drag.type === 'card') {
      if (overCard && overCard.dataset.cardId !== drag.cardId) {
        overCard.classList.add('drag-over');
      } else if (overCol) {
        overCol.querySelector('.cards-container')?.classList.add('drag-over');
      }
    } else if (drag.type === 'column') {
      if (overCol && overCol.dataset.colId !== drag.colId) {
        overCol.classList.add('drag-over');
      }
    }
  });

  board.addEventListener('drop', e => {
    if (!drag) return;
    e.preventDefault();
    const overCard = e.target.closest('.card');
    const overCol  = e.target.closest('.column');

    if (drag.type === 'card') {
      let movedCard = null;
      for (const col of state.columns) {
        const i = col.cards.findIndex(c => c.id === drag.cardId);
        if (i !== -1) { [movedCard] = col.cards.splice(i, 1); break; }
      }
      if (!movedCard) return;
      if (overCard && overCard.dataset.cardId !== drag.cardId) {
        const targetCol = state.columns.find(c => c.id === overCard.dataset.colId);
        if (targetCol) {
          const i = targetCol.cards.findIndex(c => c.id === overCard.dataset.cardId);
          targetCol.cards.splice(i, 0, movedCard);
        } else {
          state.columns[0]?.cards.push(movedCard);
        }
      } else if (overCol) {
        const targetCol = state.columns.find(c => c.id === overCol.dataset.colId);
        if (targetCol) targetCol.cards.push(movedCard);
        else state.columns.find(c => c.id === drag.srcColId)?.cards.push(movedCard);
      } else {
        state.columns.find(c => c.id === drag.srcColId)?.cards.push(movedCard);
      }
    } else if (drag.type === 'column') {
      if (overCol && overCol.dataset.colId !== drag.colId) {
        const srcI = state.columns.findIndex(c => c.id === drag.colId);
        const [movedCol] = state.columns.splice(srcI, 1);
        let dstI = state.columns.findIndex(c => c.id === overCol.dataset.colId);
        const rect = overCol.getBoundingClientRect();
        if (e.clientX > rect.left + rect.width / 2) dstI += 1;
        state.columns.splice(dstI, 0, movedCol);
      }
    }
    drag = null;
    save();
    render();
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

function renderCard(card, colId) {
  const elapsed   = getElapsed(card);
  const running   = !!startedAt[card.id];
  const collapsed = card.collapsed !== false;
  const hasNotes  = (card.notes || '').trim().length > 0;
  const tags      = card.tags || [];

  const activeTags = tags.map(t =>
    `<span class="tag-mini tag-${t}">${t}</span>`
  ).join('');

  const tagPicker = TAGS.map(t => {
    const on = tags.includes(t.id);
    return `<button class="tag-chip tag-${t.id}${on ? ' active' : ''}"
              data-action="toggle-tag" data-tag="${t.id}" data-card-id="${card.id}">${t.label}</button>`;
  }).join('');

  return `
<div class="card${running ? ' running' : ''}" draggable="true"
     data-card-id="${card.id}" data-col-id="${colId}">
  <div class="timer-row">
    <span class="timer-display" data-card-timer="${card.id}">${fmt(elapsed)}</span>
    <div class="card-tags-inline">${activeTags}</div>
    <div class="timer-controls">
      ${running
        ? `<button class="btn-timer btn-stop"  data-action="stop"  data-card-id="${card.id}">⏹</button>`
        : `<button class="btn-timer btn-start" data-action="start" data-card-id="${card.id}">▶</button>`
      }
      <button class="btn-timer btn-reset" data-action="reset" data-card-id="${card.id}"${running ? ' disabled' : ''}>↺</button>
      <button class="btn-timer btn-expand${hasNotes && collapsed ? ' has-notes' : ''}"
              data-action="toggle-collapse" data-card-id="${card.id}"
              title="${collapsed ? 'Expandir' : 'Comprimir'}">${collapsed ? '▾' : '▴'}</button>
      <button class="btn-timer btn-del"
              data-action="delete-card" data-card-id="${card.id}"
              title="Eliminar">✕</button>
    </div>
  </div>
  ${!collapsed ? `
  <input class="card-title-input"
         data-input="card-title" data-card-id="${card.id}"
         value="${escAttr(card.title)}" placeholder="Nombre del timer…" />
  <div class="card-tag-picker">${tagPicker}</div>
  <textarea class="card-notes"
            data-input="notes" data-card-id="${card.id}"
            placeholder="Notas...">${escHtml(card.notes)}</textarea>` : ''}
</div>`;
}

function renderColumn(col) {
  const total = colTotal(col);
  return `
<div class="column" draggable="true" data-col-id="${col.id}">
  <div class="col-header">
    <input class="col-title-input"
           data-input="col-title" data-col-id="${col.id}"
           value="${escAttr(col.title)}" />
    <div class="col-meta">
      <span class="col-total" data-col-total="${col.id}">${fmt(total)}</span>
      <button class="btn-icon archive-btn"
              data-action="archive-col" data-col-id="${col.id}"
              title="Archivar columna">⊡</button>
    </div>
  </div>
  <div class="cards-container" data-col-id="${col.id}">
    ${col.cards.map(c => renderCard(c, col.id)).join('')}
  </div>
  <button class="btn-add-card" data-action="add-card" data-col-id="${col.id}">+ Añadir Timer</button>
</div>`;
}

function renderArchivedSection() {
  const archived = state.columns.filter(c => c.archived);
  if (archived.length === 0) return '';

  const items = archived.map(col => {
    const total = colTotal(col);
    return `
<div class="archived-col-item">
  <span class="archived-col-title" title="${escAttr(col.title)}">${escHtml(col.title)}</span>
  <span class="archived-col-total">${fmt(total)}</span>
  <button class="btn-restore" data-action="restore-col" data-col-id="${col.id}" title="Restaurar">↩</button>
  <button class="btn-icon"    data-action="delete-col"  data-col-id="${col.id}" title="Eliminar">✕</button>
</div>`;
  }).join('');

  return `
<div class="archived-section">
  <button class="btn-archived-toggle" data-action="toggle-archive-section">
    📦 Archivadas (${archived.length}) ${archiveSectionOpen ? '▴' : '▾'}
  </button>
  ${archiveSectionOpen ? `<div class="archived-list">${items}</div>` : ''}
</div>`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const active       = document.activeElement;
  const activeInput  = active?.dataset?.input;
  const activeCardId = active?.dataset?.cardId;
  const activeColId  = active?.dataset?.colId;
  const selStart     = active?.selectionStart;
  const selEnd       = active?.selectionEnd;
  const scrollTop    = active?.scrollTop;

  const board = document.getElementById('board');
  const active_cols = state.columns.filter(c => !c.archived);

  board.innerHTML =
    active_cols.map(renderColumn).join('') +
    `<div class="add-col-btn"><button data-action="add-column">+ Añadir Columna</button></div>` +
    renderArchivedSection();

  // Restore focus
  if (activeInput) {
    let el = null;
    if (activeInput === 'col-title' && activeColId) {
      el = board.querySelector(`[data-input="col-title"][data-col-id="${activeColId}"]`);
    } else if (activeCardId) {
      el = board.querySelector(`[data-input="${activeInput}"][data-card-id="${activeCardId}"]`);
    }
    if (el) {
      el.focus();
      if (selStart !== undefined) {
        try { el.setSelectionRange(selStart, selEnd); } catch { /* noop */ }
      }
      if (scrollTop !== undefined) el.scrollTop = scrollTop;
    }
  }

  board.querySelectorAll('textarea').forEach(autoHeight);
  applyFilters();
}

function autoHeight(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

function init() {
  loadTheme();
  load();

  document.getElementById('theme-toggle')
    .addEventListener('click', toggleTheme);

  // ── Search ────────────────────────────────────────────────
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    filterSearch = searchInput.value;
    searchClear.hidden = !filterSearch;
    applyFilters();
  });

  searchClear.addEventListener('click', () => {
    filterSearch = '';
    searchInput.value = '';
    searchClear.hidden = true;
    searchInput.focus();
    applyFilters();
  });

  // Ctrl+F focuses search
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const active = document.activeElement;
      const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (!inInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      filterSearch = '';
      searchInput.value = '';
      searchClear.hidden = true;
      searchInput.blur();
      applyFilters();
    }
  });

  // ── Tag filters ───────────────────────────────────────────
  document.getElementById('tag-filters').addEventListener('click', e => {
    const btn = e.target.closest('.tag-filter-btn');
    if (!btn) return;
    filterTag = btn.dataset.filterTag;
    document.querySelectorAll('.tag-filter-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.filterTag === filterTag));
    applyFilters();
  });

  // ── Board events ──────────────────────────────────────────
  const board = document.getElementById('board');

  board.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, colId, cardId, tag } = btn.dataset;
    switch (action) {
      case 'add-column':           addColumn();                    break;
      case 'archive-col':          archiveColumn(colId);           break;
      case 'restore-col':          restoreColumn(colId);           break;
      case 'delete-col':           deleteColumn(colId);            break;
      case 'toggle-archive-section':
        archiveSectionOpen = !archiveSectionOpen;
        render();
        break;
      case 'add-card':             addCard(colId);                 break;
      case 'delete-card':          deleteCard(cardId);             break;
      case 'start':                startTimer(cardId);             break;
      case 'stop':                 stopTimer(cardId);              break;
      case 'reset':                resetTimer(cardId);             break;
      case 'toggle-collapse':      toggleCardCollapse(cardId);     break;
      case 'toggle-tag':           toggleTag(cardId, tag);         break;
    }
  });

  board.addEventListener('input', e => {
    const { input, colId, cardId } = e.target.dataset;
    if (input === 'col-title')  updateColTitle(colId, e.target.value);
    if (input === 'card-title') updateCardTitle(cardId, e.target.value);
    if (input === 'notes')      updateNotes(cardId, e.target.value);
    if (e.target.tagName === 'TEXTAREA') autoHeight(e.target);
  });

  board.addEventListener('focus', e => {
    if (e.target.matches('.col-title-input, .card-title-input')) {
      e.target.select();
    }
  }, true);

  window.addEventListener('beforeunload', save);

  setupDragDrop(board);
  render();
  ensureTick();
}

document.addEventListener('DOMContentLoaded', init);
