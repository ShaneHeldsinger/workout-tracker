/* ===== STORAGE ===== */
const uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);
const loadWorkouts = () => JSON.parse(localStorage.getItem('lift-workouts') || '[]');
const saveWorkouts = (w) => localStorage.setItem('lift-workouts', JSON.stringify(w));
const loadHistory = () => JSON.parse(localStorage.getItem('lift-history') || '[]');
const saveHistory = (h) => localStorage.setItem('lift-history', JSON.stringify(h));

let workouts = loadWorkouts();
let session = null;
let restInterval = null;
let timerInterval = null;
let drawerOpen = false;

/* ===== DOM ===== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const dom = {
  workoutList: $('#workout-list'), emptyWorkouts: $('#empty-workouts'),
  historyList: $('#history-list'), emptyHistory: $('#empty-history'),
  editor: $('#editor'), editorTitle: $('#editor-title'),
  inpName: $('#inp-name'), exList: $('#ex-list'),
  session: $('#session'), sessionDone: $('#session-done'),
  sessionTimer: $('#session-timer'),
  exBadge: $('#ex-badge'), exName: $('#ex-name'),
  exDots: $('#ex-dots'), exInfo: $('#ex-info'),
  btnWeightEditToggle: $('#btn-weight-edit-toggle'), sessionWeightEditor: $('#session-weight-editor'),
  sessionWeightModes: $('#session-weight-modes'), sessionWeightControls: $('#session-weight-controls'),
  viewExercise: $('#view-exercise'), viewRest: $('#view-rest'),
  ringFg: $('#ring-fg'), restCountdown: $('#rest-countdown'), restNext: $('#rest-next'),
  restLabel: $('#rest-label'),
  drawerList: $('#drawer-list'),
  doneTime: $('#done-time'), doneSummary: $('#done-summary'),
  confirm: $('#confirm'), confirmMsg: $('#confirm-msg'),
  nav: $('#nav'),
};

let sessionWeightEditorOpen = false;

function normalizeExercise(ex) {
  const next = { ...defaultExercise(), ...ex };
  if (next.type === 'warmup' || next.type === 'cooldown' || next.type === 'regular') next.type = 'exercise';
  if (next.type !== 'exercise' && next.type !== 'timer') next.type = 'exercise';
  if (next.type === 'timer') {
    next.sets = 1;
    next.reps = 1;
    next.rest = 0;
    next.weightMode = 'none';
    next.weight = 0;
    next.weights = [];
    next.duration = Math.max(5, Number(next.duration || 60));
    if (!next.name?.trim()) next.name = 'Timer';
  } else {
    next.duration = Math.max(5, Number(next.duration || 60));
  }
  return next;
}

/* ===== NAV ===== */
let currentPage = 'workouts';
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    if (page === currentPage) return;
    currentPage = page;
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
    $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    if (page === 'history') renderHistory();
  });
});

/* ===== WORKOUT LIST (combined Start + Edit + Delete) ===== */
function renderWorkoutList() {
  workouts = loadWorkouts();
  workouts.forEach(w => { w.exercises = (w.exercises || []).map(normalizeExercise); });
  saveWorkouts(workouts);
  dom.emptyWorkouts.classList.toggle('hidden', workouts.length > 0);
  dom.workoutList.innerHTML = workouts.map(w => {
    const exCount = w.exercises.length;
    return `
    <div class="w-card" data-id="${w.id}">
      <div class="w-card-top">
        <h3>${esc(w.name)}</h3>
        <button class="btn-icon del" data-del="${w.id}" aria-label="Delete">
          <svg width="18" height="18" viewBox="-1 -1 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
      <p class="w-card-meta">${exCount} item${exCount !== 1 ? 's' : ''}</p>
      <button class="btn-start" data-id="${w.id}">Start Workout</button>
    </div>`;
  }).join('');

  // Tap card (not buttons) to edit
  dom.workoutList.querySelectorAll('.w-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-start') || e.target.closest('.btn-icon')) return;
      openEditor(workouts.find(w => w.id === card.dataset.id));
    });
  });
  // Start buttons
  dom.workoutList.querySelectorAll('.btn-start').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); startSession(btn.dataset.id); });
  });
  // Delete buttons
  dom.workoutList.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmAction('Are you sure you want to delete this workout?', () => {
        workouts = workouts.filter(w => w.id !== btn.dataset.del);
        saveWorkouts(workouts);

        renderWorkoutList();

      });
    });
  });
}

/* ===== EDITOR ===== */
let editingId = null;
let editorExercises = [];

function defaultExercise() {
  return { id: uid(), name: '', type: 'exercise', sets: 3, reps: 10, rest: 60, duration: 60, weightMode: 'none', weight: 0, weights: [] };
}

function defaultTimer() {
  return { ...defaultExercise(), name: 'Timer', type: 'timer', sets: 1, reps: 1, rest: 0, duration: 60, weightMode: 'none', weight: 0, weights: [] };
}

