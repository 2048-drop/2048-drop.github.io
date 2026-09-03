/* =====================================================================
   2048 Drop — game engine
   ===================================================================== */
'use strict';

const COLS = 5, ROWS = 10, SPAWN_COL = 2;
const STEP_MS = 95;            // tile slide animation
const SETTLE_PAUSE = 55;       // beat between cascade steps
const BOMB = -1, WILD = -2;    // special block sentinels
const POWER_EVERY = 2500;      // points between free power-ups
const POWER_CAP = 5;

const MODES = {
  chill:   { nm:'Chill',   base:950, ramp:70, per:1800 },
  classic: { nm:'Classic', base:700, ramp:60, per:1500 },
  blitz:   { nm:'Blitz',   base:430, ramp:48, per:1200 }
};

const ACHIEVEMENTS = [
  { id:'first',  ico:'✨', nm:'First Fusion',    ds:'Merge your first pair' },
  { id:'t128',   ico:'\u{1F538}', nm:'Getting Warm', ds:'Create a 128 block' },
  { id:'t256',   ico:'\u{1F536}', nm:'Momentum',     ds:'Create a 256 block' },
  { id:'t512',   ico:'\u{1F7E0}', nm:'Heavyweight',  ds:'Create a 512 block' },
  { id:'t1024',  ico:'\u{1F7E1}', nm:'Four Digits',  ds:'Create a 1024 block' },
  { id:'t2048',  ico:'\u{1F451}', nm:'2048',         ds:'Create the 2048 block' },
  { id:'chain3', ico:'⚡', nm:'Chain Reaction',  ds:'Trigger a 3-link chain' },
  { id:'chain5', ico:'\u{1F32A}', nm:'Avalanche',    ds:'Trigger a 5-link chain' },
  { id:'s5k',    ico:'\u{1F3AF}', nm:'Five Thousand',ds:'Score 5,000 in one game' },
  { id:'s25k',   ico:'\u{1F3C6}', nm:'Twenty-Five K',ds:'Score 25,000 in one game' },
  { id:'boom',   ico:'\u{1F4A3}', nm:'Demolition',   ds:'Detonate a bomb block' },
  { id:'wild',   ico:'\u{1F31F}', nm:'Wildcard',     ds:'Land a wild block' },
  { id:'daily',  ico:'\u{1F4C5}', nm:'Daily Devotion', ds:'Finish a Daily Challenge' },
  { id:'games10',ico:'\u{1F3AE}', nm:'Regular',      ds:'Play 10 games' },
  { id:'blitzed',ico:'\u{1F525}', nm:'Blitzed',      ds:'Score 3,000 in Blitz mode' },
  { id:'clean',  ico:'\u{1F9F9}', nm:'Spring Clean', ds:'Empty the board completely' }
];

/* ---------------------------------------------------------------------
   Storage
   ------------------------------------------------------------------ */
