/* Neon Comet — a tiny browser game built from one prompt.
   Steer a neon comet, dodge falling asteroids, collect stars.
   3 lives, rising speed, game over with restart.
   No network, no assets: everything is drawn in code.
   Autopilot (?auto=1) steers itself for demo recordings. */

'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const startScreen = document.getElementById('start-screen');
const overScreen = document.getElementById('over-screen');
const finalScoreEl = document.getElementById('final-score');
const bestLineEl = document.getElementById('best-line');
const toastEl = document.getElementById('toast');
const fpsEl = document.getElementById('fps');

const params = new URLSearchParams(location.search);
const AUTO = params.get('auto') === '1';
const DEMO = params.get('demo') === '1';
const STEP = params.get('step') === '1'; // frame-stepped recording mode

const TAU = Math.PI * 2;

/* ---------------- pre-rendered sprites ----------------
   Software rendering (swiftshader) makes shadowBlur per frame
   very slow, so every glow is painted once to an offscreen
   canvas and blitted with drawImage instead. */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function glowSprite(color, stops) {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

const SPRITES = {
  star: null,
  halo: null,
  glowMagenta: null,
  glowViolet: null,
};

function buildSprites() {
  // Gold star with glow, painted once.
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const halo = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  halo.addColorStop(0, 'rgba(255,215,94,0.9)');
  halo.addColorStop(0.4, 'rgba(255,215,94,0.28)');
  halo.addColorStop(1, 'rgba(255,215,94,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 128, 128);
  g.translate(64, 64);
  g.fillStyle = '#ffd75e';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? 30 : 12.6;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  SPRITES.star = c;

  SPRITES.halo = glowSprite('#3ee6ff', [
    [0, 'rgba(62,230,255,0.55)'],
    [1, 'rgba(62,230,255,0)'],
  ]);
  SPRITES.glowMagenta = glowSprite('#ff5ea8', [
    [0, 'rgba(255,94,168,0.5)'],
    [1, 'rgba(255,94,168,0)'],
  ]);
  SPRITES.glowViolet = glowSprite('#a78bfa', [
    [0, 'rgba(167,139,250,0.5)'],
    [1, 'rgba(167,139,250,0)'],
  ]);
}

// Static backdrop: gradient + nebulae, painted once.
const bgCanvas = makeCanvas(W, H);
function buildBackground() {
  const g = bgCanvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0524');
  grad.addColorStop(0.55, '#0d062e');
  grad.addColorStop(1, '#160a3d');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const blob = (x, y, r, color) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  g.globalAlpha = 0.22;
  blob(180, 300, 280, '#c41c83');
  blob(720, 900, 320, '#2563eb');
  blob(420, 1180, 260, '#7c3aed');
  g.globalAlpha = 1;
}

buildSprites();
buildBackground();

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/* ---------------- state ---------------- */

const state = {
  mode: 'title', // title | playing | over
  score: 0,
  best: 0,
  lives: 3,
  level: 1,
  time: 0,
  elapsed: 0,
  shake: 0,
  flash: 0,
  shieldUntil: 0,
  spawnRock: 0,
  spawnStar: 0,
  spawnShield: 0,
};

const player = {
  x: W / 2,
  y: H - 210,
  vx: 0,
  vy: 0,
  r: 26,
  tx: W / 2,
  ty: H - 210,
  tilt: 0,
};

let rocks = [];
let stars = [];
let shields = [];
let particles = [];
let trail = [];
let bgStars = [];

/* Background starfield: three parallax layers. */
for (let layer = 0; layer < 3; layer++) {
  const count = layer === 0 ? 46 : layer === 1 ? 30 : 16;
  for (let i = 0; i < count; i++) {
    bgStars.push({
      x: rand(0, W),
      y: rand(0, H),
      r: rand(0.8, 1.4 + layer * 0.9),
      speed: 22 + layer * 34,
      tw: rand(0, TAU),
      layer,
    });
  }
}

/* ---------------- input ---------------- */

const keys = {};

function pointerTo(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  const cy = (e.touches ? e.touches[0].clientY : e.clientY);
  return {
    x: (cx - rect.left) * (W / rect.width),
    y: (cy - rect.top) * (H / rect.height),
  };
}

function onPointer(e) {
  if (state.mode !== 'playing') return;
  const p = pointerTo(e);
  player.tx = clamp(p.x, 40, W - 40);
  player.ty = clamp(p.y, 120, H - 60);
  e.preventDefault();
}

canvas.addEventListener('pointermove', onPointer);
canvas.addEventListener('pointerdown', onPointer);
canvas.addEventListener('touchmove', onPointer, { passive: false });

window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (e.key === 'r' || e.key === 'R') {
    if (state.mode === 'over') startGame();
  }
  if (e.key === 'Enter' || e.key === ' ') {
    if (state.mode === 'title') startGame();
    else if (state.mode === 'over') startGame();
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);

/* ---------------- spawning ---------------- */

function difficulty() {
  return 1 + state.elapsed * 0.045;
}

function spawnRock() {
  const d = difficulty();
  const r = rand(22, 52);
  rocks.push({
    x: rand(50, W - 50),
    y: -70,
    r,
    vy: rand(150, 240) * d,
    vx: rand(-40, 40),
    rot: rand(0, TAU),
    vr: rand(-1.6, 1.6),
    verts: makeRockVerts(r),
    hue: Math.random() < 0.5 ? 'magenta' : 'violet',
  });
}

function makeRockVerts(r) {
  const verts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * rand(0.72, 1.12);
    verts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return verts;
}

function spawnStar() {
  stars.push({
    x: rand(50, W - 50),
    y: -40,
    r: 20,
    vy: rand(130, 190),
    rot: rand(0, TAU),
    vr: rand(0.8, 2.2),
    pulse: rand(0, TAU),
  });
}

function spawnShield() {
  shields.push({
    x: rand(60, W - 60),
    y: -40,
    r: 24,
    vy: 150,
    pulse: rand(0, TAU),
  });
}

/* ---------------- effects ---------------- */

function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const s = rand(speed * 0.3, speed);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.35, 0.8),
      max: 0.8,
      r: rand(2, 6),
      color,
    });
  }
}