function openEditor(workout) {
  editingId = workout ? workout.id : null;
  dom.editorTitle.textContent = workout ? 'Edit Workout' : 'New Workout';
  dom.inpName.value = workout ? workout.name : '';
  editorExercises = workout
    ? workout.exercises.map(normalizeExercise)
    : [];
  renderEditorExercises();
  dom.editor.classList.remove('hidden');
  requestAnimationFrame(() => dom.editor.classList.add('visible'));
}

function closeEditor() {
  dom.editor.classList.remove('visible');
  setTimeout(() => dom.editor.classList.add('hidden'), 350);
}

function renderEditorExercises() {
  dom.exList.innerHTML = editorExercises.map((ex, i) => {
    const isTimer = ex.type === 'timer';
    // Ensure weights array matches sets count
    while (ex.weights.length < ex.sets) ex.weights.push(ex.weight || 0);
    if (ex.weights.length > ex.sets) ex.weights.length = ex.sets;

    let weightHTML = '';
    if (ex.weightMode === 'uniform') {
      weightHTML = `<div class="weight-uniform">
        <div class="stepper"><button data-wstep="${i}" data-dir="-2.5">−</button><span>${ex.weight}kg</span><button data-wstep="${i}" data-dir="2.5">+</button></div>
      </div>`;
    } else if (ex.weightMode === 'perSet') {
      weightHTML = `<div class="weight-perset">${ex.weights.map((w, si) => `
        <div class="weight-set-row">
          <span class="set-label">Set ${si+1}</span>
          <div class="stepper"><button data-wsetstep="${i}" data-si="${si}" data-dir="-2.5">−</button><span>${w}kg</span><button data-wsetstep="${i}" data-si="${si}" data-dir="2.5">+</button></div>
        </div>`).join('')}
      </div>`;
    }

    return `
    <div class="ex-card" data-idx="${i}" draggable="false">
      <div class="ex-card-top">
        <div class="grip" data-grip="${i}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/></svg>
        </div>
        <input type="text" value="${esc(ex.name)}" placeholder="Exercise name" data-field="name" data-idx="${i}">
        <button class="btn-icon del" data-rm="${i}" aria-label="Remove">×</button>
      </div>
      <div class="type-row">
        <button class="type-btn ${ex.type==='exercise'?'active':''}" data-idx="${i}" data-type="exercise">Exercise</button>
        <button class="type-btn ${ex.type==='timer'?'active':''}" data-idx="${i}" data-type="timer">Timer</button>
      </div>
      ${isTimer ? `
      <div class="num-row">
        <div class="num-group"><label>Timer duration</label>
          <div class="stepper"><button data-step="duration" data-idx="${i}" data-dir="-5">−</button><span>${ex.duration}s</span><button data-step="duration" data-idx="${i}" data-dir="5">+</button></div>
        </div>
      </div>
      ` : `
      <div class="num-row">
        <div class="num-group"><label>Sets</label>
          <div class="stepper"><button data-step="sets" data-idx="${i}" data-dir="-1">−</button><span>${ex.sets}</span><button data-step="sets" data-idx="${i}" data-dir="1">+</button></div>
        </div>
        <div class="num-group"><label>Reps</label>
          <div class="stepper"><button data-step="reps" data-idx="${i}" data-dir="-1">−</button><span>${ex.reps}</span><button data-step="reps" data-idx="${i}" data-dir="1">+</button></div>
        </div>
      </div>
      <div class="rest-row"><label>Rest between sets</label>
        <div class="rest-presets">
          <button class="rest-btn ${ex.rest===30?'active':''}" data-idx="${i}" data-rest="30">30s</button>
          <button class="rest-btn ${ex.rest===60?'active':''}" data-idx="${i}" data-rest="60">60s</button>
          <button class="rest-btn ${ex.rest===90?'active':''}" data-idx="${i}" data-rest="90">90s</button>
          <button class="rest-btn ${ex.rest===120?'active':''}" data-idx="${i}" data-rest="120">2m</button>
        </div>
        <div class="rest-custom"><div class="stepper"><button data-reststep="${i}" data-dir="-5">−</button><span>${ex.rest}s</span><button data-reststep="${i}" data-dir="5">+</button></div></div>
      </div>
      <div class="weight-section"><label>Weight</label>
        <div class="weight-mode-row type-row">
          <button class="type-btn ${ex.weightMode==='none'?'active':''}" data-idx="${i}" data-wmode="none">None</button>
          <button class="type-btn ${ex.weightMode==='uniform'?'active':''}" data-idx="${i}" data-wmode="uniform">Same</button>
          <button class="type-btn ${ex.weightMode==='perSet'?'active':''}" data-idx="${i}" data-wmode="perSet">Per Set</button>
        </div>
        ${weightHTML}
      </div>
      `}
    </div>`;
  }).join('');

  bindEditorEvents();
}