const store = {
  get:function(k, d){
    try { const v = localStorage.getItem('drop2048.' + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set:function(k, v){
    try { localStorage.setItem('drop2048.' + k, JSON.stringify(v)); } catch (e) {}
  }
};

let stats = Object.assign(
  { games:0, merges:0, score:0, highest:0, bestChain:0, seconds:0 },
  store.get('stats', {})
);
let unlocked  = store.get('achievements', {});
let leaders   = store.get('leaders', []);
let bestScore = store.get('best', 0);
let theme     = store.get('theme', 'midnight');

/* ---------------------------------------------------------------------
   Seeded RNG — the Daily Challenge must be identical for everyone
   ------------------------------------------------------------------ */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function todayKey(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function seedFrom(str){
  let h = 2166136261;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------------------------------------------------------------
   DOM
   ------------------------------------------------------------------ */
const $ = function(id){ return document.getElementById(id); };
const boardEl = $('board');
const fxEl    = $('fx');
const ghostEl = $('ghost');
const beamEl  = $('beam');
const dangerEl= $('danger');
const toastEl = $('toast');
const wrapEl  = $('board-wrap');

/* ---------------------------------------------------------------------
   State
   ------------------------------------------------------------------ */
let grid, tiles, nextId, active, queue, held, holdLocked;
let score, merges, chainBest, powers, nextPowerAt, undoSnap;
let running, paused, busy, over, reached2048, secondChances, refills;
let mode, daily, rng;
let dropAcc = 0, lastFrame = 0, rafId = null, startedAt = 0;
let soundOn = store.get('sound', true);

/* ---------------------------------------------------------------------
   Tiles
   ------------------------------------------------------------------ */
function classFor(v){
  if (v === BOMB) return 'vbomb';
  if (v === WILD) return 'vwild';
  const known = [2,4,8,16,32,64,128,256,512,1024,2048];
  return known.indexOf(v) >= 0 ? 'v' + v : 'vbig';
}
function faceFor(v){
  if (v === BOMB) return '\u{1F4A3}';
  if (v === WILD) return '★';
  return String(v);
}
function digitClass(v){
  if (v < 0) return '';
  const n = String(v).length;
  return n >= 5 ? 'd5' : (n === 4 ? 'd4' : '');
}
function place(t){
  t.el.style.setProperty('--r', t.r);
  t.el.style.setProperty('--c', t.c);
}
function paint(t){
  t.el.className = 'tile ' + classFor(t.v) + ' ' + digitClass(t.v) + (t === active ? ' active' : '');
  t.el.textContent = faceFor(t.v);
}
function makeTile(r, c, v, spawnAnim){
  const el = document.createElement('div');
  const t = { id:nextId++, r:r, c:c, v:v, el:el };
  tiles.set(t.id, t);
  boardEl.appendChild(el);
  place(t); paint(t);
  if (spawnAnim){
    el.classList.add('spawn');
    setTimeout(function(){ el.classList.remove('spawn'); }, 200);
  }
  return t;
}
function removeTile(t){
  tiles.delete(t.id);
  if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
}
function tileAt(r, c){
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  const id = grid[r][c];
  return id ? tiles.get(id) : null;
}
function free(r, c){
  return r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === 0;
}

/* ---------------------------------------------------------------------
   Effects
   ------------------------------------------------------------------ */
function sparks(t, n){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = boardEl.getBoundingClientRect();
  const r = t.el.getBoundingClientRect();
  const x = r.left - b.left + r.width / 2;
  const y = r.top - b.top + r.height / 2;
  const hue = getComputedStyle(t.el).backgroundColor;
  for (let i = 0; i < (n || 9); i++){
    const s = document.createElement('span');
    s.className = 'spark';
    const a = Math.random() * Math.PI * 2;
    const d = 26 + Math.random() * 46;
    s.style.background = hue;
    s.style.setProperty('--x', x + 'px');
    s.style.setProperty('--y', y + 'px');
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    fxEl.appendChild(s);
    setTimeout(function(){ if (s.parentNode) s.parentNode.removeChild(s); }, 640);
  }
}
function shake(){
  wrapEl.classList.remove('shake');
  void wrapEl.offsetWidth;
  wrapEl.classList.add('shake');
  setTimeout(function(){ wrapEl.classList.remove('shake'); }, 280);
}
function toast(text){
  toastEl.textContent = text;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
}

let audioCtx = null;
function blip(freq, dur, type){
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.055, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

/* ---------------------------------------------------------------------
   HUD
   ------------------------------------------------------------------ */
function level(){ return 1 + Math.floor(score / MODES[mode].per); }
function dropInterval(){ return Math.max(120, MODES[mode].base - (level() - 1) * MODES[mode].ramp); }
function fmt(n){ return n.toLocaleString('en-US'); }

function bumpReadout(el){
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}

function renderQueue(){
  const host = $('queue');
  host.innerHTML = '';
  queue.slice(0, 3).forEach(function(v, i){
    const d = document.createElement('div');
    d.className = 'chip ' + classFor(v) + (i ? ' sm' : '');
    d.textContent = faceFor(v);
    host.appendChild(d);
  });
}
function renderHold(){
  const host = $('hold');
  host.innerHTML = '';
  const d = document.createElement('div');
  if (held === null){ d.className = 'chip empty'; d.textContent = '—'; }
  else { d.className = 'chip ' + classFor(held); d.textContent = faceFor(held); }
  host.appendChild(d);
}
function renderPowers(){
  ['bomb','wild','undo'].forEach(function(k){
    const b = $('pw-' + k);
    if (!b) return;
    b.querySelector('.ct').textContent = powers[k];
    b.disabled = !running || over || busy || powers[k] <= 0 ||
                (k === 'undo' ? !undoSnap : !active);
  });
  const refill = $('pw-refill');
  if (refill){
    const empty = powers.bomb + powers.wild + powers.undo === 0;
    refill.hidden = !(running && !over && empty && refills > 0 && Ads.available());
  }
}
function updateHud(){
  $('score').textContent = fmt(score);
  $('best').textContent  = fmt(bestScore);
  $('level').textContent = level();
  const per = MODES[mode].per;
  $('lvbar').style.width = Math.round((score % per) / per * 100) + '%';
  renderQueue(); renderHold(); renderPowers();

  let top = ROWS;
  tiles.forEach(function(t){ if (t !== active && t.r < top) top = t.r; });
  dangerEl.classList.toggle('on', top <= 2);
}

/* ---------------------------------------------------------------------
   Ghost — where the block will land, and whether it will merge
   ------------------------------------------------------------------ */
function landingRow(c, fromR){
  let r = fromR;
  while (free(r + 1, c)) r++;
  return r;
}
function updateGhost(){
  if (!active || !running || over){ ghostEl.classList.add('hide'); return; }
  const r = landingRow(active.c, active.r);
  ghostEl.classList.remove('hide');
  ghostEl.style.setProperty('--r', r);
  ghostEl.style.setProperty('--c', active.c);
  beamEl.style.setProperty('--c', active.c);

  let willMerge = active.v === BOMB || active.v === WILD;
  if (!willMerge){
    [[r + 1, active.c], [r, active.c - 1], [r, active.c + 1]].forEach(function(p){
      const n = tileAt(p[0], p[1]);
      if (n && n.v === active.v) willMerge = true;
    });
  }
  ghostEl.classList.toggle('match', willMerge);
}

/* ---------------------------------------------------------------------
   Core rules — gravity, merge detection, cascade settle
   These three are the verified heart of the game. The invariant they
   maintain: a settled board never contains two orthogonally adjacent
   blocks of equal value, and no block floats above an empty cell.
   ------------------------------------------------------------------ */
function applyGravity(){
  let moved = false;
  for (let c = 0; c < COLS; c++){
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--){
      const id = grid[r][c];
      if (!id) continue;
      if (r !== write){
        grid[write][c] = id; grid[r][c] = 0;
        const t = tiles.get(id); t.r = write; place(t);
        moved = true;
      }
      write--;
    }
  }
  return moved;
}

function findMerges(){
  const used = new Set(), pairs = [];
  for (let r = ROWS - 1; r >= 0; r--){
    for (let c = 0; c < COLS; c++){
      const a = tileAt(r, c);
      if (!a || a.v < 0 || used.has(a.id)) continue;
      const below = tileAt(r + 1, c);
      if (below && below.v === a.v && !used.has(below.id)){
        pairs.push({ from:a, to:below });
        used.add(a.id); used.add(below.id);
        continue;
      }
      const right = tileAt(r, c + 1);
      if (right && right.v === a.v && !used.has(right.id)){
        pairs.push({ from:right, to:a });
        used.add(a.id); used.add(right.id);
      }
    }
  }
  return pairs;
}

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

async function settle(){
  let chain = 0, guard = 0;
  while (guard++ < 400){
    if (applyGravity()){ await sleep(STEP_MS); continue; }

    const pairs = findMerges();
    if (!pairs.length) break;

    chain++;
    let gained = 0;

    pairs.forEach(function(p){
      grid[p.from.r][p.from.c] = 0;
      p.from.r = p.to.r; p.from.c = p.to.c;
      p.from.el.classList.add('absorb');
      place(p.from);
    });
    await sleep(STEP_MS);

    pairs.forEach(function(p){
      removeTile(p.from);
      p.to.v *= 2;
      paint(p.to);
      p.to.el.classList.add('pop');
      setTimeout(function(){ p.to.el.classList.remove('pop'); }, 220);
      sparks(p.to, p.to.v >= 128 ? 14 : 8);
      gained += p.to.v * chain;
      merges++;
      stats.merges++;
      if (p.to.v > stats.highest) stats.highest = p.to.v;
      grant('first');
      if (p.to.v >= 128)  grant('t128');
      if (p.to.v >= 256)  grant('t256');
      if (p.to.v >= 512)  grant('t512');
      if (p.to.v >= 1024) grant('t1024');
      if (p.to.v >= 2048){ grant('t2048'); if (!reached2048){ reached2048 = true; toast('2048!'); shake(); } }
    });

    addScore(gained);
    if (chain > chainBest) chainBest = chain;
    if (chain > stats.bestChain) stats.bestChain = chain;
    if (chain >= 3) grant('chain3');
    if (chain >= 5){ grant('chain5'); shake(); }
    blip(300 + chain * 95, 0.11);
    if (chain >= 2) toast('Chain ×' + chain + '  +' + fmt(gained));

    await sleep(SETTLE_PAUSE);
  }
  if (tiles.size === 0 || (tiles.size === 1 && active)) grant('clean');
  updateHud();
}

function addScore(n){
  score += n;
  if (score > bestScore){ bestScore = score; store.set('best', bestScore); }
  while (score >= nextPowerAt){
    nextPowerAt += POWER_EVERY;
    grantPower();
  }
  if (score >= 5000)  grant('s5k');
  if (score >= 25000) grant('s25k');
  if (mode === 'blitz' && score >= 3000) grant('blitzed');
  bumpReadout($('r-score'));
  updateHud();
}

/* ---------------------------------------------------------------------
   Power-ups
   ------------------------------------------------------------------ */
function grantPower(kind){
  const kinds = ['bomb','wild','undo'];
  const k = kind || kinds[Math.floor(Math.random() * kinds.length)];
  if (powers[k] >= POWER_CAP) return;
  powers[k]++;
  toast('Power-up: ' + k.toUpperCase());
  blip(660, 0.14, 'square');
  renderPowers();
}

function usePower(k){
  if (!running || over || busy) return;
  if (powers[k] <= 0) return;

  if (k === 'undo'){
    if (!undoSnap) return;
    powers.undo--;
    restore(undoSnap);
    undoSnap = null;
    blip(240, 0.14);
    toast('Undone');
    return;
  }
  if (!active || active.v < 0) return;
  powers[k]--;
  active.v = (k === 'bomb') ? BOMB : WILD;
  paint(active);
  blip(520, 0.1, 'square');
  updateGhost();
  renderPowers();
}

/* A bomb clears itself and its eight neighbours, scoring what it removes. */
async function detonate(r, c){
  grant('boom');
  const dead = [];
  for (let dr = -1; dr <= 1; dr++){
    for (let dc = -1; dc <= 1; dc++){
      const t = tileAt(r + dr, c + dc);
      if (t) dead.push(t);
    }
  }
  let gained = 0;
  dead.forEach(function(t){
    if (t.v > 0) gained += t.v;
    grid[t.r][t.c] = 0;
    t.el.classList.add('blast');
    sparks(t, 6);
  });
  shake();
  blip(90, 0.32, 'sawtooth');
  await sleep(240);
  dead.forEach(removeTile);
  addScore(gained);
  toast('Boom  +' + fmt(gained));
}

/* A wild block takes the value of its strongest neighbour, guaranteeing
   a merge. With no neighbours it settles as a 2. */
function resolveWild(t){
  grant('wild');
  let best = 0;
  [[t.r + 1, t.c], [t.r - 1, t.c], [t.r, t.c - 1], [t.r, t.c + 1]].forEach(function(p){
    const n = tileAt(p[0], p[1]);
    if (n && n.v > best) best = n.v;
  });
  t.v = best || 2;
  paint(t);
  sparks(t, 12);
}

/* ---------------------------------------------------------------------
   Snapshot / restore for Undo
   ------------------------------------------------------------------ */
function snapshot(){
  const cells = [];
  for (let r = 0; r < ROWS; r++){
    const row = [];
    for (let c = 0; c < COLS; c++){
      const t = tileAt(r, c);
      row.push(t ? t.v : 0);
    }
    cells.push(row);
  }
  return { cells:cells, score:score, merges:merges, queue:queue.slice(), held:held };
}
function restore(snap){
  tiles.forEach(function(t){ if (t.el.parentNode) t.el.parentNode.removeChild(t.el); });
  tiles = new Map();
  grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));
  if (active) active = null;

  for (let r = 0; r < ROWS; r++){
    for (let c = 0; c < COLS; c++){
      const v = snap.cells[r][c];
      if (v){ grid[r][c] = makeTile(r, c, v, false).id; }
    }
  }
  score = snap.score; merges = snap.merges;
  queue = snap.queue.slice(); held = snap.held;
  holdLocked = false;
  updateHud();
  spawn();
}

/* ---------------------------------------------------------------------
   Movement
   ------------------------------------------------------------------ */
function moveActive(dc){
  if (!active || busy || paused || over || !running) return;
  if (free(active.r, active.c + dc)){
    active.c += dc;
    place(active);
    updateGhost();
  }
}

/* Down arrow slams the block straight to the floor. */
function hardDrop(){
  if (!active || busy || paused || over || !running) return;
  const target = landingRow(active.c, active.r);
  const dist = target - active.r;
  active.r = target;
  place(active);
  if (dist > 0) addScore(dist * 2);
  shakeIf(dist);
  lock();
}
function shakeIf(dist){ if (dist >= 6) shake(); }

function doHold(){
  if (!active || busy || paused || over || !running || holdLocked) return;
  const cur = active.v;
  if (cur < 0) return;                       // a primed power block cannot be banked
  removeTile(active); active = null;
  if (held === null){ held = cur; spawn(); }
  else {
    const swap = held; held = cur;
    spawnValue(swap);
  }
  holdLocked = true;
  blip(400, 0.08);
  updateHud();
}

/* ---------------------------------------------------------------------
   Lock / spawn / game over
   ------------------------------------------------------------------ */
function lock(){
  const t = active;
  // Snapshot before the block joins the grid, with its value pushed back onto
  // the queue, so Undo returns both the board and the block itself.
  undoSnap = snapshot();
  undoSnap.queue = [t.v].concat(queue);
  active = null;
  ghostEl.classList.add('hide');
  grid[t.r][t.c] = t.id;
  paint(t);
  blip(190, 0.06);
  busy = true;

  if (t.v < 0) undoSnap = null;   // a spent power block cannot be undone

  (async function(){
    if (t.v === BOMB){
      await detonate(t.r, t.c);
    } else if (t.v === WILD){
      resolveWild(t);
    }
    await settle();
    busy = false;
    holdLocked = false;
    if (!over) spawn();
  })();
}

function refillQueue(){
  while (queue.length < 4) queue.push(rollValue());
}
function rollValue(){
  const r = rng();
  if (level() >= 4 && r < 0.04) return 8;
  if (r < 0.24) return 4;
  return 2;
}

function spawn(){
  refillQueue();
  spawnValue(queue.shift());
}
function spawnValue(v){
  if (grid[0][SPAWN_COL] !== 0){ endGame(); return; }
  active = makeTile(0, SPAWN_COL, v, true);
  paint(active);
  dropAcc = 0;
  updateGhost();
  updateHud();
}

function endGame(){
  over = true; running = false;
  ghostEl.classList.add('hide');

  stats.games++;
  stats.score += score;
  stats.seconds += Math.round((Date.now() - startedAt) / 1000);
  if (stats.games >= 10) grant('games10');
  if (daily) grant('daily');
  store.set('stats', stats);

  leaders.push({ s:score, m:daily ? 'daily' : mode, d:todayKey(), h:stats.highest });
  leaders.sort(function(a, b){ return b.s - a.s; });
  leaders = leaders.slice(0, 10);
  store.set('leaders', leaders);

  $('over-title').textContent = reached2048 ? 'Nice run.' : 'Game Over';
  $('over-line').textContent =
    fmt(score) + ' points · ' + merges + ' merges · best chain ×' + chainBest;
  $('btn-second').hidden = !(secondChances > 0 && Ads.available());
  $('overlay-over').hidden = false;
  blip(110, 0.45, 'sine');
}

/* Second Chance: clear the top four rows so the player has room again.
   Granted for WATCHING a rewarded video — never for clicking anything. */
function secondChance(){
  Ads.showRewarded({
    name: 'second-chance',
    title: 'Second Chance',
    reward: 'a cleared top section so you can keep this run going',
    onReward: function(){
      secondChances--;
      const dead = [];
      tiles.forEach(function(t){ if (t.r < 4) dead.push(t); });
      dead.forEach(function(t){
        grid[t.r][t.c] = 0;
        t.el.classList.add('blast');
        sparks(t, 5);
      });
      setTimeout(function(){
        dead.forEach(removeTile);
        over = false; running = true;
        $('overlay-over').hidden = true;
        startedAt = Date.now();
        busy = true;
        settle().then(function(){ busy = false; spawn(); });
        toast('Second chance');
        shake();
      }, 240);
    }
  });
}

function refillPowers(){
  Ads.showRewarded({
    name: 'power-refill',
    title: 'Power-up Refill',
    reward: 'one bomb, one wild block and one undo',
    onReward: function(){
      refills--;
      grantPower('bomb'); grantPower('wild'); grantPower('undo');
      toast('Powers restored');
      renderPowers();
    }
  });
}

/* ---------------------------------------------------------------------
   Achievements
   ------------------------------------------------------------------ */
function grant(id){
  if (unlocked[id]) return;
  unlocked[id] = Date.now();
  store.set('achievements', unlocked);
  const a = ACHIEVEMENTS.find(function(x){ return x.id === id; });
  if (!a) return;
  const el = $('ach-toast');
  el.innerHTML =
    '<div class="ico">' + a.ico + '</div>' +
    '<div><div class="t">Achievement unlocked</div><div class="n">' + a.nm + '</div></div>';
  el.classList.add('show');
  blip(880, 0.16, 'sine');
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.classList.remove('show'); }, 3400);
}

/* ---------------------------------------------------------------------
   Main loop
   ------------------------------------------------------------------ */
function frame(now){
  rafId = requestAnimationFrame(frame);
  if (!lastFrame) lastFrame = now;
  const dt = now - lastFrame;
  lastFrame = now;
  if (!running || paused || busy || over || !active) return;

  dropAcc += dt;
  if (dropAcc >= dropInterval()){
    dropAcc = 0;
    if (free(active.r + 1, active.c)){ active.r++; place(active); }
    else lock();
  }
}

/* ---------------------------------------------------------------------
   Lifecycle
   ------------------------------------------------------------------ */
function reset(){
  grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));
  tiles = new Map();
  Array.prototype.slice.call(boardEl.querySelectorAll('.tile')).forEach(function(el){
    el.parentNode.removeChild(el);
  });
  fxEl.innerHTML = '';
  nextId = 1;
  active = null; held = null; holdLocked = false;
  score = 0; merges = 0; chainBest = 0;
  powers = { bomb:1, wild:1, undo:1 };
  nextPowerAt = POWER_EVERY;
  undoSnap = null;
  over = false; paused = false; busy = false; reached2048 = false;
  secondChances = 1; refills = 2;
  dropAcc = 0; lastFrame = 0;
  rng = daily ? mulberry32(seedFrom('2048drop-' + todayKey())) : Math.random;
  queue = [];
  refillQueue();
  dangerEl.classList.remove('on');
  ghostEl.classList.add('hide');
  updateHud();
}