function toast(text, ms) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms || 1400);
}

/* ---------------- flow ---------------- */

function renderLives() {
  let html = '';
  for (let i = 0; i < 3; i++) {
    html += `<span class="heart${i < state.lives ? '' : ' lost'}">&#10084;</span>`;
  }
  livesEl.innerHTML = html;
}

function renderHud() {
  scoreEl.textContent = state.score;
  levelEl.textContent = 'LEVEL ' + state.level;
  renderLives();
}

function startGame() {
  state.mode = 'playing';
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.elapsed = 0;
  state.shake = 0;
  state.flash = 0;
  state.shieldUntil = 0;
  state.spawnRock = 0;
  state.spawnStar = 0;
  state.spawnShield = 9;
  rocks = [];
  stars = [];
  shields = [];
  particles = [];
  trail = [];
  player.x = W / 2;
  player.y = H - 210;
  player.tx = W / 2;
  player.ty = H - 210;
  player.vx = 0;
  player.vy = 0;
  startScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  renderHud();
  window.__gameState = state;
}

function gameOver() {
  state.mode = 'over';
  state.best = Math.max(state.best, state.score);
  finalScoreEl.textContent = state.score;
  bestLineEl.textContent = 'Best: ' + state.best;
  overScreen.classList.remove('hidden');
  burst(player.x, player.y, '#3ee6ff', 60, 420);
  burst(player.x, player.y, '#ff3d81', 40, 300);
  window.__gameState = state;
}

function loseLife() {
  if (state.elapsed < state.shieldUntil) {
    toast('SHIELD SAVED YOU');
    return;
  }
  state.lives -= 1;
  state.shake = 18;
  state.flash = 0.55;
  burst(player.x, player.y, '#ff3d81', 34, 380);
  renderHud();
  if (state.lives <= 0) {
    gameOver();
  } else {
    toast(state.lives === 2 ? '2 LIVES LEFT' : 'LAST LIFE!');
  }
}

/* ---------------- autopilot (demo recordings) ---------------- */

function autopilot(dt) {
  // Chase the lowest star (closest to the player) — stars fall
  // straight down, so lining up under it early always pays off —
  // dodge the nearest rock on a collision course, and drift back
  // to centre when the sky is clear.
  let target = null;
  for (const s of stars) {
    if (!target || s.y > target.y) target = s;
  }
  let tx = target ? target.x : W / 2;
  // Hold the low line and let the star fall to us; moving up
  // into the rock field is how runs end early.
  let ty = H - 210;

  for (const r of rocks) {
    const dy = r.y - player.y;
    if (dy > -260 && dy < 60) {
      const dx = r.x - player.x;
      if (Math.abs(dx) < r.r + 110) {
        tx = dx > 0 ? player.x - 190 : player.x + 190;
        ty = player.y;
      }
    }
  }
  player.tx = clamp(tx, 40, W - 40);
  player.ty = clamp(ty, 120, H - 60);
}