function bindEditorEvents() {
  const el = dom.exList;
  el.querySelectorAll('input[data-field="name"]').forEach(inp => {
    inp.addEventListener('input', () => { editorExercises[+inp.dataset.idx].name = inp.value; });
  });
  el.querySelectorAll('[data-rm]').forEach(btn => {
    btn.addEventListener('click', () => { editorExercises.splice(+btn.dataset.rm, 1); renderEditorExercises(); });
  });
  el.querySelectorAll('.type-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = editorExercises[+btn.dataset.idx];
      ex.type = btn.dataset.type;
      if (ex.type === 'timer') {
        ex.sets = 1;
        ex.reps = 1;
        ex.rest = 0;
        ex.weightMode = 'none';
        ex.weight = 0;
        ex.weights = [];
        ex.duration = Math.max(5, Number(ex.duration || 60));
        if (!ex.name.trim()) ex.name = 'Timer';
      }
      renderEditorExercises();
    });
  });
  el.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = editorExercises[+btn.dataset.idx];
      const field = btn.dataset.step;
      const min = field === 'duration' ? 5 : 1;
      ex[field] = Math.max(min, ex[field] + (+btn.dataset.dir));
      renderEditorExercises();
    });
  });
  el.querySelectorAll('.rest-btn').forEach(btn => {
    btn.addEventListener('click', () => { editorExercises[+btn.dataset.idx].rest = +btn.dataset.rest; renderEditorExercises(); });
  });
  el.querySelectorAll('[data-reststep]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = editorExercises[+btn.dataset.reststep];
      ex.rest = Math.max(5, ex.rest + (+btn.dataset.dir));
      renderEditorExercises();
    });
  });
  // Weight mode
  el.querySelectorAll('[data-wmode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = editorExercises[+btn.dataset.idx];
      ex.weightMode = btn.dataset.wmode;
      if (ex.weightMode === 'perSet' && ex.weights.length === 0) {
        ex.weights = Array(ex.sets).fill(ex.weight || 0);
      }
      renderEditorExercises();
    });
  });
  // Uniform weight stepper
  el.querySelectorAll('[data-wstep]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = editorExercises[+btn.dataset.wstep];
      ex.weight = Math.max(0, ex.weight + parseFloat(btn.dataset.dir));
      renderEditorExercises();
    });
  });
  // Per-set weight stepper
  el.querySelectorAll('[data-wsetstep]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = editorExercises[+btn.dataset.wsetstep];
      const si = +btn.dataset.si;
      ex.weights[si] = Math.max(0, ex.weights[si] + parseFloat(btn.dataset.dir));
      renderEditorExercises();
    });
  });
  // Drag reorder
  setupDragReorder();
}

/* ===== DRAG REORDER ===== */
let drag = null;

function setupDragReorder() {
  dom.exList.querySelectorAll('.grip').forEach(grip => {
    grip.addEventListener('touchstart', (e) => {
      e.preventDefault();
      initDrag(+grip.dataset.grip, e.touches[0].clientY);
    }, { passive: false });
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      initDrag(+grip.dataset.grip, e.clientY);
    });
  });
}

function initDrag(idx, clientY) {
  const card = dom.exList.querySelectorAll('.ex-card')[idx];
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const scrollParent = dom.exList.closest('.overlay-body');

  // Compact floating ghost — just the exercise name
  const name = editorExercises[idx].name || 'Untitled';
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = name;
  ghost.style.width = (rect.width * 0.7) + 'px';
  ghost.style.left = (rect.left + rect.width * 0.15) + 'px';
  ghost.style.top = (clientY - 22) + 'px';
  document.body.appendChild(ghost);
  requestAnimationFrame(() => ghost.classList.add('popped'));

  // Drop indicator line
  const indicator = document.createElement('div');
  indicator.className = 'drag-indicator';
  dom.exList.appendChild(indicator);

  // Instantly hide original — others fill the gap
  card.classList.add('drag-collapsed');

  drag = { idx, card, ghost, indicator, scrollParent, offsetY: 22, dropIdx: idx };

  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchend', onDragEnd);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e) {
  if (!drag) return;
  e.preventDefault();
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  // Move ghost to follow finger/mouse
  drag.ghost.style.top = (clientY - drag.offsetY) + 'px';

  // Auto-scroll near edges
  if (drag.scrollParent) {
    const sr = drag.scrollParent.getBoundingClientRect();
    if (clientY < sr.top + 50) drag.scrollParent.scrollTop -= 6;
    if (clientY > sr.bottom - 50) drag.scrollParent.scrollTop += 6;
  }

  // Determine drop index based on midpoints of visible (non-collapsed) cards
  const cards = [...dom.exList.querySelectorAll('.ex-card')];
  let dropIdx = cards.length; // default: end

  for (let i = 0; i < cards.length; i++) {
    if (i === drag.idx) continue; // skip collapsed card
    const r = cards[i].getBoundingClientRect();
    const midY = r.top + r.height / 2;
    if (clientY < midY) {
      dropIdx = i;
      break;
    }
  }
  drag.dropIdx = dropIdx;

  // Position indicator line
  const listRect = dom.exList.getBoundingClientRect();
  const scrollTop = dom.exList.scrollTop || 0;

  // Find the card at the drop position to place the line above it
  let lineY;
  if (dropIdx <= 0) {
    // Above first card
    const first = cards.find((c, i) => i !== drag.idx);
    if (first) {
      const r = first.getBoundingClientRect();
      lineY = r.top - listRect.top + scrollTop - 5;
    }
  } else if (dropIdx >= cards.length) {
    // Below last card
    const last = cards[cards.length - 1 === drag.idx ? cards.length - 2 : cards.length - 1];
    if (last) {
      const r = last.getBoundingClientRect();
      lineY = r.bottom - listRect.top + scrollTop + 5;
    }
  } else {
    const target = cards[dropIdx];
    if (target) {
      const r = target.getBoundingClientRect();
      lineY = r.top - listRect.top + scrollTop - 5;
    }
  }

  if (lineY !== undefined) {
    drag.indicator.style.display = 'block';
    drag.indicator.style.top = lineY + 'px';
  } else {
    drag.indicator.style.display = 'none';
  }
}

