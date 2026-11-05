import { boot } from '../core/app.js';
import { track, stageHero } from '../core/scenes.js';
import { gsap, ScrollTrigger, reducedMotion, isTouch, getLenis } from '../core/smooth.js';
import { VENUE } from '../core/shell.js';
import { createReserveScene } from './reserve-scene.js';

/* ==========================================================================
   Reserve page.
   · hero scroll lights the candle on the set table
   · three steps (when / who / details); the camera moves with whichever step is
     active, and the place card is re-engraved live as the guest fills it in
   · sending composes the request and opens it in WhatsApp to the host;
     a foil "Requested" seal is pressed onto the card
   ========================================================================== */

const lite = isTouch || window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
const canvas = document.querySelector('[data-reserve-stage]');
let scene = null;

const heroLines = document.querySelectorAll('[data-rhl]');
const heroReveals = document.querySelectorAll('[data-rh]');
gsap.set(heroLines, { yPercent: 115 });
gsap.set(heroReveals, { autoAlpha: 0, y: 20 });

/* ---------- booking state ---------- */
const booking = { date: null, time: '', brunch: false, party: 2, seating: 'Lounge', occasion: '', name: '', phone: '', notes: '' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fmtTime = (h, m) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;

function syncCard() {
  scene?.setCard({
    name: booking.name.trim(),
    date: booking.date ? dateLabel(booking.date) : '',
    time: booking.time ? (booking.brunch ? `${booking.time} brunch` : booking.time) : '',
    party: booking.party,
    occasion: booking.occasion,
  });
}

/* ---------- when: the next fourteen days ---------- */
const datesEl = document.querySelector('[data-dates]');
const timesEl = document.querySelector('[data-times]');
const today = new Date(); today.setHours(0, 0, 0, 0);
const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
datesEl.innerHTML = days.map((d, i) => `
  <button type="button" class="rdate" role="radio" aria-checked="false" data-i="${i}" aria-label="${dateLabel(d)}">
    <small>${i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS[d.getDay()]}</small><b>${d.getDate()}</b><i>${d.getDay() === 5 ? 'Brunch' : MONTHS[d.getMonth()]}</i>
  </button>`).join('');

function renderTimes() {
  const d = booking.date;
  const slots = [];
  if (d && d.getDay() === 5) slots.push({ label: '1:00 PM', brunch: true, h: 13, m: 0 });
  for (let k = 0; k < 12; k++) { const mins = 20 * 60 + k * 30; const h = Math.floor(mins / 60) % 24, m = mins % 60; slots.push({ label: fmtTime(h, m), h: h < 6 ? h + 24 : h, m }); }
  const now = new Date();
  const isToday = d && d.getTime() === today.getTime();
  timesEl.innerHTML = slots.map((s) => {
    const past = isToday && (s.h * 60 + s.m) < now.getHours() * 60 + now.getMinutes() + 30;
    const on = booking.time === s.label;
    return `<button type="button" class="rchip${s.brunch ? ' rchip--brunch' : ''}${on ? ' is-on' : ''}" role="radio" aria-checked="${on}" data-time="${s.label}" data-brunch="${s.brunch ? 1 : 0}"${past ? ' disabled aria-disabled="true" style="opacity:.3;pointer-events:none"' : ''}>${s.label}${s.brunch ? ' · Brunch' : ''}</button>`;
  }).join('');
  document.querySelector('[data-time-hint]').textContent = d && d.getDay() === 5
    ? 'Friday brunch at 1 PM, or the evening from 8 PM'
    : 'Seating from 8 PM; last seating 1:30 AM';
}

function pickDate(i) {
  booking.date = days[i];
  datesEl.querySelectorAll('.rdate').forEach((b, k) => { b.classList.toggle('is-on', k === i); b.setAttribute('aria-checked', String(k === i)); });
  // keep the chosen time only if it still exists for this day
  const fri = booking.date.getDay() === 5;
  if (booking.brunch && !fri) { booking.time = ''; booking.brunch = false; }
  renderTimes();
  syncCard();
  clearError('when');
}
datesEl.addEventListener('click', (e) => { const b = e.target.closest('.rdate'); if (b) pickDate(+b.dataset.i); });
timesEl.addEventListener('click', (e) => {
  const b = e.target.closest('.rchip'); if (!b) return;
  booking.time = b.dataset.time; booking.brunch = b.dataset.brunch === '1';
  timesEl.querySelectorAll('.rchip').forEach((c) => { c.classList.toggle('is-on', c === b); c.setAttribute('aria-checked', String(c === b)); });
  syncCard();
  clearError('when');
});
// arrow keys move through a radio group of chips
[datesEl, timesEl, ...document.querySelectorAll('[data-group]')].forEach((g) => g.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const items = [...g.querySelectorAll('button:not([disabled])')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const n = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
  n.focus(); n.click();
}));