function start(asDaily){
  daily = Boolean(asDaily);
  if (daily) mode = 'classic';
  reset();
  $('overlay-start').hidden = true;
  $('overlay-over').hidden = true;
  $('overlay-pause').hidden = true;
  $('daily-flag').hidden = !daily;
  running = true;
  startedAt = Date.now();
  spawn();
  if (rafId === null) rafId = requestAnimationFrame(frame);
}

function togglePause(force){
  if (!running || over) return;
  paused = (typeof force === 'boolean') ? force : !paused;
  $('overlay-pause').hidden = !paused;
  lastFrame = 0;
}

function setMode(m){
  mode = m;
  store.set('mode', m);
  Array.prototype.slice.call(document.querySelectorAll('.modes button[data-mode]')).forEach(function(b){
    b.classList.toggle('on', b.dataset.mode === m);
  });
}

function setTheme(t){
  theme = t;
  document.documentElement.setAttribute('data-theme', t === 'midnight' ? '' : t);
  store.set('theme', t);
}

/* ---------------------------------------------------------------------
   Modals
   ------------------------------------------------------------------ */
function openModal(title, sub, body, footer){
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal';
  m.id = 'modal';
  m.innerHTML =
    '<div class="modal-card">' +
      '<h2>' + title + '</h2>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') +
      body +
      '<div class="modal-foot">' + (footer || '') +
        '<button class="btn sm" data-close>Close</button></div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener('click', function(e){
    if (e.target === m || e.target.closest('[data-close]')) closeModal();
  });
  togglePause(true);
  return m;
}
function closeModal(){
  const m = $('modal');
  if (m) m.remove();
}