/* ---------------- update ---------------- */

function update(dt) {
  state.time += dt;
  if (state.mode === 'playing') {
    state.elapsed += dt;
    state.level = 1 + Math.floor(state.elapsed / 12);
  }

  // Background stars always drift, even on the title screen.
  for (const s of bgStars) {
    s.y += s.speed * dt;
    s.tw += dt * 2;
    if (s.y > H + 4) {
      s.y = -4;
      s.x = rand(0, W);
    }
  }

  if (state.mode !== 'playing') {
    updateParticles(dt);
    return;
  }

  // Keyboard steering.
  const kSpeed = 620;
  if (keys.ArrowLeft || keys.a) player.tx -= kSpeed * dt;
  if (keys.ArrowRight || keys.d) player.tx += kSpeed * dt;
  if (keys.ArrowUp || keys.w) player.ty -= kSpeed * dt;
  if (keys.ArrowDown || keys.s) player.ty += kSpeed * dt;
  player.tx = clamp(player.tx, 40, W - 40);
  player.ty = clamp(player.ty, 120, H - 60);

  if (AUTO) autopilot(dt);

  // Smooth chase toward the target point.
  const px = player.tx - player.x;
  const py = player.ty - player.y;
  player.vx = px * 10;
  player.vy = py * 10;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.tilt = clamp(player.vx * 0.00045, -0.45, 0.45);

  // Comet trail: a history of past positions, so the ribbon
  // always streams behind the direction of travel.
  trail.push({ x: player.x, y: player.y, life: 0.45, max: 0.45 });
  if (trail.length > 26) trail.shift();
  for (const t of trail) t.life -= dt;
  trail = trail.filter((t) => t.life > 0);

  // Spawning.
  const d = difficulty();
  state.spawnRock -= dt;
  if (state.spawnRock <= 0) {
    spawnRock();
    state.spawnRock = Math.max(0.28, 0.85 / d);
    if (Math.random() < 0.25 * d) spawnRock();
  }
  state.spawnStar -= dt;
  if (state.spawnStar <= 0) {
    spawnStar();
    state.spawnStar = rand(0.9, 1.7);
  }
  state.spawnShield -= dt;
  if (state.spawnShield <= 0) {
    spawnShield();
    state.spawnShield = rand(14, 20);
  }

  // Rocks.
  for (const r of rocks) {
    r.y += r.vy * dt;
    r.x += r.vx * dt + Math.sin(state.time * 1.7 + r.rot) * 14 * dt;
    r.rot += r.vr * dt;
    if (r.x < r.r) { r.x = r.r; r.vx = Math.abs(r.vx); }
    if (r.x > W - r.r) { r.x = W - r.r; r.vx = -Math.abs(r.vx); }
  }
  rocks = rocks.filter((r) => r.y < H + 90);

  // Stars.
  for (const s of stars) {
    s.y += s.vy * dt;
    s.rot += s.vr * dt;
    s.pulse += dt * 5;
  }
  stars = stars.filter((s) => s.y < H + 50);

  // Shields.
  for (const s of shields) {
    s.y += s.vy * dt;
    s.pulse += dt * 5;
  }
  shields = shields.filter((s) => s.y < H + 50);

  // Collisions with rocks.
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    const rr = r.r * 0.86 + player.r * 0.72;
    if (dist2(r.x, r.y, player.x, player.y) < rr * rr) {
      rocks.splice(i, 1);
      burst(r.x, r.y, '#b06cff', 22, 300);
      loseLife();
      if (state.mode !== 'playing') return;
    }
  }

  // Picking up stars.
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    const rr = s.r + player.r * 0.8;
    if (dist2(s.x, s.y, player.x, player.y) < rr * rr) {
      stars.splice(i, 1);
      state.score += 10;
      burst(s.x, s.y, '#ffd75e', 14, 220);
      renderHud();
    }
  }

  // Picking up shields.
  for (let i = shields.length - 1; i >= 0; i--) {
    const s = shields[i];
    const rr = s.r + player.r * 0.8;
    if (dist2(s.x, s.y, player.x, player.y) < rr * rr) {
      shields.splice(i, 1);
      state.shieldUntil = state.elapsed + 6;
      toast('SHIELD 6s');
      burst(s.x, s.y, '#3ee6ff', 18, 260);
    }
  }

  updateParticles(dt);

  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.8);
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

