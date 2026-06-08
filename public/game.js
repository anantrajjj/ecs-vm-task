'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  W: 480, H: 580,
  PADDLE_H: 10,
  PADDLE_RADIUS: 4,
  BALL_RADIUS: 7,
  BRICK_ROWS: 7,
  BRICK_COLS: 10,
  BRICK_GAP: 2,
  BRICK_H: 18,
  BRICK_TOP: 48,
  PARTICLE_LIFE: 0.4,
  POWERUP_SPEED: 90,
  TRAIL_LEN: 5,
  MAX_PARTICLES: 100,
  COMBO_WINDOW_MS: 700,
  MAX_COMBO: 8,
  SPEED_BONUS_PER_LEVEL: 8,   // added to base speed each cleared level
  EFFECT_WARN_SECS: 3,         // seconds before expiry to show warning
  COLORS: {
    bg:             '#f5f0e8',
    accent:         '#c0392b',
    paddle:         '#1a1a2e',
    paddleWarn:     '#c0392b',  // paddle tint when effect about to expire
    brickA:         '#2c5f8a',
    brickB:         '#6b3d9a',
    brickStrong:    '#1a6b3d',
    brickStrongHit: '#3a8a5a',
    brickInert:     '#8a8a9a',
    brickInertLine: 'rgba(0,0,0,0.12)',
    powerup:        '#c87000',
    powerupText:    '#f5f0e8',
    laser:          '#c0392b',
    comboText:      '#c0392b',
    effectBar:      '#c0392b',
    effectBarBg:    'rgba(0,0,0,0.12)',
  },
};

const BRICK_W = (C.W - C.BRICK_GAP * (C.BRICK_COLS + 1)) / C.BRICK_COLS;
const POWERUP_TYPES = ['wide', 'multi', 'slow', 'laser'];
const POWERUP_DROP_CHANCE = 0.12;
const EFFECT_DURATIONS = { wide: 10, slow: 8, laser: 6 };

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO  (Web Audio API — created lazily on first user gesture)
// ─────────────────────────────────────────────────────────────────────────────
let _audioCtx = null;

function audioCtx() {
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) _audioCtx = new Ctx();
  }
  if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function beep(freq, dur, vol = 0.12, type = 'square') {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.01);
  } catch (_) {}
}

const SFX = {
  paddle:     ()      => beep(200, 0.04, 0.10, 'square'),
  brick:      (type)  => beep(260 + type * 70, 0.07, 0.12, 'square'),
  brickBreak: (type)  => beep(220 + type * 90, 0.10, 0.16, 'square'),
  powerup:    ()      => beep(660, 0.14, 0.10, 'sine'),
  lifeLost:   ()      => { beep(160, 0.14, 0.18, 'sawtooth'); setTimeout(() => beep(110, 0.22, 0.14, 'sawtooth'), 140); },
  gameOver:   ()      => { [200, 175, 150, 120].forEach((f, i) => setTimeout(() => beep(f, 0.14, 0.18, 'sawtooth'), i * 140)); },
  levelDone:  ()      => { [380, 480, 580, 760].forEach((f, i) => setTimeout(() => beep(f, 0.10, 0.11, 'sine'), i * 75)); },
};