function showAchievements(){
  const got = Object.keys(unlocked).length;
  const rows = ACHIEVEMENTS.map(function(a){
    const on = Boolean(unlocked[a.id]);
    return '<div class="ach' + (on ? ' got' : '') + '">' +
      '<div class="ico">' + a.ico + '</div>' +
      '<div><div class="nm">' + a.nm + '</div><div class="ds">' + a.ds + '</div></div></div>';
  }).join('');
  openModal('Achievements', got + ' of ' + ACHIEVEMENTS.length + ' unlocked', '<div>' + rows + '</div>');
}

function showStats(){
  const mins = Math.round(stats.seconds / 60);
  const body =
    '<div class="grid2">' +
      box('Games played', fmt(stats.games)) +
      box('Best score', fmt(bestScore)) +
      box('Total merges', fmt(stats.merges)) +
      box('Highest block', stats.highest ? fmt(stats.highest) : '—') +
      box('Best chain', stats.bestChain ? '×' + stats.bestChain : '—') +
      box('Time played', mins + ' min') +
    '</div>' +
    (leaders.length ? '<h2 style="font-size:15px;margin:20px 0 8px">Your top scores</h2>' +
      '<table class="lb"><tr><th></th><th>Score</th><th>Mode</th><th>Date</th></tr>' +
      leaders.map(function(l, i){
        return '<tr><td class="rk">' + (i + 1) + '</td><td>' + fmt(l.s) + '</td>' +
               '<td>' + (MODES[l.m] ? MODES[l.m].nm : 'Daily') + '</td><td>' + l.d + '</td></tr>';
      }).join('') + '</table>' : '');
  openModal('Statistics', 'Stored on this device only.', body,
    '<button class="btn ghost sm" data-wipe>Reset all data</button>')
    .addEventListener('click', function(e){
      if (e.target.closest('[data-wipe]')){
        if (confirm('Erase scores, stats and achievements on this device?')){
          ['stats','achievements','leaders','best'].forEach(function(k){
            try { localStorage.removeItem('drop2048.' + k); } catch (err) {}
          });
          location.reload();
        }
      }
    });
}
function box(k, v){
  return '<div class="tilebox"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
}