function onDragEnd() {
  if (!drag) return;
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);
  document.removeEventListener('mouseup', onDragEnd);

  // Clean up ghost + indicator
  drag.ghost.remove();
  drag.indicator.remove();

  let { idx, dropIdx } = drag;
  drag.card.classList.remove('drag-collapsed');

  // Adjust: if dropping after original position, account for the removed item
  if (dropIdx > idx) dropIdx--;
  dropIdx = Math.max(0, Math.min(dropIdx, editorExercises.length - 1));

  if (dropIdx !== idx) {
    const [moved] = editorExercises.splice(idx, 1);
    editorExercises.splice(dropIdx, 0, moved);
    // Re-render, then animate the inserted card
    renderEditorExercises();
    const newCard = dom.exList.querySelectorAll('.ex-card')[dropIdx];
    if (newCard) {
      newCard.classList.add('just-inserted');
      newCard.addEventListener('animationend', () => newCard.classList.remove('just-inserted'), { once: true });
    }
  }
  drag = null;
}

$('#btn-add-ex').addEventListener('click', () => {
  editorExercises.push(defaultExercise());
  renderEditorExercises();
  dom.exList.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
});

$('#btn-add-timer').addEventListener('click', () => {
  editorExercises.push(defaultTimer());
  renderEditorExercises();
  dom.exList.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
});

$('#btn-save').addEventListener('click', () => {
  const name = dom.inpName.value.trim();
  if (!name) { dom.inpName.focus(); dom.inpName.classList.add('shake'); setTimeout(() => dom.inpName.classList.remove('shake'), 400); return; }
  if (editorExercises.length === 0) { $('#btn-add-ex').classList.add('shake'); setTimeout(() => $('#btn-add-ex').classList.remove('shake'), 400); return; }
  editorExercises = editorExercises.map(normalizeExercise);
  editorExercises.forEach(e => { if (!e.name.trim()) e.name = e.type === 'timer' ? 'Timer' : 'Untitled'; });

  if (editingId) {
    const idx = workouts.findIndex(w => w.id === editingId);
    if (idx >= 0) workouts[idx] = { ...workouts[idx], name, exercises: editorExercises };
  } else {
    workouts.push({ id: uid(), name, exercises: editorExercises, createdAt: Date.now() });
  }
  saveWorkouts(workouts);

  closeEditor();
  renderWorkoutList();

});

$('#btn-cancel').addEventListener('click', closeEditor);
$('#btn-new').addEventListener('click', () => openEditor(null));

/* ===== ACTIVE SESSION ===== */
function startSession(workoutId) {
  const w = workouts.find(w => w.id === workoutId);
  if (!w || w.exercises.length === 0) return;

  session = {
    workout: w,
    startTime: Date.now(),
    exercises: w.exercises.map(e => ({
      ...normalizeExercise(e),
      completedSets: 0, done: false,
    })),
    currentIdx: 0, resting: false, restEnd: 0, restDuration: 0, restContext: null,
  };
  sessionWeightEditorOpen = false;

  dom.nav.classList.add('hidden');
  dom.session.classList.remove('hidden');
  requestAnimationFrame(() => dom.session.classList.add('visible'));
  drawerOpen = false;
  dom.drawerList.classList.add('collapsed');
  dom.drawerList.classList.remove('expanded');
  $('#btn-toggle-drawer').classList.remove('open');

  startTimer();
  renderSession();
}

function closeSession() {
  clearInterval(timerInterval);
  clearInterval(restInterval);
  dom.session.classList.remove('visible');
  setTimeout(() => dom.session.classList.add('hidden'), 350);
  dom.nav.classList.remove('hidden');
  session = null;
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!session) return;
    dom.sessionTimer.textContent = fmtTime(Date.now() - session.startTime);
  }, 500);
}

function getWeightForSet(ex, setIdx) {
  if (ex.weightMode === 'uniform') return ex.weight;
  if (ex.weightMode === 'perSet') return ex.weights?.[setIdx] ?? 0;
  return 0;
}

function roundWeight(value) {
  return Math.round(value * 100) / 100;
}

function formatWeight(value) {
  const n = roundWeight(Number(value) || 0);
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/, '');
}