/* ---------- who ---------- */
const partyVal = document.querySelector('[data-party-val]');
const partyHint = document.querySelector('[data-party-hint]');
partyHint.hidden = true;
document.querySelectorAll('[data-party]').forEach((b) => b.addEventListener('click', () => {
  booking.party = Math.min(20, Math.max(1, booking.party + Number(b.dataset.party)));
  partyVal.textContent = booking.party;
  partyHint.hidden = booking.party < 20;
  syncCard();
}));
document.querySelectorAll('[data-group]').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('.rchip'); if (!b) return;
  booking[g.dataset.group] = b.dataset.value;
  g.querySelectorAll('.rchip').forEach((c) => { c.classList.toggle('is-on', c === b); c.setAttribute('aria-checked', String(c === b)); });
  syncCard();
}));

/* ---------- details ---------- */
const nameEl = document.querySelector('[data-name]');
const phoneEl = document.querySelector('[data-phone]');
const notesEl = document.querySelector('[data-notes]');
nameEl.addEventListener('input', () => { booking.name = nameEl.value.slice(0, 40); syncCard(); nameEl.removeAttribute('aria-invalid'); });
phoneEl.addEventListener('input', () => { phoneEl.value = phoneEl.value.replace(/[^\d+\s]/g, ''); booking.phone = phoneEl.value; phoneEl.removeAttribute('aria-invalid'); });
notesEl.addEventListener('input', () => { booking.notes = notesEl.value; });

const errEl = (k) => document.querySelector(`[data-error="${k}"]`);
const clearError = (k) => { errEl(k).textContent = ''; };