function showSettings(){
  const body =
    '<div class="tilebox" style="margin-bottom:9px"><div class="k">Theme</div>' +
      '<div class="modes" style="margin-top:8px">' +
        ['midnight','aurora','paper'].map(function(t){
          return '<button data-theme="' + t + '"' + (theme === t ? ' class="on"' : '') + '>' +
                 t.charAt(0).toUpperCase() + t.slice(1) + '</button>';
        }).join('') +
      '</div></div>' +
    '<div class="tilebox"><div class="k">Sound</div>' +
      '<div class="modes" style="margin-top:8px">' +
        '<button data-sound="1"' + (soundOn ? ' class="on"' : '') + '>On</button>' +
        '<button data-sound="0"' + (!soundOn ? ' class="on"' : '') + '>Off</button>' +
      '</div></div>' +
    '<p style="color:var(--muted);font-size:12.5px;margin-top:14px">' +
      'Ad preferences are remembered from the banner. ' +
      '<a href="#" data-consent>Change ad consent</a> · ' +
      '<a href="privacy.html">Privacy Policy</a></p>';
  openModal('Settings', '', body).addEventListener('click', function(e){
    const th = e.target.closest('[data-theme]');
    if (th){ setTheme(th.dataset.theme); closeModal(); showSettings(); return; }
    const sd = e.target.closest('[data-sound]');
    if (sd){ soundOn = sd.dataset.sound === '1'; store.set('sound', soundOn); closeModal(); showSettings(); return; }
    if (e.target.closest('[data-consent]')){ e.preventDefault(); Ads.resetConsent(); }
  });
}