// ─────────────────────────────────────────────────────────────────────────────
// LEVELS  (0=empty 1=standard 2=mid 3=strong/2-hit 4=indestructible)
// ─────────────────────────────────────────────────────────────────────────────
const LEVELS = [
  { speed: 220, paddleW: 90, grid: [
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ]},
  { speed: 240, paddleW: 86, grid: [
    [1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,2,1],
    [1,2,1,0,0,0,0,1,2,1],
    [1,2,2,2,2,2,2,2,2,1],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ]},
  { speed: 255, paddleW: 82, grid: [
    [2,2,2,2,2,2,2,2,2,2],
    [2,3,3,3,3,3,3,3,3,2],
    [1,3,1,1,1,1,1,1,3,1],
    [1,3,1,0,0,0,0,1,3,1],
    [1,3,3,3,3,3,3,3,3,1],
    [1,1,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,0,0],
  ]},
  { speed: 268, paddleW: 78, grid: [
    [1,1,1,1,1,1,1,1,1,1],
    [1,4,2,2,2,2,2,2,4,1],
    [2,4,2,3,3,3,3,2,4,2],
    [2,4,2,3,0,0,3,2,4,2],
    [2,4,2,2,2,2,2,2,4,2],
    [1,4,1,1,1,1,1,1,4,1],
    [1,1,1,1,1,1,1,1,1,1],
  ]},
  { speed: 280, paddleW: 74, grid: [
    [1,0,1,0,1,0,1,0,1,0],
    [0,2,0,2,0,2,0,2,0,2],
    [3,0,3,0,3,0,3,0,3,0],
    [0,3,0,3,0,3,0,3,0,3],
    [2,0,2,0,2,0,2,0,2,0],
    [0,1,0,1,0,1,0,1,0,1],
    [1,0,1,0,1,0,1,0,1,0],
  ]},
  { speed: 295, paddleW: 70, grid: [
    [1,1,1,1,0,0,1,1,1,1],
    [1,4,4,1,0,0,1,4,4,1],
    [1,4,3,1,0,0,1,3,4,1],
    [1,4,3,2,2,2,2,3,4,1],
    [1,4,3,1,0,0,1,3,4,1],
    [1,4,4,1,0,0,1,4,4,1],
    [1,1,1,1,0,0,1,1,1,1],
  ]},
  { speed: 310, paddleW: 66, grid: [
    [3,3,3,3,3,3,3,3,3,3],
    [3,2,2,2,2,2,2,2,2,3],
    [3,2,4,4,4,4,4,4,2,3],
    [3,2,4,3,3,3,3,4,2,3],
    [3,2,4,3,2,2,3,4,2,3],
    [3,2,2,2,2,2,2,2,2,3],
    [3,3,3,3,3,3,3,3,3,3],
  ]},
  { speed: 330, paddleW: 62, grid: [
    [4,3,3,3,3,3,3,3,3,4],
    [3,2,2,2,2,2,2,2,2,3],
    [3,2,4,3,3,3,3,4,2,3],
    [3,2,3,4,2,2,4,3,2,3],
    [3,2,4,3,3,3,3,4,2,3],
    [3,2,2,2,2,2,2,2,2,3],
    [4,3,3,3,3,3,3,3,3,4],
  ]},
  { speed: 350, paddleW: 58, grid: [
    [3,3,3,3,3,3,3,3,3,3],
    [3,0,0,0,0,0,0,0,0,3],
    [3,0,2,2,2,2,2,2,0,3],
    [3,0,2,4,0,0,4,2,0,3],
    [3,0,2,2,2,2,2,2,0,3],
    [3,0,0,0,0,0,0,0,0,3],
    [3,3,3,3,3,3,3,3,3,3],
  ]},
  { speed: 375, paddleW: 54, grid: [
    [3,2,3,2,3,2,3,2,3,2],
    [2,3,4,3,2,3,4,3,2,3],
    [3,4,3,3,3,3,3,3,4,3],
    [2,3,3,4,3,3,4,3,3,2],
    [3,4,3,3,3,3,3,3,4,3],
    [2,3,4,3,2,3,4,3,2,3],
    [3,2,3,2,3,2,3,2,3,2],
  ]},
];

// ─────────────────────────────────────────────────────────────────────────────
// ENTITIES
// ─────────────────────────────────────────────────────────────────────────────
class Ball {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = C.BALL_RADIUS;
    this.trail = [];
    this.onPaddle = false;
    this.dead = false;
  }

  update(dt) {
    if (this.onPaddle) return;
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > C.TRAIL_LEN) this.trail.length = C.TRAIL_LEN;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  setSpeed(speed) {
    const cur = Math.hypot(this.vx, this.vy);
    if (cur < 0.001) return;
    const r = speed / cur;
    this.vx *= r; this.vy *= r;
  }
}