/* ---------------- drawing ---------------- */

function drawBackground() {
  // Static gradient + nebulae, painted once at load.
  ctx.drawImage(bgCanvas, 0, 0);

  // Parallax starfield.
  for (const s of bgStars) {
    const a = 0.35 + 0.4 * Math.abs(Math.sin(s.tw));
    ctx.globalAlpha = a;
    ctx.fillStyle = s.layer === 2 ? '#cfe9ff' : '#8f86c9';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStarShape(x, y, r, rot) {
  // Pre-rendered star sprite: rotate + scale, no per-frame blur.
  const size = r * 3.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(SPRITES.star, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawRock(r) {
  // Cheap glow: blit a pre-rendered radial sprite, then the rock
  // polygon on top. No shadowBlur anywhere in the hot path.
  const glowSize = r.r * 3.4;
  ctx.drawImage(
    r.hue === 'magenta' ? SPRITES.glowMagenta : SPRITES.glowViolet,
    r.x - glowSize / 2, r.y - glowSize / 2, glowSize, glowSize,
  );
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.rot);
  const edge = r.hue === 'magenta' ? '#ff5ea8' : '#a78bfa';
  const fill = r.hue === 'magenta' ? '#3d0f2e' : '#241a4d';
  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  r.verts.forEach(([vx, vy], i) => {
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Crater dots.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.arc(-r.r * 0.25, -r.r * 0.1, r.r * 0.2, 0, TAU);
  ctx.arc(r.r * 0.3, r.r * 0.28, r.r * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  // Trail ribbon: shrinking dots along the path just flown.
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const a = (t.life / t.max) * 0.5 * (i / trail.length);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#3ee6ff';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 10 * (i / trail.length) + 2, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Shield ring.
  if (state.elapsed < state.shieldUntil) {
    ctx.save();
    ctx.strokeStyle = 'rgba(62,230,255,0.85)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#3ee6ff';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 52 + Math.sin(state.time * 6) * 4, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.tilt);

  // Glow halo: pre-rendered sprite, no per-frame gradient.
  ctx.drawImage(SPRITES.halo, -75, -75, 150, 150);

  // Comet head: a bright core with a swept tail fin.
  const body = ctx.createLinearGradient(-32, 0, 32, 0);
  body.addColorStop(0, '#0e7490');
  body.addColorStop(0.55, '#22d3ee');
  body.addColorStop(1, '#ffffff');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.quadraticCurveTo(8, -29, -30, -10);
  ctx.quadraticCurveTo(-15, 0, -30, 10);
  ctx.quadraticCurveTo(8, 29, 32, 0);
  ctx.closePath();
  ctx.fill();

  // Core sparkle.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(10, -2, 7, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function draw() {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  }

  drawBackground();

  for (const s of stars) {
    const pulse = 1 + Math.sin(s.pulse) * 0.12;
    drawStarShape(s.x, s.y, s.r * pulse, s.rot);
  }

  for (const s of shields) {
    const pulse = 1 + Math.sin(s.pulse) * 0.15;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.strokeStyle = '#3ee6ff';
    ctx.fillStyle = 'rgba(62,230,255,0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, s.r * pulse, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(62,230,255,0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, s.r * pulse + 6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#eafcff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 1);
    ctx.restore();
  }

  for (const r of rocks) drawRock(r);

  if (state.mode !== 'over') drawPlayer();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Damage flash.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,45,85,${state.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------------- main loop ---------------- */

let last = performance.now();
let frames = 0;
let fpsTime = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();

  frames += 1;
  fpsTime += dt;
  if (fpsTime >= 1) {
    if (DEMO) fpsEl.textContent = frames + ' FPS';
    frames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(loop);
}

renderHud();
window.__gameState = state;
window.__ready = true;
if (AUTO || DEMO) {
  startGame();
}
// Frame-stepped recording mode: no rAF loop; the recorder drives
// one fixed step per captured frame via window.__frame(dt).
if (STEP) {
  window.__frame = (dt) => {
    update(dt);
    draw();
  };
} else {
  requestAnimationFrame(loop);
}