/* ---------------------------------------------------------------------
   Input
   ------------------------------------------------------------------ */
document.addEventListener('keydown', function(e){
  if ($('modal')) { if (e.key === 'Escape') closeModal(); return; }
  const k = e.key;
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].indexOf(k) >= 0) e.preventDefault();

  if ((!running || over) && (k === 'Enter' || k === ' ')){ start(daily); return; }

  switch (k){
    case 'ArrowLeft':  moveActive(-1); break;
    case 'ArrowRight': moveActive(1);  break;
    case 'ArrowDown':
    case 'ArrowUp':
    case ' ':          hardDrop(); break;
    case 'c': case 'C': doHold(); break;
    case '1': usePower('bomb'); break;
    case '2': usePower('wild'); break;
    case '3': usePower('undo'); break;
    case 'p': case 'P': togglePause(); break;
    case 'r': case 'R': start(daily); break;
  }
});

(function touch(){
  let sx = 0, sy = 0, st = 0, cols = 0, moved = false;
  const STEP = 26;
  boardEl.addEventListener('touchstart', function(e){
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now(); cols = 0; moved = false;
  }, { passive:true });

  boardEl.addEventListener('touchmove', function(e){
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > Math.abs(dy)){
      const steps = Math.trunc(dx / STEP);
      while (cols < steps){ moveActive(1); cols++; moved = true; }
      while (cols > steps){ moveActive(-1); cols--; moved = true; }
    }
  }, { passive:false });

  boardEl.addEventListener('touchend', function(e){
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st;
    if (!running || over){ start(daily); return; }
    if (dy < -55 && Math.abs(dy) > Math.abs(dx)){ doHold(); return; }
    if (dy > 45 && Math.abs(dy) > Math.abs(dx)){ hardDrop(); return; }
    if (!moved && dt < 240 && Math.abs(dx) < 16 && Math.abs(dy) < 16) hardDrop();
  }, { passive:true });
})();