class Paddle {
  constructor(cx, w) {
    this.x = cx;
    this.y = C.H - 36;
    this.w = w;
    this.h = C.PADDLE_H;
    this.targetX = cx;
  }

  update() {
    this.x = Math.max(this.w / 2, Math.min(C.W - this.w / 2, this.targetX));
  }
}

class Brick {
  constructor(col, row, type) {
    this.x = C.BRICK_GAP + col * (BRICK_W + C.BRICK_GAP) + BRICK_W / 2;
    this.y = C.BRICK_TOP + row * (C.BRICK_H + C.BRICK_GAP) + C.BRICK_H / 2;
    this.w = BRICK_W;
    this.h = C.BRICK_H;
    this.type = type;
    this.indestructible = type === 4;
    this.maxHits  = type === 3 ? 2 : 1;
    this.hitsLeft = this.maxHits;
    this.alive = true;
    this.hasPowerup = !this.indestructible && Math.random() < POWERUP_DROP_CHANCE;
  }

  hit() {
    if (this.indestructible) return false;
    this.hitsLeft--;
    if (this.hitsLeft <= 0) { this.alive = false; return true; }
    return false;
  }

  color() {
    if (this.indestructible)  return C.COLORS.brickInert;
    if (this.type === 3)      return this.hitsLeft === 2 ? C.COLORS.brickStrong : C.COLORS.brickStrongHit;
    if (this.type === 2)      return C.COLORS.brickB;
    return C.COLORS.brickA;
  }

  points() { return this.type * 10; }
}

class Particle {
  constructor(x, y, vx, vy, color) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = C.PARTICLE_LIFE;
    this.maxLife = C.PARTICLE_LIFE;
    this.size = 3 + Math.random() * 3;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.vy += 200 * dt;
    this.life -= dt;
  }

  get alive() { return this.life > 0; }
  get alpha() { return Math.max(0, this.life / this.maxLife); }
}

class Powerup {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.w = 14; this.h = 14;
    this.vy = C.POWERUP_SPEED;
    this.alive = true;
  }

  update(dt) {
    this.y += this.vy * dt;
    if (this.y > C.H + 20) this.alive = false;
  }

  label() { return { wide:'W', multi:'M', slow:'S', laser:'L' }[this.type]; }
}