function ensurePerSetWeights(ex) {
  if (!Array.isArray(ex.weights)) ex.weights = [];
  while (ex.weights.length < ex.sets) ex.weights.push(ex.weight || 0);
  if (ex.weights.length > ex.sets) ex.weights.length = ex.sets;
}

function persistCurrentSessionExercise() {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  if (!ex) return;

  const workoutIdx = workouts.findIndex(w => w.id === session.workout.id);
  if (workoutIdx < 0) return;
  const savedWorkout = workouts[workoutIdx];
  const exerciseIdx = savedWorkout.exercises.findIndex(e => e.id === ex.id);
  if (exerciseIdx < 0) return;

  const nextExercise = normalizeExercise({
    id: ex.id,
    name: ex.name,
    type: ex.type,
    sets: ex.sets,
    reps: ex.reps,
    rest: ex.rest,
    duration: ex.duration,
    weightMode: ex.weightMode,
    weight: ex.weight,
    weights: [...(ex.weights || [])],
  });
  savedWorkout.exercises[exerciseIdx] = nextExercise;
  session.workout.exercises[exerciseIdx] = { ...nextExercise, weights: [...(nextExercise.weights || [])] };
  session.exercises[session.currentIdx] = { ...session.exercises[session.currentIdx], ...nextExercise, completedSets: ex.completedSets, done: ex.done };
  saveWorkouts(workouts);
}

function setSessionWeightMode(mode) {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  if (!ex || ex.type === 'timer') return;
  if (mode === ex.weightMode) return;
  const currentSetIdx = Math.max(0, Math.min(ex.completedSets, ex.sets - 1));

  if (mode === 'perSet') {
    let base = ex.weight || 0;
    if (ex.weightMode === 'uniform') base = ex.weight;
    else if (Array.isArray(ex.weights) && ex.weights.length > 0) {
      base = ex.weights[Math.min(currentSetIdx, ex.weights.length - 1)] ?? ex.weight ?? 0;
    }
    ex.weights = Array(Math.max(1, ex.sets)).fill(roundWeight(Math.max(0, Number(base) || 0)));
  } else if (mode === 'uniform') {
    let nextWeight = ex.weight || 0;
    if (ex.weightMode === 'perSet') {
      ensurePerSetWeights(ex);
      nextWeight = ex.weights[currentSetIdx] ?? ex.weight ?? 0;
    } else if ((!nextWeight || nextWeight <= 0) && Array.isArray(ex.weights) && ex.weights.length > 0) {
      nextWeight = ex.weights[Math.min(currentSetIdx, ex.weights.length - 1)] ?? 0;
    }
    ex.weight = roundWeight(Math.max(0, Number(nextWeight) || 0));
  }

  ex.weightMode = mode;
  persistCurrentSessionExercise();
  renderSession();
}

function adjustSessionUniformWeight(delta) {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  if (!ex || ex.type === 'timer') return;
  ex.weight = roundWeight(Math.max(0, (Number(ex.weight) || 0) + delta));
  persistCurrentSessionExercise();
  renderSession();
}

function adjustSessionPerSetWeight(setIdx, delta) {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  if (!ex || ex.type === 'timer') return;
  ensurePerSetWeights(ex);
  ex.weights[setIdx] = roundWeight(Math.max(0, (Number(ex.weights[setIdx]) || 0) + delta));
  persistCurrentSessionExercise();
  renderSession();
}

function renderSessionWeightEditor(ex, isTimer) {
  if (isTimer) {
    dom.btnWeightEditToggle.classList.add('hidden');
    dom.sessionWeightEditor.classList.add('hidden');
    dom.sessionWeightModes.innerHTML = '';
    dom.sessionWeightControls.innerHTML = '';
    return;
  }

  dom.btnWeightEditToggle.classList.remove('hidden');
  dom.btnWeightEditToggle.textContent = sessionWeightEditorOpen ? 'Hide Weight' : 'Edit Weight';
  dom.sessionWeightEditor.classList.toggle('hidden', !sessionWeightEditorOpen);
  if (!sessionWeightEditorOpen) {
    dom.sessionWeightModes.innerHTML = '';
    dom.sessionWeightControls.innerHTML = '';
    return;
  }

  ensurePerSetWeights(ex);
  dom.sessionWeightModes.innerHTML = `
    <button class="type-btn ${ex.weightMode === 'none' ? 'active' : ''}" data-session-wmode="none">None</button>
    <button class="type-btn ${ex.weightMode === 'uniform' ? 'active' : ''}" data-session-wmode="uniform">Same</button>
    <button class="type-btn ${ex.weightMode === 'perSet' ? 'active' : ''}" data-session-wmode="perSet">Per Set</button>
  `;

  if (ex.weightMode === 'uniform') {
    dom.sessionWeightControls.innerHTML = `
      <div class="weight-uniform">
        <div class="stepper"><button data-session-wstep data-dir="-2.5">−</button><span>${formatWeight(ex.weight)}kg</span><button data-session-wstep data-dir="2.5">+</button></div>
      </div>
    `;
  } else if (ex.weightMode === 'perSet') {
    const currentSetIdx = Math.max(0, Math.min(ex.completedSets, ex.sets - 1));
    const currentWeight = ex.weights[currentSetIdx] ?? 0;
    dom.sessionWeightControls.innerHTML = `
      <div class="weight-perset">
        <div class="weight-set-row">
          <span class="set-label">Set ${currentSetIdx + 1}</span>
          <div class="stepper"><button data-session-wsetstep data-si="${currentSetIdx}" data-dir="-2.5">−</button><span>${formatWeight(currentWeight)}kg</span><button data-session-wsetstep data-si="${currentSetIdx}" data-dir="2.5">+</button></div>
        </div>
      </div>
    `;
  } else {
    dom.sessionWeightControls.innerHTML = '<p class="dim session-weight-note">Weight tracking off</p>';
  }

  dom.sessionWeightModes.querySelectorAll('[data-session-wmode]').forEach(btn => {
    btn.addEventListener('click', () => setSessionWeightMode(btn.dataset.sessionWmode));
  });
  dom.sessionWeightControls.querySelectorAll('[data-session-wstep]').forEach(btn => {
    btn.addEventListener('click', () => adjustSessionUniformWeight(parseFloat(btn.dataset.dir)));
  });
  dom.sessionWeightControls.querySelectorAll('[data-session-wsetstep]').forEach(btn => {
    btn.addEventListener('click', () => adjustSessionPerSetWeight(+btn.dataset.si, parseFloat(btn.dataset.dir)));
  });
}

