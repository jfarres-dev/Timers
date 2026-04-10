'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let state = { columns: [] };
const startedAt = {}; // cardId → timestamp (ms) when timer was started

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
    // Re-attach running timers (resume from last save)
    state.columns.forEach(col =>
      col.cards.forEach(card => {
        if (card.running) startedAt[card.id] = Date.now();
        if (card.collapsed == null) card.collapsed = true; // default collapsed for old data
      })
    );
  } catch {
    state = {
      columns: [{ id: uid(), title: 'Mi Proyecto', cards: [] }],
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
  if (found) found.card.elapsed += (Date.now() - startedAt[cardId]) / 1000;
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
  const col = { id: uid(), title: 'Nueva Columna', cards: [] };
  state.columns.push(col);
  save();
  render();
  const inputs = document.querySelectorAll('.col-title-input');
  inputs[inputs.length - 1]?.select();
}

function deleteColumn(colId) {
  if (!confirm('¿Eliminar esta columna y todos sus timers?')) return;
  const col = state.columns.find(c => c.id === colId);
  if (col) col.cards.forEach(c => delete startedAt[c.id]);
  state.columns = state.columns.filter(c => c.id !== colId);
  save();
  render();
}

function addCard(colId) {
  const col = state.columns.find(c => c.id === colId);
  if (!col) return;
  const card = { id: uid(), title: 'Nuevo Timer', elapsed: 0, running: false, notes: '', collapsed: true };
  col.cards.push(card);
  save();
  render();
  const inputs = document.querySelectorAll(`[data-col-id="${colId}"] .card-title-input`);
  inputs[inputs.length - 1]?.select();
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

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

let drag = null; // { type: 'card'|'column', cardId?, srcColId?, colId? }

function setupDragDrop(board) {
  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.card');
    const col  = e.target.closest('.column');

    if (card) {
      // Card drag takes priority over column drag
      drag = { type: 'card', cardId: card.dataset.cardId, srcColId: card.dataset.colId };
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation(); // prevent column dragstart from firing
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
      // Remove card from its current column
      let movedCard = null;
      for (const col of state.columns) {
        const i = col.cards.findIndex(c => c.id === drag.cardId);
        if (i !== -1) { [movedCard] = col.cards.splice(i, 1); break; }
      }
      if (!movedCard) return;

      if (overCard && overCard.dataset.cardId !== drag.cardId) {
        // Insert before the card we dropped onto
        const targetCol = state.columns.find(c => c.id === overCard.dataset.colId);
        if (targetCol) {
          const i = targetCol.cards.findIndex(c => c.id === overCard.dataset.cardId);
          targetCol.cards.splice(i, 0, movedCard);
        } else {
          state.columns[0]?.cards.push(movedCard);
        }
      } else if (overCol) {
        // Append to end of target column
        const targetCol = state.columns.find(c => c.id === overCol.dataset.colId);
        if (targetCol) targetCol.cards.push(movedCard);
        else state.columns.find(c => c.id === drag.srcColId)?.cards.push(movedCard);
      } else {
        // Dropped outside any column — return to source
        state.columns.find(c => c.id === drag.srcColId)?.cards.push(movedCard);
      }

    } else if (drag.type === 'column') {
      if (overCol && overCol.dataset.colId !== drag.colId) {
        const srcI = state.columns.findIndex(c => c.id === drag.colId);
        const [movedCol] = state.columns.splice(srcI, 1);
        let dstI = state.columns.findIndex(c => c.id === overCol.dataset.colId);
        // Insert before or after based on cursor horizontal position
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
  const elapsed  = getElapsed(card);
  const running  = !!startedAt[card.id];
  const collapsed = card.collapsed !== false; // default true
  const hasNotes  = (card.notes || '').trim().length > 0;
  return `
<div class="card${running ? ' running' : ''}" draggable="true"
     data-card-id="${card.id}" data-col-id="${colId}">
  <div class="card-header">
    <input class="card-title-input"
           data-input="card-title" data-card-id="${card.id}"
           value="${escAttr(card.title)}" />
    <button class="btn-collapse${hasNotes && collapsed ? ' has-notes' : ''}"
            data-action="toggle-collapse" data-card-id="${card.id}"
            title="${collapsed ? 'Expandir notas' : 'Comprimir'}">${collapsed ? '▾' : '▴'}</button>
    <button class="btn-icon"
            data-action="delete-card" data-card-id="${card.id}"
            title="Eliminar timer">✕</button>
  </div>
  <div class="timer-row">
    <span class="timer-display" data-card-timer="${card.id}">${fmt(elapsed)}</span>
    <div class="timer-controls">
      ${running
        ? `<button class="btn-timer btn-stop"  data-action="stop"  data-card-id="${card.id}">⏹</button>`
        : `<button class="btn-timer btn-start" data-action="start" data-card-id="${card.id}">▶</button>`
      }
      <button class="btn-timer btn-reset" data-action="reset" data-card-id="${card.id}"${running ? ' disabled' : ''}>↺</button>
    </div>
  </div>
  ${!collapsed ? `<textarea class="card-notes"
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
      <button class="btn-icon"
              data-action="delete-col" data-col-id="${col.id}"
              title="Eliminar columna">✕</button>
    </div>
  </div>
  <div class="cards-container" data-col-id="${col.id}">
    ${col.cards.map(c => renderCard(c, col.id)).join('')}
  </div>
  <button class="btn-add-card" data-action="add-card" data-col-id="${col.id}">+ Añadir Timer</button>
</div>`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  // Preserve focus so typing in inputs/textareas doesn't lose cursor position
  const active     = document.activeElement;
  const activeInput   = active?.dataset?.input;
  const activeCardId  = active?.dataset?.cardId;
  const activeColId   = active?.dataset?.colId;
  const selStart   = active?.selectionStart;
  const selEnd     = active?.selectionEnd;
  const scrollTop  = active?.scrollTop;

  const board = document.getElementById('board');
  board.innerHTML =
    state.columns.map(renderColumn).join('') +
    `<div class="add-col-btn"><button data-action="add-column">+ Añadir Columna</button></div>`;

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
        try { el.setSelectionRange(selStart, selEnd); } catch { /* input type may not support it */ }
      }
      if (scrollTop !== undefined) el.scrollTop = scrollTop;
    }
  }

  // Auto-height all textareas
  board.querySelectorAll('textarea').forEach(autoHeight);
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

  const board = document.getElementById('board');

  // Click delegation
  board.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, colId, cardId } = btn.dataset;
    switch (action) {
      case 'add-column':  addColumn();          break;
      case 'delete-col':  deleteColumn(colId);  break;
      case 'add-card':    addCard(colId);        break;
      case 'delete-card':      deleteCard(cardId);          break;
      case 'start':            startTimer(cardId);          break;
      case 'stop':             stopTimer(cardId);           break;
      case 'reset':            resetTimer(cardId);          break;
      case 'toggle-collapse':  toggleCardCollapse(cardId);  break;
    }
  });

  // Input delegation — update state without re-rendering
  board.addEventListener('input', e => {
    const { input, colId, cardId } = e.target.dataset;
    if (input === 'col-title')  updateColTitle(colId, e.target.value);
    if (input === 'card-title') updateCardTitle(cardId, e.target.value);
    if (input === 'notes')      updateNotes(cardId, e.target.value);
    if (e.target.tagName === 'TEXTAREA') autoHeight(e.target);
  });

  // Select all text when focusing title inputs (easier to rename)
  board.addEventListener('focus', e => {
    if (e.target.matches('.col-title-input, .card-title-input')) {
      e.target.select();
    }
  }, true);

  // Persist on page close/refresh
  window.addEventListener('beforeunload', save);

  setupDragDrop(board);
  render();
  ensureTick();
}

document.addEventListener('DOMContentLoaded', init);