class LaserBeam {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vy = -720;
    this.alive = true;
  }

  update(dt) {
    this.y += this.vy * dt;
    if (this.y < -10) this.alive = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSSHATCH PRE-RENDER  (OffscreenCanvas per brick size — drawn once)
// ─────────────────────────────────────────────────────────────────────────────
const _crosshatchCache = new Map();

function getInertPattern(w, h) {
  const key = `${w}|${h}`;
  if (_crosshatchCache.has(key)) return _crosshatchCache.get(key);

  const oc  = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const octx = oc.getContext('2d');
  octx.fillStyle = C.COLORS.brickInert;
  octx.fillRect(0, 0, w, h);
  octx.strokeStyle = C.COLORS.brickInertLine;
  octx.lineWidth = 1;
  for (let i = -h; i < w + h; i += 7) {
    octx.beginPath();
    octx.moveTo(i, 0);
    octx.lineTo(i - h, h);
    octx.stroke();
  }
  _crosshatchCache.set(key, oc);
  return oc;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLLISION
// ─────────────────────────────────────────────────────────────────────────────
function ballOverlapsBrick(ball, brick) {
  const hw = brick.w / 2, hh = brick.h / 2;
  const cx = Math.max(brick.x - hw, Math.min(ball.x, brick.x + hw));
  const cy = Math.max(brick.y - hh, Math.min(ball.y, brick.y + hh));
  const dx = ball.x - cx, dy = ball.y - cy;
  return dx * dx + dy * dy < ball.r * ball.r;
}

function resolveCollisionAxis(ball, brick) {
  const hw = brick.w / 2 + ball.r;
  const hh = brick.h / 2 + ball.r;
  const ox  = hw - Math.abs(ball.x - brick.x);
  const oy  = hh - Math.abs(ball.y - brick.y);
  if (ox < oy) {
    ball.vx = ball.x < brick.x ? -Math.abs(ball.vx) : Math.abs(ball.vx);
    ball.x += ball.vx > 0 ? ox : -ox;
  } else {
    ball.vy = ball.y < brick.y ? -Math.abs(ball.vy) : Math.abs(ball.vy);
    ball.y += ball.vy > 0 ? oy : -oy;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLES
// ─────────────────────────────────────────────────────────────────────────────
function spawnBrickParticles(particles, brick) {
  const count = 7;
  const color = brick.color();
  for (let i = 0; i < count; i++) {
    if (particles.length >= C.MAX_PARTICLES) break;
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.6;
    const speed = 55 + Math.random() * 95;
    particles.push(new Particle(
      brick.x, brick.y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 30,
      color,
    ));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  phase: 'start',
  levelIdx: 0,
  score: 0,
  lives: 3,
  best: parseInt(localStorage.getItem('bb_best') || '0', 10),
  speedBonus: 0,       // accumulates as levels are cleared

  paddle: null,
  balls: [],
  bricks: [],
  particles: [],
  powerups: [],
  lasers: [],

  effects: { wide: 0, slow: 0, laser: 0 },
  laserFireTimer: 0,

  comboCount: 0,
  lastHitMs: 0,
  comboDisplay: { count: 0, timer: 0 },  // for on-canvas combo text

  keys: { left: false, right: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL INIT
// ─────────────────────────────────────────────────────────────────────────────
function buildBricks(levelIdx) {
  const lvl = LEVELS[levelIdx % LEVELS.length];
  const bricks = [];
  for (let r = 0; r < C.BRICK_ROWS; r++) {
    for (let c = 0; c < C.BRICK_COLS; c++) {
      const t = (lvl.grid[r] || [])[c] || 0;
      if (t > 0) bricks.push(new Brick(c, r, t));
    }
  }
  return bricks;
}

function levelSpeed(levelIdx) {
  return LEVELS[levelIdx % LEVELS.length].speed + state.speedBonus;
}

function attachBallToPaddle(paddle, speed) {
  const angle = -Math.PI / 2 + (Math.random() * 0.3 - 0.15);
  const ball = new Ball(
    paddle.x,
    paddle.y - paddle.h / 2 - C.BALL_RADIUS - 1,
    Math.cos(angle) * speed,
    Math.sin(angle) * speed,
  );
  ball.onPaddle = true;
  return ball;
}

function initLevel(levelIdx) {
  const lvl = LEVELS[levelIdx % LEVELS.length];
  const pw = state.effects.wide > 0 ? lvl.paddleW * 1.5 : lvl.paddleW;

  if (!state.paddle) {
    state.paddle = new Paddle(C.W / 2, pw);
  } else {
    state.paddle.w = pw;
    state.paddle.targetX = C.W / 2;
    state.paddle.x = C.W / 2;
  }

  state.bricks = buildBricks(levelIdx);
  state.balls   = [attachBallToPaddle(state.paddle, levelSpeed(levelIdx))];
  state.particles = [];
  state.powerups  = [];
  state.lasers    = [];
  state.laserFireTimer = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// POWERUP APPLICATION
// ─────────────────────────────────────────────────────────────────────────────
function applyPowerup(pu) {
  const lvl = LEVELS[state.levelIdx % LEVELS.length];
  SFX.powerup();
  switch (pu.type) {
    case 'wide':
      state.effects.wide = EFFECT_DURATIONS.wide;
      state.paddle.w = lvl.paddleW * 1.5;
      break;
    case 'slow':
      state.effects.slow = EFFECT_DURATIONS.slow;
      break;
    case 'laser':
      state.effects.laser = EFFECT_DURATIONS.laser;
      break;
    case 'multi': {
      const live = state.balls.filter(b => !b.onPaddle);
      const src  = live[0] || state.balls[0];
      if (!src) break;
      const baseAngle = Math.atan2(src.vy, src.vx);
      const spd = Math.hypot(src.vx, src.vy);
      [-0.38, 0.38].forEach(offset => {
        const nb = new Ball(src.x, src.y,
          Math.cos(baseAngle + offset) * spd,
          Math.sin(baseAngle + offset) * spd);
        nb.onPaddle = false;
        state.balls.push(nb);
      });
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────────────────────
function scoreHit(brick) {
  const now = Date.now();
  if (now - state.lastHitMs < C.COMBO_WINDOW_MS) {
    state.comboCount = Math.min(state.comboCount + 1, C.MAX_COMBO);
  } else {
    state.comboCount = 1;
  }
  state.lastHitMs = now;

  const points = brick.points() * state.comboCount;
  state.score  += points;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('bb_best', state.best);
  }

  if (state.comboCount > 1) {
    state.comboDisplay.count = state.comboCount;
    state.comboDisplay.timer = 1.2;
  }

  updateHUD();
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state.phase !== 'playing') return;

  const lvl    = LEVELS[state.levelIdx % LEVELS.length];
  const paddle = state.paddle;
  const spd    = state.effects.slow > 0
    ? levelSpeed(state.levelIdx) * 0.55
    : levelSpeed(state.levelIdx);

  // ── effect timers ──────────────────────────────────────────────────────────
  for (const k of ['wide', 'slow', 'laser']) {
    if (state.effects[k] > 0) {
      state.effects[k] -= dt;
      if (state.effects[k] <= 0) {
        state.effects[k] = 0;
        if (k === 'wide') paddle.w = lvl.paddleW;
      }
    }
  }

  // ── combo display decay ────────────────────────────────────────────────────
  if (state.comboDisplay.timer > 0) {
    state.comboDisplay.timer -= dt;
  }

  // ── keyboard paddle ────────────────────────────────────────────────────────
  if (state.keys.left)  paddle.targetX -= 400 * dt;
  if (state.keys.right) paddle.targetX += 400 * dt;
  paddle.update();

  // ── laser fire ────────────────────────────────────────────────────────────
  if (state.effects.laser > 0) {
    state.laserFireTimer -= dt;
    if (state.laserFireTimer <= 0) {
      state.laserFireTimer = 0.22;
      // beams spawn from the inner edges of the paddle face
      const beamInset = 6;
      state.lasers.push(
        new LaserBeam(paddle.x - paddle.w / 2 + beamInset, paddle.y - paddle.h / 2),
        new LaserBeam(paddle.x + paddle.w / 2 - beamInset, paddle.y - paddle.h / 2),
      );
    }
  }

  for (const lb of state.lasers) {
    lb.update(dt);
    if (!lb.alive) continue;
    for (const brick of state.bricks) {
      if (!brick.alive || brick.indestructible) continue;
      if (lb.x >= brick.x - brick.w / 2 && lb.x <= brick.x + brick.w / 2 &&
          lb.y >= brick.y - brick.h / 2 && lb.y <= brick.y + brick.h / 2) {
        lb.alive = false;
        const destroyed = brick.hit();
        if (destroyed) {
          scoreHit(brick);
          spawnBrickParticles(state.particles, brick);
          if (brick.hasPowerup) spawnPowerup(brick);
          SFX.brickBreak(brick.type);
        } else {
          SFX.brick(brick.type);
        }
      }
    }
  }
  state.lasers = state.lasers.filter(lb => lb.alive);

  // ── balls ──────────────────────────────────────────────────────────────────
  for (const ball of state.balls) {
    if (ball.onPaddle) {
      ball.x = paddle.x;
      ball.y = paddle.y - paddle.h / 2 - ball.r - 1;
      continue;
    }

    ball.setSpeed(spd);
    ball.update(dt);

    // wall
    if (ball.x - ball.r < 0)   { ball.x = ball.r;       ball.vx =  Math.abs(ball.vx); }
    if (ball.x + ball.r > C.W) { ball.x = C.W - ball.r; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - ball.r < 0)   { ball.y = ball.r;        ball.vy =  Math.abs(ball.vy); }

    // paddle
    const phw = paddle.w / 2, phh = paddle.h / 2;
    if (ball.vy > 0 &&
        ball.y + ball.r >= paddle.y - phh &&
        ball.y - ball.r <= paddle.y + phh &&
        ball.x + ball.r >= paddle.x - phw &&
        ball.x - ball.r <= paddle.x + phw) {
      const rel   = Math.max(-1, Math.min(1, (ball.x - paddle.x) / phw));
      const angle = rel * (65 * Math.PI / 180) - Math.PI / 2;
      ball.vx = Math.cos(angle) * spd;
      ball.vy = -Math.abs(Math.sin(angle) * spd);
      ball.y  = paddle.y - phh - ball.r - 0.5;
      SFX.paddle();
    }

    // bricks
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      if (ballOverlapsBrick(ball, brick)) {
        resolveCollisionAxis(ball, brick);
        const destroyed = brick.hit();
        if (destroyed) {
          scoreHit(brick);
          spawnBrickParticles(state.particles, brick);
          if (brick.hasPowerup) spawnPowerup(brick);
          SFX.brickBreak(brick.type);
        } else {
          SFX.brick(brick.type);
        }
      }
    }

    if (ball.y - ball.r > C.H + 10) ball.dead = true;
  }

  state.balls = state.balls.filter(b => !b.dead);

  if (state.balls.length === 0) {
    state.lives--;
    SFX.lifeLost();
    updateHUD();
    if (state.lives <= 0) { triggerGameOver(); return; }
    state.balls = [attachBallToPaddle(paddle, levelSpeed(state.levelIdx))];
  }

  // ── powerups ───────────────────────────────────────────────────────────────
  for (const pu of state.powerups) {
    pu.update(dt);
    if (!pu.alive) continue;
    const phw = paddle.w / 2, phh = paddle.h / 2;
    if (pu.y + pu.h / 2 >= paddle.y - phh &&
        pu.y - pu.h / 2 <= paddle.y + phh &&
        pu.x + pu.w / 2 >= paddle.x - phw &&
        pu.x - pu.w / 2 <= paddle.x + phw) {
      applyPowerup(pu);
      pu.alive = false;
    }
  }
  state.powerups = state.powerups.filter(p => p.alive);

  // ── particles ──────────────────────────────────────────────────────────────
  for (const p of state.particles) p.update(dt);
  state.particles = state.particles.filter(p => p.alive);

  // ── level complete? ────────────────────────────────────────────────────────
  if (state.bricks.filter(b => b.alive && !b.indestructible).length === 0) {
    triggerLevelComplete();
  }
}

function spawnPowerup(brick) {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  state.powerups.push(new Powerup(brick.x, brick.y, type));
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERER
// ─────────────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawBricks() {
  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    const bx = brick.x - brick.w / 2;
    const by = brick.y - brick.h / 2;
    if (brick.indestructible) {
      ctx.drawImage(getInertPattern(brick.w, brick.h), bx, by);
    } else {
      ctx.fillStyle = brick.color();
      ctx.fillRect(bx, by, brick.w, brick.h);
    }
  }
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawPowerups() {
  ctx.save();
  ctx.font = 'bold 9px "IBM Plex Mono", monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  for (const pu of state.powerups) {
    ctx.save();
    ctx.translate(pu.x, pu.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = C.COLORS.powerup;
    ctx.fillRect(-pu.w / 2, -pu.h / 2, pu.w, pu.h);
    ctx.restore();
    ctx.fillStyle = C.COLORS.powerupText;
    ctx.fillText(pu.label(), pu.x, pu.y);
  }
  ctx.restore();
}

function drawLasers() {
  ctx.strokeStyle = C.COLORS.laser;
  ctx.lineWidth   = 2;
  for (const lb of state.lasers) {
    ctx.beginPath();
    ctx.moveTo(lb.x, lb.y);
    ctx.lineTo(lb.x, lb.y - 16);
    ctx.stroke();
  }
}

function drawBalls() {
  for (const ball of state.balls) {
    // trail — linear opacity from 0 (oldest) to 0.28 (newest ghost)
    for (let i = ball.trail.length - 1; i >= 0; i--) {
      const t = ball.trail[i];
      ctx.globalAlpha = (1 - i / ball.trail.length) * 0.28;
      ctx.fillStyle   = C.COLORS.accent;
      ctx.beginPath();
      ctx.arc(t.x, t.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle   = C.COLORS.accent;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPaddle() {
  const p = state.paddle;

  // expiry warning — pulse paddle color when any effect < EFFECT_WARN_SECS
  const anyExpiring = Object.entries(state.effects).some(([, v]) => v > 0 && v < C.EFFECT_WARN_SECS);
  const warnPulse   = anyExpiring && Math.floor(performance.now() / 300) % 2 === 0;

  ctx.fillStyle = warnPulse ? C.COLORS.paddleWarn : C.COLORS.paddle;
  roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, C.PADDLE_RADIUS);
  ctx.fill();

  // effect timer bars drawn directly above the paddle
  const activeEffects = Object.entries(state.effects).filter(([, v]) => v > 0);
  if (activeEffects.length) {
    const barH = 3, barGap = 3;
    const totalBarsH = activeEffects.length * (barH + barGap);
    activeEffects.forEach(([k, remaining], i) => {
      const maxDur  = EFFECT_DURATIONS[k];
      const ratio   = Math.max(0, Math.min(1, remaining / maxDur));
      const barW    = p.w;
      const bx      = p.x - p.w / 2;
      const by      = p.y - p.h / 2 - totalBarsH + i * (barH + barGap);
      ctx.fillStyle = C.COLORS.effectBarBg;
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = remaining < C.EFFECT_WARN_SECS ? C.COLORS.paddleWarn : C.COLORS.effectBar;
      ctx.fillRect(bx, by, barW * ratio, barH);
    });
  }

  // effect labels
  const active = activeEffects.map(([k]) => k[0].toUpperCase()).join('');
  if (active) {
    ctx.fillStyle    = warnPulse ? '#f5f0e8' : '#f5f0e8';
    ctx.font         = '8px "IBM Plex Mono", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(active, p.x, p.y);
  }
}

function drawCombo() {
  if (state.comboDisplay.timer <= 0 || state.comboDisplay.count < 2) return;
  const alpha = Math.min(1, state.comboDisplay.timer / 0.4);
  ctx.globalAlpha  = alpha;
  ctx.fillStyle    = C.COLORS.comboText;
  ctx.font         = 'bold 14px "IBM Plex Mono", monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`×${state.comboDisplay.count}`, C.W / 2, C.H / 2);
  ctx.globalAlpha  = 1;
}

function render() {
  ctx.fillStyle = C.COLORS.bg;
  ctx.fillRect(0, 0, C.W, C.H);

  if (state.phase === 'start' || state.phase === 'gameover') return;

  drawBricks();
  drawParticles();
  drawPowerups();
  drawLasers();
  drawBalls();
  drawPaddle();
  drawCombo();
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME LOOP
// ─────────────────────────────────────────────────────────────────────────────
let rafId  = null;
let lastTs = 0;

function loop(ts) {
  // Clamp dt — prevents ball teleporting after tab switch or long pause
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  update(dt);
  render();
  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  lastTs = performance.now();
  rafId  = requestAnimationFrame(loop);
}

// Reset lastTs when tab regains focus so the first frame dt = 0
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastTs = performance.now();
});

// ─────────────────────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score-val').textContent = state.score;
  document.getElementById('level-val').textContent = (state.levelIdx % LEVELS.length) + 1;
  document.getElementById('best-val').textContent  = state.best;
  document.getElementById('start-best').textContent = state.best;
  const filled = Math.max(0, state.lives);
  const empty  = Math.max(0, 3 - filled);
  document.getElementById('lives-display').textContent = '●'.repeat(filled) + '○'.repeat(empty);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
  if (id) document.getElementById(id).classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────
function startGame() {
  state.phase      = 'playing';
  state.levelIdx   = 0;
  state.score      = 0;
  state.lives      = 3;
  state.speedBonus = 0;
  state.effects    = { wide: 0, slow: 0, laser: 0 };
  state.comboCount = 0;
  state.comboDisplay = { count: 0, timer: 0 };
  state.paddle     = null;
  initLevel(0);
  showOverlay(null);
  updateHUD();
  startLoop();
}

function launchBall() {
  const ball = state.balls.find(b => b.onPaddle);
  if (ball) ball.onPaddle = false;
}

function pause() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  showOverlay('screen-pause');
}

function resume() {
  if (state.phase !== 'paused') return;
  state.phase = 'playing';
  lastTs = performance.now();
  showOverlay(null);
}

function advanceLevel() {
  if (state.phase !== 'levelcomplete') return;
  document.getElementById('level-complete').classList.remove('show');
  state.levelIdx++;
  state.speedBonus += C.SPEED_BONUS_PER_LEVEL;
  state.effects = { wide: 0, slow: 0, laser: 0 };
  initLevel(state.levelIdx);
  updateHUD();
  state.phase = 'playing';
  lastTs = performance.now();
}

function triggerGameOver() {
  state.phase = 'gameover';
  SFX.gameOver();
  document.getElementById('go-score').textContent = state.score;
  document.getElementById('go-best').textContent  = state.best;
  showOverlay('screen-gameover');
}

function triggerLevelComplete() {
  if (state.phase === 'levelcomplete') return;
  state.phase = 'levelcomplete';
  SFX.levelDone();
  const nextNum = (state.levelIdx % LEVELS.length) + 2;
  document.getElementById('lc-text').textContent = 'LEVEL ' + nextNum;
  document.getElementById('level-complete').classList.add('show');
  // Player must press Space / click / tap to continue
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft')  { state.keys.left  = true; e.preventDefault(); }
  if (e.code === 'ArrowRight') { state.keys.right = true; e.preventDefault(); }
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.phase === 'levelcomplete')     { advanceLevel(); return; }
    if (state.phase === 'playing') {
      if (state.balls.some(b => b.onPaddle)) { launchBall(); return; }
      pause();
    } else if (state.phase === 'paused') {
      resume();
    }
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft')  state.keys.left  = false;
  if (e.code === 'ArrowRight') state.keys.right = false;
});

canvas.addEventListener('mousemove', e => {
  if (!state.paddle) return;
  const rect   = canvas.getBoundingClientRect();
  const scaleX = C.W / rect.width;
  state.paddle.targetX = (e.clientX - rect.left) * scaleX;
});

canvas.addEventListener('click', () => {
  if (state.phase === 'levelcomplete') { advanceLevel(); return; }
  if (state.phase === 'playing')       launchBall();
});

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!state.paddle) return;
  const rect   = canvas.getBoundingClientRect();
  const scaleX = C.W / rect.width;
  state.paddle.targetX = (e.touches[0].clientX - rect.left) * scaleX;
}, { passive: false });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state.phase === 'levelcomplete') { advanceLevel(); return; }
  if (state.phase === 'playing')       launchBall();
}, { passive: false });

// Buttons
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', resume);
document.getElementById('btn-restart').addEventListener('click', startGame);

// Level-complete overlay — listeners must be here, not on canvas, because
// #level-complete sits on top of canvas as a sibling; clicks bubble up, never sideways to canvas
document.getElementById('level-complete').addEventListener('click', advanceLevel);
document.getElementById('level-complete').addEventListener('touchstart', e => {
  e.preventDefault();
  advanceLevel();
}, { passive: false });

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
updateHUD();
render();
startLoop();
