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

// Switch to a new unit: converts the weight input and re-renders results.
function switchUnit(newUnit) {
  if (newUnit === activeUnit) return;
  const prevUnit = activeUnit;
  activeUnit     = newUnit;
  localStorage.setItem('1rm-unit', newUnit);
  applyUnitLabels(newUnit);

  // Convert the weight input field value
  const weightEl = document.getElementById('input-weight');
  if (weightEl.value !== '') {
    const v = parseFloat(weightEl.value);
    if (!isNaN(v)) {
      weightEl.value = (prevUnit === 'lb' ? lbToKg(v) : kgToLb(v)).toFixed(1);
    }
  }

  // Re-render results from stored kg values — no recalculation needed
  if (lastResults1rm) renderResults1rm();
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
  const { eKg, bKg, lKg } = lastResults1rm;
  const to = activeUnit === 'lb' ? kgToLb : v => v;

  document.getElementById('result-epley').textContent   = to(eKg).toFixed(1);
  document.getElementById('result-brzycki').textContent = bKg !== null ? to(bKg).toFixed(1) : 'N/A';
  document.getElementById('result-lander').textContent  = lKg !== null ? to(lKg).toFixed(1) : 'N/A';

  const validVals = [eKg, bKg, lKg].filter(v => v !== null);
  const avgKg = validVals.reduce((a, b) => a + b, 0) / validVals.length;
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

  lastResults1rm = {
    eKg: epley(wKg, r),
    bKg: brzycki(wKg, r),
    lKg: lander(wKg, r),
  };

  renderResults1rm();

  document.getElementById('warning-reps').classList.toggle('hidden', r <= 12);
  document.getElementById('results-1rm').classList.remove('hidden');
});