function renderSession() {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  const isTimer = ex.type === 'timer';

  if (isTimer) {
    dom.exBadge.textContent = 'Timer';
    dom.exBadge.className = 'badge timer';
    dom.exBadge.classList.remove('hidden');
  } else {
    dom.exBadge.classList.add('hidden');
  }

  dom.exName.textContent = ex.name;

  // Info line with weight
  if (isTimer) {
    dom.exInfo.textContent = `${ex.duration}s timer`;
  } else {
    const currentSetIdx = Math.min(ex.completedSets, ex.sets - 1);
    const w = getWeightForSet(ex, currentSetIdx);
    dom.exInfo.textContent = w > 0 ? `${ex.reps} reps @ ${formatWeight(w)}kg` : `${ex.reps} reps per set`;
  }

  // dots
  dom.exDots.innerHTML = '';
  for (let i = 0; i < ex.sets; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < ex.completedSets) dot.classList.add('done');
    else if (i === ex.completedSets && !ex.done) dot.classList.add('current');
    else if (ex.done) dot.classList.add('done');
    dom.exDots.appendChild(dot);
  }

  dom.viewExercise.classList.remove('hidden');
  dom.viewRest.classList.add('hidden');
  renderSessionWeightEditor(ex, isTimer);

  const btn = $('#btn-done-set');
  if (ex.done) {
    btn.textContent = `${isTimer ? 'Timer' : 'Exercise'} Complete ✓`;
    btn.classList.add('resting');
    btn.disabled = true;
  } else if (isTimer) {
    btn.textContent = 'Start Timer';
    btn.classList.remove('resting');
    btn.disabled = false;
  } else {
    btn.textContent = `Complete Set ${ex.completedSets + 1}/${ex.sets}`;
    btn.classList.remove('resting');
    btn.disabled = false;
  }
  renderDrawer();
}

function renderDrawer() {
  dom.drawerList.innerHTML = session.exercises.map((ex, i) => {
    const progress = ex.type === 'timer'
      ? (ex.done ? 'Done' : `${ex.duration}s`)
      : `${ex.completedSets}/${ex.sets}`;
    return `
    <div class="d-item ${i === session.currentIdx ? 'current' : ''} ${ex.done ? 'done' : ''}" data-didx="${i}">
      <div class="d-check">${ex.done ? '✓' : i === session.currentIdx ? '▸' : ''}</div>
      <div class="d-label">${esc(ex.name)}</div>
      <div class="d-progress">${progress}</div>
    </div>
  `;
  }).join('');
  dom.drawerList.querySelectorAll('.d-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = +item.dataset.didx;
      if (idx === session.currentIdx) return;
      stopRest();
      session.currentIdx = idx;
      renderSession();
    });
  });
}

/* ===== UNDO ===== */
let undoState = null;
let undoTimeout = null;

function showUndo(startTimer = true) {
  const btn = $('#btn-undo');
  btn.classList.remove('hidden', 'show');
  void btn.offsetWidth;
  btn.classList.add('show');
  clearTimeout(undoTimeout);
  if (startTimer) {
    undoTimeout = setTimeout(() => { btn.classList.add('hidden'); btn.classList.remove('show'); undoState = null; }, 8000);
  }
}

function hideUndo() {
  clearTimeout(undoTimeout);
  $('#btn-undo').classList.add('hidden');
  $('#btn-undo').classList.remove('show');
  undoState = null;
}

$('#btn-undo').addEventListener('click', () => {
  if (!undoState || !session) return;
  const { exerciseIdx, prevCompletedSets, prevDone, prevSessionIdx } = undoState;
  session.exercises[exerciseIdx].completedSets = prevCompletedSets;
  session.exercises[exerciseIdx].done = prevDone;
  session.currentIdx = prevSessionIdx;
  stopRest();
  hideUndo();
  renderSession();
});