/* ---------- send ---------- */
const form = document.querySelector('[data-form]');
const done = document.querySelector('[data-done]');
const reopen = document.querySelector('[data-reopen]');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  let firstBad = null;
  if (!booking.date || !booking.time) {
    errEl('when').textContent = !booking.date ? 'Choose a date for your table.' : 'Choose a time for your table.';
    firstBad = firstBad || document.querySelector('[data-step="0"]');
  }
  const digits = booking.phone.replace(/\D/g, '');
  const bad = [];
  if (!booking.name.trim()) { nameEl.setAttribute('aria-invalid', 'true'); bad.push('your name'); }
  if (digits.length < 7) { phoneEl.setAttribute('aria-invalid', 'true'); bad.push('a mobile number'); }
  errEl('details').textContent = bad.length ? `Please add ${bad.join(' and ')}.` : '';
  if (bad.length) firstBad = firstBad || document.querySelector('[data-step="2"]');
  if (firstBad) {
    goTo(firstBad);
    return;
  }

  const lines = [
    'Hello Hyde Lounge, I would like to request a table.',
    '',
    `Name: ${booking.name.trim()}`,
    `Date: ${dateLabel(booking.date)} ${booking.date.getFullYear()}`,
    `Time: ${booking.time}${booking.brunch ? ' (Friday brunch)' : ''}`,
    `Guests: ${booking.party}`,
    `Seating: ${booking.seating}`,
    booking.occasion ? `Occasion: ${booking.occasion}` : '',
    booking.notes.trim() ? `Notes: ${booking.notes.trim()}` : '',
    `Mobile: ${booking.phone.trim()}`,
  ].filter((l, i) => l || i === 1);
  const url = `${VENUE.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
  reopen.href = url;
  reopen.target = '_blank';
  reopen.rel = 'noopener';
  window.open(url, '_blank', 'noopener');
  done.hidden = false;
  gsap.from(done, { autoAlpha: 0, y: 16, duration: 0.9, ease: 'expo.out' });
  scene?.setCard({ sealed: true });
});

function goTo(el) {
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(el, { offset: -40, duration: 1.4 });
  else el.scrollIntoView({ behavior: 'smooth' });
}
document.querySelector('[data-to-form]').addEventListener('click', (e) => { e.preventDefault(); goTo(document.querySelector('[data-step="0"]')); });

/* ---------- boot ---------- */
renderTimes();
pickDate(0);
syncCard();

boot('reserve', {
  onReveal() {
    gsap.timeline()
      .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out' }, 0.45)
      .to(heroReveals, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' }, 0.7);
  },
});

// The table is set while the curtain is down, so it is live the moment the curtain lifts.
queueMicrotask(() => {
  scene = track(createReserveScene(canvas, { lite }));
  if (!scene) document.documentElement.classList.add('no-webgl');
  syncCard(); // engrave whatever has been chosen so far
  build();
  stageHero(scene, canvas, {
    fonts: ['italic 300 100px "Cormorant Garamond"', '300 100px "Cormorant Garamond"', '600 30px "Manrope"'],
    prepare: () => scene.refreshText(),
  });
});

function build() {
  const st = scene?.state;
  const veil = document.querySelector('[data-reserve-veil]');
  const steps = [...document.querySelectorAll('[data-step]')];
  const setStep = (i) => {
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    if (st) st.step = i;
  };
  setStep(0);
  steps.forEach((s, i) => s.addEventListener('focusin', () => setStep(i)));

  if (reducedMotion) {
    if (st) { st.lit = 1; st.form = 1; }
    veil.style.opacity = 1;
    return;
  }
  // hero: light the candle
  ScrollTrigger.create({ trigger: '[data-rhero]', start: 'top top', end: 'bottom 40%', onUpdate: (self) => { if (st) st.lit = Math.max(0.0, self.progress); } });
  gsap.to('.rhero__copy', { yPercent: -20, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-rhero]', start: 'top top', end: '60% top', scrub: true } });
  gsap.to('.rhero__cue', { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-rhero]', start: 'top top', end: '20% top', scrub: true } });
  // the form arrives: camera moves to the active step
  ScrollTrigger.create({
    trigger: '[data-form]', start: 'top bottom', end: 'top 35%',
    onUpdate: (self) => { if (st) st.form = self.progress; veil.style.opacity = self.progress; },
  });
  steps.forEach((s, i) => {
    ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && setStep(i) });
    gsap.from(s.querySelector('.rstep__head'), { autoAlpha: 0, y: 30, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: s, start: 'top 75%' } });
  });
  // visit: up and over the table
  ScrollTrigger.create({ trigger: '[data-rvisit]', start: 'top bottom', end: 'top 30%', onUpdate: (self) => { if (st) st.visit = self.progress; } });
  gsap.from('.rvisit > *', { autoAlpha: 0, y: 34, stagger: 0.08, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '[data-rvisit]', start: 'top 65%' } });

  const foot = document.querySelector('[data-foot]');
  if (foot && scene) ScrollTrigger.create({ trigger: foot, start: 'top top', onEnter: () => scene.stop(), onLeaveBack: () => scene.start() });
  // on phones the table window sits above the page: lift it away as the footer arrives
  if (foot) ScrollTrigger.create({ trigger: foot, start: 'top 60%', onToggle: (self) => document.body.classList.toggle('reserve-foot', self.isActive) });
  document.addEventListener('visibilitychange', () => (document.hidden ? scene?.stop() : scene?.start()));
}
