'use strict';

// ============================================================
// Tab switching
// ============================================================
const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b  => { b.classList.remove('active');  b.setAttribute('aria-selected', 'false'); });
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    tabPanels[i].classList.add('active');
  });
});

// ============================================================
// Unit state
// Persisted in localStorage under key '1rm-unit'.
// All internal calculations use kg; display converts to activeUnit.
// ============================================================
let activeUnit = localStorage.getItem('1rm-unit') || 'lb';

function currentUnit() { return activeUnit; }

// Exact conversion factors from spec
const KG_TO_LB = 2.20462;
const LB_TO_KG = 0.453592;

function kgToLb(kg) { return kg * KG_TO_LB; }
function lbToKg(lb) { return lb * LB_TO_KG; }

// Plate-increment rounding — reserved for working-weight outputs (not 1RM estimates).
function roundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}
function displayRound(value) {
  return roundToNearest(value, activeUnit === 'kg' ? 2.5 : 5);
}

// Update all unit-bearing labels and toggle buttons to reflect `unit`.
// Does NOT convert any values — pure DOM update.
function applyUnitLabels(unit) {
  document.getElementById('btn-lb').classList.toggle('active', unit === 'lb');
  document.getElementById('btn-kg').classList.toggle('active', unit === 'kg');
  document.getElementById('btn-lb').setAttribute('aria-pressed', String(unit === 'lb'));
  document.getElementById('btn-kg').setAttribute('aria-pressed', String(unit === 'kg'));
  document.querySelectorAll('.unit-label').forEach(el => el.textContent = unit);
  document.querySelectorAll('#results-1rm .result-unit').forEach(el => el.textContent = unit);
}