/* ===== COMPLETE SET ===== */
$('#btn-done-set').addEventListener('click', () => {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  if (ex.done) return;

  if (ex.type === 'timer') {
    startRest(ex.duration, { mode: 'timer', autoComplete: true });
    return;
  }

  undoState = { exerciseIdx: session.currentIdx, prevCompletedSets: ex.completedSets, prevDone: ex.done, prevSessionIdx: session.currentIdx };
  ex.completedSets++;
  if (navigator.vibrate) navigator.vibrate(30);

  if (ex.completedSets >= ex.sets) {
    ex.done = true;
    if (session.exercises.every(e => e.done)) { finishSession(); return; }
    const nextIdx = session.exercises.findIndex((e, i) => i > session.currentIdx && !e.done);
    session.currentIdx = nextIdx >= 0 ? nextIdx : session.exercises.findIndex(e => !e.done);
    renderSession();
    showUndo();
  } else {
    startRest(ex.rest);
    showUndo(false);
  }
});

dom.btnWeightEditToggle.addEventListener('click', () => {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  if (!ex || ex.type === 'timer') return;
  sessionWeightEditorOpen = !sessionWeightEditorOpen;
  renderSession();
});

/* ===== REST TIMER ===== */
function startRest(seconds, options = {}) {
  if (!seconds || seconds <= 0) { renderSession(); return; }
  const { mode = 'betweenSets', autoComplete = false } = options;
  session.resting = true;
  session.restEnd = Date.now() + seconds * 1000;
  session.restDuration = seconds;
  session.restContext = { mode, autoComplete };
  dom.viewExercise.classList.add('hidden');
  dom.viewRest.classList.remove('hidden');
  const ex = session.exercises[session.currentIdx];
  if (mode === 'timer') {
    dom.restLabel.textContent = 'TIMER';
    dom.restNext.textContent = ex.name;
  } else {
    dom.restLabel.textContent = 'REST';
    dom.restNext.textContent = `${ex.name} — set ${ex.completedSets + 1}/${ex.sets} next`;
  }

  const C = 2 * Math.PI * 54;
  dom.ringFg.style.strokeDasharray = C;
  clearInterval(restInterval);
  restInterval = setInterval(() => {
    const rem = Math.max(0, session.restEnd - Date.now());
    const secs = Math.ceil(rem / 1000);
    dom.restCountdown.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    dom.ringFg.style.strokeDashoffset = C * (1 - rem / (session.restDuration * 1000));
    if (rem <= 0) {
      const shouldCompleteTimer = session?.restContext?.mode === 'timer' && session?.restContext?.autoComplete;
      stopRest();
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
      if (shouldCompleteTimer) completeCurrentTimer();
      else renderSession();
    }
  }, 50);
}

function stopRest() {
  clearInterval(restInterval);
  if (session) session.resting = false;
  if (session) session.restContext = null;
  dom.viewRest.classList.add('hidden');
  dom.viewExercise.classList.remove('hidden');
  dom.restLabel.textContent = 'REST';
  dom.restCountdown.textContent = '0:00';
  if (undoState) showUndo(true);
}

function completeCurrentTimer() {
  if (!session) return;
  const ex = session.exercises[session.currentIdx];
  if (!ex || ex.type !== 'timer' || ex.done) return;

  ex.completedSets = ex.sets;
  ex.done = true;
  if (session.exercises.every(e => e.done)) { finishSession(); return; }

  const nextIdx = session.exercises.findIndex((e, i) => i > session.currentIdx && !e.done);
  session.currentIdx = nextIdx >= 0 ? nextIdx : session.exercises.findIndex(e => !e.done);
  renderSession();
}

$('#btn-skip').addEventListener('click', () => {
  const isTimerMode = session?.restContext?.mode === 'timer';
  stopRest();
  if (isTimerMode) completeCurrentTimer();
  else renderSession();
});

$('#btn-toggle-drawer').addEventListener('click', () => {
  drawerOpen = !drawerOpen;
  dom.drawerList.classList.toggle('collapsed', !drawerOpen);
  dom.drawerList.classList.toggle('expanded', drawerOpen);
  $('#btn-toggle-drawer').classList.toggle('open', drawerOpen);
});

$('#btn-end').addEventListener('click', () => {
  confirmAction('End this workout?', () => {
    addToHistory(false);
  
    closeSession();
    renderWorkoutList();
  
  });
});

function finishSession() {
  clearInterval(timerInterval);
  clearInterval(restInterval);
  const elapsed = Date.now() - session.startTime;
  const totalSets = session.exercises.reduce((s, e) => s + e.completedSets, 0);

  addToHistory(true);


  dom.session.classList.remove('visible');
  setTimeout(() => dom.session.classList.add('hidden'), 350);
  dom.sessionDone.classList.remove('hidden');
  requestAnimationFrame(() => dom.sessionDone.classList.add('visible'));

  dom.doneTime.textContent = fmtTime(elapsed);
  dom.doneSummary.textContent = `${session.exercises.length} items · ${totalSets} sets`;
  if (navigator.vibrate) navigator.vibrate([100, 80, 100]);
  session = null;

}

