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
// Unit helpers
// ============================================================
function currentUnit() {
  return document.getElementById('btn-lb').classList.contains('active') ? 'lb' : 'kg';
}

function roundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}

// Rounds a calculated value to the nearest plate-friendly increment for display.
// Keeps underlying math at full precision.
function displayRound(value) {
  return roundToNearest(value, currentUnit() === 'kg' ? 2.5 : 5);
}

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
document.getElementById('form-1rm').addEventListener('submit', e => {
  e.preventDefault();

  const w = parseFloat(document.getElementById('input-weight').value);
  const r = parseInt(document.getElementById('input-reps').value, 10);

  if (!w || w <= 0 || !r || r <= 0) return;

  const eVal = epley(w, r);
  const bVal = brzycki(w, r);
  const lVal = lander(w, r);
  const unit = currentUnit();

  document.getElementById('result-epley').textContent   = eVal.toFixed(1);
  document.getElementById('result-brzycki').textContent = bVal !== null ? bVal.toFixed(1) : 'N/A';
  document.getElementById('result-lander').textContent  = lVal !== null ? lVal.toFixed(1) : 'N/A';

  const validVals = [eVal, bVal, lVal].filter(v => v !== null);
  const avg = validVals.reduce((a, b) => a + b, 0) / validVals.length;
  document.getElementById('result-average').textContent = avg.toFixed(1);

  // Update all unit labels inside the results block
  document.querySelectorAll('#results-1rm .result-unit').forEach(el => el.textContent = unit);

  document.getElementById('warning-reps').classList.toggle('hidden', r <= 12);
  document.getElementById('results-1rm').classList.remove('hidden');
});