// ============================================================
// Recent calculations history
// Stored in localStorage as a JSON array, newest first, max 5.
// All weights persisted in kg (canonical); converted at render time.
// ============================================================
const HISTORY_KEY = '1rm-history';
const HISTORY_MAX = 5;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCalc(entry) {
  const history = loadHistory();
  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  renderHistory();
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderHistory() {
  const history = loadHistory();
  const list    = document.getElementById('recent-list');
  const to      = activeUnit === 'lb' ? kgToLb : v => v;
  const u       = activeUnit;

  if (history.length === 0) {
    list.innerHTML = '<li class="recent-empty">No calculations yet.</li>';
    return;
  }

  list.innerHTML = history.map(entry => {
    let typeLabel, result, detail;

    if (entry.type === '1rm') {
      typeLabel = 'Estimate 1RM';
      result    = `avg ${to(entry.avgKg).toFixed(1)} ${u}`;
      detail    = `${to(entry.weightKg).toFixed(1)} ${u} × ${entry.reps} reps`;
    } else if (entry.type === 'zone') {
      typeLabel = 'Velocity Zone';
      result    = entry.zone;
      detail    = `${to(entry.ormKg).toFixed(1)} ${u} · ${entry.pct.toFixed(1)}%`;
    } else if (entry.type === 'vbt') {
      typeLabel = 'VBT Estimate';
      result    = entry.estKg !== null ? `${to(entry.estKg).toFixed(1)} ${u}` : '—';
      detail    = `${entry.lift} · ${entry.mv.toFixed(2)} m/s`;
    }

    return `<li class="recent-item">
      <div class="recent-item-header">
        <span class="recent-item-type">${typeLabel}</span>
        <span class="recent-item-time">${formatTime(entry.ts)}</span>
      </div>
      <div class="recent-item-result">${result}</div>
      <div class="recent-item-detail">${detail}</div>
    </li>`;
  }).join('');
}

document.getElementById('btn-reset-history').addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

// ============================================================
// Unit switching
// ============================================================
// Switch to a new unit: converts all weight inputs and re-renders unit-dependent results.
function switchUnit(newUnit) {
  if (newUnit === activeUnit) return;
  const prevUnit = activeUnit;
  activeUnit     = newUnit;
  localStorage.setItem('1rm-unit', newUnit);
  applyUnitLabels(newUnit);

  // Convert every weight input on the page (class js-weight-input)
  document.querySelectorAll('.js-weight-input').forEach(el => {
    if (el.value !== '') {
      const v = parseFloat(el.value);
      if (!isNaN(v)) {
        el.value = (prevUnit === 'lb' ? lbToKg(v) : kgToLb(v)).toFixed(1);
      }
    }
  });

  // Re-render results that depend on unit (Tabs 1 and 3; Tab 2 shows % and m/s)
  if (lastResults1rm) renderResults1rm();
  if (lastResultsVbt) renderResultsVbt();
  renderHistory();
}

document.getElementById('btn-lb').addEventListener('click', () => switchUnit('lb'));
document.getElementById('btn-kg').addEventListener('click', () => switchUnit('kg'));

// Apply saved preference on page load (labels only — inputs are empty)
applyUnitLabels(activeUnit);

// ============================================================
// 1RM formulas — pure functions, no side effects
//
// Epley (1985):    1RM = w × (1 + r/30)
// Brzycki (1993):  1RM = w × 36 / (37 − r)   — undefined at r ≥ 37
// Lander (1985):   1RM = (100 × w) / (101.3 − 2.67123 × r)
// ============================================================
function epley(w, r) {
  if (r === 1) return w;
  return w * (1 + r / 30);
}

function brzycki(w, r) {
  if (r === 1) return w;
  if (r >= 37) return null;
  return w * 36 / (37 - r);
}

function lander(w, r) {
  if (r === 1) return w;
  const denom = 101.3 - 2.67123 * r;
  if (denom <= 0) return null;
  return (100 * w) / denom;
}

// ============================================================
// Tab 1 — 1RM Estimator
// ============================================================

// Last computed results stored in kg (canonical).
// Null until the first calculation is run.
let lastResults1rm = null;

// Render lastResults1rm to the DOM in the current activeUnit.
function renderResults1rm() {
  const { eKg, bKg, lKg, avgKg } = lastResults1rm;
  const to = activeUnit === 'lb' ? kgToLb : v => v;

  document.getElementById('result-epley').textContent   = to(eKg).toFixed(1);
  document.getElementById('result-brzycki').textContent = bKg !== null ? to(bKg).toFixed(1) : 'N/A';
  document.getElementById('result-lander').textContent  = lKg !== null ? to(lKg).toFixed(1) : 'N/A';
  document.getElementById('result-average').textContent = to(avgKg).toFixed(1);

  document.querySelectorAll('#results-1rm .result-unit').forEach(el => el.textContent = activeUnit);
}

document.getElementById('form-1rm').addEventListener('submit', e => {
  e.preventDefault();

  const wInput = parseFloat(document.getElementById('input-weight').value);
  const r      = parseInt(document.getElementById('input-reps').value, 10);

  if (!wInput || wInput <= 0 || !r || r <= 0) return;

  // Normalize to kg so results survive unit toggles at full precision
  const wKg = activeUnit === 'kg' ? wInput : lbToKg(wInput);

  const eKg = epley(wKg, r);
  const bKg = brzycki(wKg, r);
  const lKg = lander(wKg, r);
  const validVals = [eKg, bKg, lKg].filter(v => v !== null);
  const avgKg = validVals.reduce((a, b) => a + b, 0) / validVals.length;

  lastResults1rm = { eKg, bKg, lKg, avgKg };
  renderResults1rm();

  document.getElementById('warning-reps').classList.toggle('hidden', r <= 12);
  document.getElementById('results-1rm').classList.remove('hidden');

  saveCalc({ type: '1rm', ts: Date.now(), weightKg: wKg, reps: r, avgKg });
});

// ============================================================
// Velocity zones — Mann's framework
// Ordered ascending by minPct so the bar renders left-to-right.
// getZone() walks from highest minPct down, returning the first
// zone whose floor the percentage meets or exceeds.
//
// Source: Mann, B. (2010). Developing Explosive Athletes.
// ============================================================
const ZONES = [
  { name: 'Starting Strength',      minPct:  0, velocity: '> 1.30 m/s',    color: '#60a5fa', barWidth: 60 },
  { name: 'Speed-Strength',         minPct: 60, velocity: '1.00–1.30 m/s', color: '#34d399', barWidth: 10 },
  { name: 'Strength-Speed',         minPct: 70, velocity: '0.75–1.00 m/s', color: '#fbbf24', barWidth: 10 },
  { name: 'Accelerative Strength',  minPct: 80, velocity: '0.50–0.75 m/s', color: '#fb923c', barWidth: 10 },
  { name: 'Absolute Strength',      minPct: 90, velocity: '0.15–0.50 m/s', color: '#f87171', barWidth: 10 },
];

function getZone(pct) {
  // Walk from the highest-threshold zone downward; the first whose
  // floor (minPct) the value meets is the correct zone.
  for (let i = ZONES.length - 1; i >= 0; i--) {
    if (pct >= ZONES[i].minPct) return ZONES[i];
  }
  return ZONES[0];
}

// Build the five coloured bar segments once on page load.
(function buildZoneBar() {
  const bar    = document.getElementById('zone-bar');
  const marker = document.getElementById('zone-marker');
  ZONES.forEach(zone => {
    const seg = document.createElement('div');
    seg.className             = 'zone-segment';
    seg.style.width           = zone.barWidth + '%';
    seg.style.backgroundColor = zone.color;
    seg.setAttribute('title', zone.name);
    bar.insertBefore(seg, marker);
  });
}());

// ============================================================
// Tab 2 — Velocity Zone Lookup
// ============================================================
document.getElementById('form-velocity').addEventListener('submit', e => {
  e.preventDefault();

  const orm     = parseFloat(document.getElementById('input-1rm').value);
  const working = parseFloat(document.getElementById('input-working').value);

  const resultsEl   = document.getElementById('results-velocity');
  const errorEl     = document.getElementById('error-velocity');
  const validOutput = document.getElementById('zone-valid-output');

  resultsEl.classList.remove('hidden');

  // Validate
  if (!orm || orm <= 0 || isNaN(working) || working < 0) {
    errorEl.textContent = 'Enter a valid 1RM and working weight.';
    errorEl.classList.remove('hidden');
    validOutput.classList.add('hidden');
    return;
  }
  if (working > orm) {
    errorEl.textContent = 'Working weight exceeds 1RM — check your inputs.';
    errorEl.classList.remove('hidden');
    validOutput.classList.add('hidden');
    return;
  }

  errorEl.classList.add('hidden');
  validOutput.classList.remove('hidden');

  const pct  = (working / orm) * 100;
  const zone = getZone(pct);

  document.getElementById('zone-dot').style.backgroundColor = zone.color;
  document.getElementById('zone-name').textContent          = zone.name;
  document.getElementById('zone-pct').textContent           = pct.toFixed(1) + '% of 1RM';
  document.getElementById('zone-velocity').textContent      = zone.velocity;

  document.querySelectorAll('.zone-segment').forEach((seg, i) => {
    seg.classList.toggle('zone-segment--active', ZONES[i] === zone);
  });

  const marker = document.getElementById('zone-marker');
  marker.style.left = pct.toFixed(2) + '%';
  marker.classList.remove('hidden');

  const ormKg     = activeUnit === 'kg' ? orm     : lbToKg(orm);
  const workingKg = activeUnit === 'kg' ? working : lbToKg(working);
  saveCalc({ type: 'zone', ts: Date.now(), ormKg, workingKg, pct, zone: zone.name });
});

// ============================================================
// VBT load-velocity profiles — lift-specific linear regression
//
// Model: %1RM = slope × MV + intercept   (MV in m/s)
// Then:  estimated_1RM = load / (%1RM / 100)
//
// Adding a new lift: append one entry to VBT_LIFTS and one
// <option value="id"> to #input-vbt-lift in index.html.
//
// Sources (approximate reference values):
//   González-Badillo & Sánchez-Medina (2010) — squat/bench
//   Deadlift values are approximate; verify before publishing.
// ============================================================
const VBT_LIFTS = [
  { id: 'squat', label: 'Back Squat',  slope: -84.7, intercept: 112.0 },
  { id: 'bench', label: 'Bench Press', slope: -91.0, intercept: 117.0 },
  { id: 'dead',  label: 'Deadlift',    slope: -85.0, intercept: 110.0 },
];

// Last VBT result stored in kg (canonical). Null until first run.
let lastResultsVbt = null;

function renderResultsVbt() {
  const { pct, estKg } = lastResultsVbt;
  const to = activeUnit === 'lb' ? kgToLb : v => v;

  document.getElementById('vbt-pct').textContent = pct.toFixed(1) + '%';
  document.getElementById('vbt-1rm').textContent =
    estKg !== null ? to(estKg).toFixed(1) + ' ' + activeUnit : '—';

  // Sanity-check: estimated 1RM outside plausible range (50–500 kg)
  const rangeEl      = document.getElementById('warning-vbt-range');
  const outsideRange = estKg !== null && (estKg < 50 || estKg > 500);
  rangeEl.textContent = 'Estimated 1RM is outside the expected range — verify your inputs.';
  rangeEl.classList.toggle('hidden', !outsideRange);
}

// ============================================================
// Tab 3 — VBT Estimator
// ============================================================
const VBT_VEL_MIN = 0.3;
const VBT_VEL_MAX = 1.2;

document.getElementById('form-vbt').addEventListener('submit', e => {
  e.preventDefault();

  const loadInput = parseFloat(document.getElementById('input-vbt-load').value);
  const mv        = parseFloat(document.getElementById('input-vbt-vel').value);
  const liftId    = document.getElementById('input-vbt-lift').value;

  if (!loadInput || loadInput <= 0 || !mv || mv <= 0) return;

  const resultsEl   = document.getElementById('results-vbt');
  const errorEl     = document.getElementById('error-vbt');
  const validOutput = document.getElementById('vbt-valid-output');

  resultsEl.classList.remove('hidden');

  // Hard gate: equations are only fit for the 0.3–1.2 m/s strength-training range
  if (mv < VBT_VEL_MIN || mv > VBT_VEL_MAX) {
    errorEl.textContent = `Velocity outside the reliable range for VBT estimation (${VBT_VEL_MIN}–${VBT_VEL_MAX} m/s). Use a heavier set closer to your 1RM for an accurate estimate.`;
    errorEl.classList.remove('hidden');
    validOutput.classList.add('hidden');
    lastResultsVbt = null;
    return;
  }

  errorEl.classList.add('hidden');
  validOutput.classList.remove('hidden');

  const lift   = VBT_LIFTS.find(l => l.id === liftId);
  const loadKg = activeUnit === 'kg' ? loadInput : lbToKg(loadInput);
  const pct    = lift.slope * mv + lift.intercept;
  const estKg  = pct > 0 ? loadKg / (pct / 100) : null;

  lastResultsVbt = { pct, estKg };
  renderResultsVbt();

  saveCalc({ type: 'vbt', ts: Date.now(), loadKg, mv, lift: lift.label, pct, estKg });
});

// ============================================================
// Page load init
// ============================================================
renderHistory();