/* ---------------------------------------------------------------------
   Wiring
   ------------------------------------------------------------------ */
function on(id, fn){ const el = $(id); if (el) el.addEventListener('click', fn); }

on('btn-start',   function(){ start(false); });
on('btn-daily',   function(){ start(true);  });
on('btn-again',   function(){ start(daily); });
on('btn-second',  secondChance);
on('btn-resume',  function(){ togglePause(false); });
on('btn-pause',   function(){ togglePause(); });
on('btn-restart', function(){ start(daily); });
on('btn-ach',     showAchievements);
on('btn-stats',   showStats);
on('btn-settings',showSettings);
on('pw-bomb',     function(){ usePower('bomb'); });
on('pw-wild',     function(){ usePower('wild'); });
on('pw-undo',     function(){ usePower('undo'); });
on('pw-refill',   refillPowers);
on('hold-card',   doHold);

Array.prototype.slice.call(document.querySelectorAll('.modes button[data-mode]')).forEach(function(b){
  b.addEventListener('click', function(){
    setMode(b.dataset.mode);
    if (running && !over) start(false);
  });
});

document.addEventListener('visibilitychange', function(){
  if (document.hidden && running && !over) togglePause(true);
});

/* ---------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------ */
(function boot(){
  for (let r = 0; r < ROWS; r++){
    for (let c = 0; c < COLS; c++){
      const s = document.createElement('div');
      s.className = 'slot';
      s.style.setProperty('--r', r);
      s.style.setProperty('--c', c);
      boardEl.insertBefore(s, boardEl.firstChild);
    }
  }
  beamEl.style.setProperty('--c', SPAWN_COL);
  ghostEl.style.setProperty('--c', SPAWN_COL);
  ghostEl.style.setProperty('--r', ROWS - 1);
  setTheme(theme);
  setMode(store.get('mode', 'classic'));
  daily = false;
  reset();
  running = false;
  $('best').textContent = fmt(bestScore);
  $('daily-date').textContent = todayKey();
})();