$('#btn-finish').addEventListener('click', () => {
  dom.sessionDone.classList.remove('visible');
  setTimeout(() => dom.sessionDone.classList.add('hidden'), 350);
  dom.nav.classList.remove('hidden');
  renderWorkoutList();
});

/* ===== HISTORY ===== */
function addToHistory(completed) {
  if (!session) return;
  const elapsed = Date.now() - session.startTime;
  const totalSets = session.exercises.reduce((s, e) => s + e.completedSets, 0);
  if (totalSets === 0) return; // Don't save empty sessions

  const entry = {
    id: uid(),
    workoutName: session.workout.name,
    completedAt: Date.now(),
    duration: elapsed,
    completed,
    totalSets,
    totalExercises: session.exercises.filter(e => e.completedSets > 0).length,
    exercises: session.exercises.map(e => ({
      name: e.name, type: e.type,
      completedSets: e.completedSets, totalSets: e.sets,
      duration: e.duration,
      reps: e.reps,
      weightMode: e.weightMode, weight: e.weight, weights: e.weights,
    })),
  };
  const history = loadHistory();
  history.unshift(entry);
  saveHistory(history);
}

function renderHistory() {
  const history = loadHistory();
  dom.emptyHistory.classList.toggle('hidden', history.length > 0);
  dom.historyList.innerHTML = history.map(h => {
    const date = new Date(h.completedAt);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const statusClass = h.completed ? 'complete' : 'partial';
    const statusText = h.completed ? 'Complete' : 'Partial';

    const exerciseDetails = h.exercises.filter(e => e.completedSets > 0).map(e => {
      let info;
      if (e.type === 'timer') {
        info = `${Math.max(5, Number(e.duration || 60))}s timer`;
      } else {
        info = `${e.completedSets}×${e.reps}`;
        if (e.weightMode === 'uniform' && e.weight > 0) info += ` @ ${e.weight}kg`;
        else if (e.weightMode === 'perSet' && e.weights?.some(w => w > 0)) {
          const unique = [...new Set(e.weights.slice(0, e.completedSets))];
          info += unique.length === 1 ? ` @ ${unique[0]}kg` : ` @ ${unique.join('/')}kg`;
        }
      }
      return `<div class="h-exercise"><span class="h-ex-name">${esc(e.name)}</span><span class="h-ex-info">${info}</span></div>`;
    }).join('');

    return `
    <div class="h-card" data-hid="${h.id}">
      <div class="h-card-header">
        <h3>${esc(h.workoutName)} <span class="h-card-status ${statusClass}">${statusText}</span></h3>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="h-duration">${fmtTime(h.duration)}</span>
          <button class="btn-icon del h-del" data-hdel="${h.id}" aria-label="Delete">
            <svg width="16" height="16" viewBox="-1 -1 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
      <div class="h-card-date">${dateStr} at ${timeStr}</div>
      <div class="h-card-meta">
        <span>${h.totalExercises} item${h.totalExercises !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>${h.totalSets} set${h.totalSets !== 1 ? 's' : ''}</span>
      </div>
      <div class="h-card-details" data-details="${h.id}">${exerciseDetails}</div>
    </div>`;
  }).join('');

  // Tap to expand details
  dom.historyList.querySelectorAll('.h-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.h-del')) return;
      card.querySelector('.h-card-details').classList.toggle('expanded');
    });
  });

  // Delete individual history entries
  dom.historyList.querySelectorAll('.h-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmAction('Delete this entry?', () => {
        const h = loadHistory().filter(x => x.id !== btn.dataset.hdel);
        saveHistory(h);

        renderHistory();

      });
    });
  });

  // Show/hide clear all button
  $('#btn-clear-history').classList.toggle('hidden', history.length === 0);
}

$('#btn-clear-history').addEventListener('click', () => {
  confirmAction('Clear all history?', () => {
    saveHistory([]);
  
    renderHistory();
  
  });
});

/* ===== CONFIRM DIALOG ===== */
let confirmCb = null;
function confirmAction(msg, cb) {
  dom.confirmMsg.textContent = msg;
  confirmCb = cb;
  dom.confirm.classList.remove('hidden');
  requestAnimationFrame(() => dom.confirm.classList.add('visible'));
}
function closeConfirm() {
  dom.confirm.classList.remove('visible');
  setTimeout(() => dom.confirm.classList.add('hidden'), 200);
  confirmCb = null;
}
$('#confirm-yes').addEventListener('click', () => { if (confirmCb) confirmCb(); closeConfirm(); });
$('#confirm-no').addEventListener('click', closeConfirm);

/* ===== TOAST ===== */
let toastTimer = null;
function showToast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast hidden', 3000);
}

/* ===== HELPERS ===== */
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  const m = Math.floor(t / 60), s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ===== SERVICE WORKER ===== */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

/* ===== INIT ===== */
renderWorkoutList();
