/**
 * canvas_mouth.js — Mouth-morph stellar background
 *
 * Drop-in replacement for canvas.js.
 * Exposes window.AstroCanvas with the same API:
 *   init(refs)          — boot the canvas (call once on DOMContentLoaded)
 *   startTransition()   — trigger the white-flash reveal sequence
 *   enableFooter()      — re-activate canvas when apply-footer is visible
 *   disableFooter()     — hide canvas when apply-footer leaves viewport
 */
(function () {
  'use strict';

  // ── DOM refs (injected via init) ─────────────────────────────────────────────
  let canvas, ctx, whiteFlashEl, heroEl, contentEl, navEl, sideDotsEl;

  // ── Shared state ─────────────────────────────────────────────────────────────
  let W, H, cx, cy, maxDist;
  let time = 0, stars = [];
  let footerVisible = false;
  let transitioning = false, transitionScrolled = false;
  let transitionStart = 0;
  let shockwave = null;
  const TRANSITION_DURATION = 180;   // frames for the white-flash reveal (triggered by startTransition)

  // ── STATE MACHINE ─────────────────────────────────────────────────────────────
  // 'idle'  →  auto-start  →  'morphing'  →  done  →  'face'
  let state         = 'idle';
  let morphStart    = 0;
  let biteStartTime = -1;

  // ── MORPH SPEED ───────────────────────────────────────────────────────────────
  const MORPH_DUR      = 600;   // total frames for the morph animation (idle → face)
  const MORPH_STAGGER  = 0.5;   // max random delay (0–0.5 of morph progress) before each star starts moving
  const MORPH_EASE_IN  = 3.5;   // power for the initial ease-in ramp (higher = slower start)
  const MORPH_EASE     = 8;     // power for the final ease-out snap (higher = sharper landing)
  const IDLE_BIAS      = 0.55;   // how much idle star positions are biased toward the face target (0=random, 1=on target)

  // ── ORBIT SPEED ───────────────────────────────────────────────────────────────
  const ORBIT_FACE_BASE   = 0.0005;  // base angular orbit speed for face stars (rad/frame)
  const ORBIT_BG_BASE     = 0.0001;  // base angular orbit speed for background stars (rad/frame)
  const ORBIT_INNER_BOOST = 0.0006;  // extra speed added to stars closer to the centre

  // Seconds after page load before the morph starts automatically.
  const AUTO_START_DELAY = 0;

  // ── NEURAL CASCADE ────────────────────────────────────────────────────────────
  const CONN_DIST = 80;   // max pixel distance between two stars for a connection line / cascade to fire
  const REFRACT   = 160;  // refractory period in frames — a star cannot fire again until this many frames have passed
  let nextFire    = 180;

  const GCELL = CONN_DIST;
  let grid = {};

  function buildGrid() {
    grid = {};
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const k = (s.x / GCELL | 0) + ',' + (s.y / GCELL | 0);
      (grid[k] || (grid[k] = [])).push(i);
    }
  }

  function nbrs(s) {
    const gx = s.x / GCELL | 0, gy = s.y / GCELL | 0, r = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const k = (gx + dx) + ',' + (gy + dy);
      if (grid[k]) for (const i of grid[k]) r.push(i);
    }
    return r;
  }

  // ── Easing ────────────────────────────────────────────────────────────────────
  function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3); }

  // ── BITE ANIMATION ────────────────────────────────────────────────────────────
  const BITE_START_AT = 0.99;  // morph progress threshold at which the bite loop begins
  const BITE_CYCLE    = 200;    // frames per full open-and-close cycle
  const BITE_OPEN_END = 0.55;   // fraction of cycle when the jaw reaches fully open
  const BITE_SHUT_END = 0.80;   // fraction of cycle when the jaw is fully closed again (rest = silent pause)
  const BITE_MAX_JAW  = 0.058;  // max jaw displacement as a fraction of canvas height

  function biteOpen() {
    if (biteStartTime < 0) return 0;
    const p = ((time - biteStartTime) % BITE_CYCLE) / BITE_CYCLE;
    if (p < BITE_OPEN_END)  return smoothstep(p / BITE_OPEN_END);
    if (p < BITE_SHUT_END)  return 1 - smoothstep((p - BITE_OPEN_END) / (BITE_SHUT_END - BITE_OPEN_END));
    return 0;
  }

  // ── Quadratic bezier y helper ─────────────────────────────────────────────────
  function qby(t, y0, y1, y2) { return (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2; }

  // ── EYE GLOW ──────────────────────────────────────────────────────────────────
  const EYE_GLOW_DELAY     = 0.8;   // morph progress at which the eye glow starts fading in
  const EYE_GLOW_INTENSITY = 0.2;   // peak brightness multiplier of the eye halo
  const EYE_GLOW_EASE      = 1.0;   // power curve for the glow fade-in (1=linear)

  // ── FACE GEOMETRY ─────────────────────────────────────────────────────────────
  function facePoints() {
    const pts = [];

    const ML = W * 0.155, MR = W * 0.845;
    const UGcY = H * 0.700, UGctY = H * 0.512;
    const LGcY = H * 0.800, LGctY = H * 0.618;

    function w(x) { return Math.sin(((x - ML) / (MR - ML)) * Math.PI); }

    // Eyes
    const EAX = W * 0.105, EAY = H * 0.053;
    for (const [ecx, ecy] of [[W * 0.33, H * 0.37], [W * 0.67, H * 0.37]]) {
      for (let i = 0; i < 65; i++) {
        const t = (i / 65) * Math.PI * 2, sq = 1 - 0.42 * Math.cos(t) * Math.cos(t);
        pts.push({ x: ecx + EAX * Math.cos(t), y: ecy + EAY * Math.sin(t) * sq, type: 'eye', jawRole: null, jawW: 0 });
      }
      for (let i = 0; i < 20; i++) {
        const f = i / 19;
        pts.push({ x: ecx + (Math.random() - 0.5) * 2, y: ecy - EAY * 0.68 + f * EAY * 1.36, type: 'pupil', jawRole: null, jawW: 0 });
      }
    }

    // Gum lines
    for (let i = 0; i <= 22; i++) {
      const tx = i / 22, x = ML + tx * (MR - ML);
      pts.push({ x, y: qby(tx, UGcY, UGctY, UGcY), type: 'gum',       jawRole: 'upper', jawW: w(x) });
      pts.push({ x, y: qby(tx, LGcY, LGctY, LGcY), type: 'gum-lower', jawRole: 'lower', jawW: w(x) });
    }

    // Upper teeth
    const N_UPPER_TEETH = 10;
    for (let k = 0; k < N_UPPER_TEETH; k++) {
      const ta = (k + 0.07) / N_UPPER_TEETH, tb = (k + 0.50) / N_UPPER_TEETH, tc = (k + 0.93) / N_UPPER_TEETH;
      const xa = ML + ta * (MR - ML), xb = ML + tb * (MR - ML), xc = ML + tc * (MR - ML);
      const ya = qby(ta, UGcY, UGctY, UGcY), yb = qby(tb, UGcY, UGctY, UGcY), yc = qby(tc, UGcY, UGctY, UGcY);
      const tipY = yb + (qby(tb, LGcY, LGctY, LGcY) - yb) * 0.80, tipX = xb;
      for (let i = 0; i <= 5; i++) {
        const f = i / 5;
        pts.push({ x: xa + f * (tipX - xa),   y: ya + f * (tipY - ya),   type: 'tooth',     jawRole: 'upper', jawW: w(xa + f * (tipX - xa)) });
        pts.push({ x: tipX + f * (xc - tipX), y: tipY + f * (yc - tipY), type: 'tooth',     jawRole: 'upper', jawW: w(tipX + f * (xc - tipX)) });
      }
    }

    // Lower teeth
    const N_LOWER_TEETH = 9;
    for (let k = 0; k < N_LOWER_TEETH; k++) {
      const ta = (k + 0.07) / N_LOWER_TEETH, tb = (k + 0.50) / N_LOWER_TEETH, tc = (k + 0.93) / N_LOWER_TEETH;
      const xa = ML + ta * (MR - ML), xb = ML + tb * (MR - ML), xc = ML + tc * (MR - ML);
      const ya = qby(ta, LGcY, LGctY, LGcY), yb = qby(tb, LGcY, LGctY, LGcY), yc = qby(tc, LGcY, LGctY, LGcY);
      const tipY = yb - (yb - qby(tb, UGcY, UGctY, UGcY)) * 0.66, tipX = xb;
      for (let i = 0; i <= 4; i++) {
        const f = i / 4;
        pts.push({ x: xa + f * (tipX - xa),   y: ya + f * (tipY - ya),   type: 'tooth-lower', jawRole: 'lower', jawW: w(xa + f * (tipX - xa)) });
        pts.push({ x: tipX + f * (xc - tipX), y: tipY + f * (yc - tipY), type: 'tooth-lower', jawRole: 'lower', jawW: w(tipX + f * (xc - tipX)) });
      }
    }

    return pts;
  }

  // ── Resize ────────────────────────────────────────────────────────────────────
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W / 2; cy = H / 2;
    maxDist = Math.sqrt(cx * cx + cy * cy);
  }

  // ── Star creation ─────────────────────────────────────────────────────────────
  function createStars() {
    stars = [];
    const fp = facePoints();

    fp.forEach(p => {
      const rndAngle = Math.random() * Math.PI * 2;
      const rndDist  = 60 + Math.random() * (Math.min(W, H) * 0.46);
      const rndX = Math.cos(rndAngle) * rndDist, rndY = Math.sin(rndAngle) * rndDist;
      const tgtX = p.x - cx, tgtY = p.y - cy;
      const bX = rndX * (1 - IDLE_BIAS) + tgtX * IDLE_BIAS;
      const bY = rndY * (1 - IDLE_BIAS) + tgtY * IDLE_BIAS;
      const angle = Math.atan2(bY, bX);
      const dist  = Math.hypot(bX, bY) || rndDist;
      const ox = cx + bX, oy = cy + bY;
      const ed = Math.max(dist, 50), nc = 1 - Math.sqrt(ed / maxDist);
      const isEye   = p.type === 'eye' || p.type === 'pupil';
      const isTooth = p.type === 'tooth' || p.type === 'tooth-lower';
      const base = isEye ? Math.random() * 1.4 + 0.8 : isTooth ? Math.random() * 1.6 + 0.9 : Math.random() * 1.1 + 0.5;

      stars.push({
        angle, dist, homeDist: dist,
        orbitSpeed: ORBIT_FACE_BASE + nc * nc * ORBIT_INNER_BOOST,
        x: ox, y: oy, vx: 0, vy: 0,
        assigned: true, targetX: p.x, targetY: p.y,
        faceType: p.type, jawRole: p.jawRole, jawW: p.jawW,
        morphDelay: Math.random() * MORPH_STAGGER,
        morphT: 0,
        jAmp:    3.5 + Math.random() * 5.0,
        jFreq:   0.006 + Math.random() * 0.010,
        jPhaseX: Math.random() * Math.PI * 2,
        jPhaseY: Math.random() * Math.PI * 2,
        baseSize: base, size: base,
        baseOpacity: isEye ? 0.55 + Math.random() * 0.3 : isTooth ? 0.50 + Math.random() * 0.3 : 0.22 + Math.random() * 0.25,
        twinkleSpeed: 0.006 + Math.random() * 0.011,
        twinkleOffset: Math.random() * Math.PI * 2,
        pulse: 0, pulseDecay: 0.954,
        cascadeEnergy: 0, cascadeReady: false, refractoryUntil: 0,
        binaryDigit: Math.random() < 0.5 ? '0' : '1', binaryShow: 0, dotOpacity: 1,
      });
    });

    // Background stars
    const BG_DENSITY = 4200;  // one background star per this many pixels² (lower = denser)
    const bgN = Math.floor(W * H / BG_DENSITY);
    for (let i = 0; i < bgN; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 30 + Math.random() * (Math.min(W, H) * 0.48);
      const ox = cx + Math.cos(angle) * dist, oy = cy + Math.sin(angle) * dist;
      const ed = Math.max(dist, 50), nc = 1 - Math.sqrt(ed / maxDist);
      const base = Math.random() * 1.2 + 0.3;
      stars.push({
        angle, dist, homeDist: dist,
        orbitSpeed: ORBIT_BG_BASE + nc * nc * ORBIT_INNER_BOOST,
        x: ox, y: oy, vx: 0, vy: 0,
        assigned: false, targetX: 0, targetY: 0, faceType: null, jawRole: null, jawW: 0,
        morphDelay: 0, morphT: 0,
        baseSize: base, size: base,
        baseOpacity: Math.random() * 0.28 + 0.07,
        twinkleSpeed: 0.004 + Math.random() * 0.008,
        twinkleOffset: Math.random() * Math.PI * 2,
        pulse: 0, pulseDecay: 0.958,
        cascadeEnergy: 0, cascadeReady: false, refractoryUntil: 0,
        binaryDigit: Math.random() < 0.5 ? '0' : '1', binaryShow: 0, dotOpacity: 1,
      });
    }
  }

  // ── Nebulae ───────────────────────────────────────────────────────────────────
  const NEBULAE = [
    [0.15, 0.28, 0.32, [14,  20, 60], 0.09],
    [0.78, 0.62, 0.26, [38,  14, 68], 0.08],
    [0.38, 0.82, 0.24, [50,  12, 55], 0.07],
  ];

  // ── Colours ───────────────────────────────────────────────────────────────────
  const COL_BASE  = [185, 195, 218];
  const COL_EYE   = [228,  95,  12];
  const COL_TOOTH = [215, 218, 232];
  const COL_GUM   = [165, 172, 208];

  function targetCol(faceType) {
    if (faceType === 'eye'   || faceType === 'pupil')       return COL_EYE;
    if (faceType === 'tooth' || faceType === 'tooth-lower') return COL_TOOTH;
    if (faceType === 'gum'   || faceType === 'gum-lower')   return COL_GUM;
    return COL_BASE;
  }

  // ── Neural cascade helpers ─────────────────────────────────────────────────────
  function triggerFire() {
    const pool = stars.filter(s => s.refractoryUntil <= time && (s.assigned || Math.random() < 0.3));
    if (!pool.length) return;
    const s = pool[Math.floor(Math.random() * pool.length)];
    s.pulse = 1; s.cascadeEnergy = 1; s.cascadeReady = true;
    s.refractoryUntil = time + REFRACT;
    s.binaryShow = 1; s.dotOpacity = 0; s.binaryDigit = Math.random() < 0.5 ? '0' : '1';
  }

  function scheduleNext() { nextFire = time + 200 + Math.random() * 360; }

  // Bite-snap fire
  const BITE_SEED_COUNT = 7;  // number of mouth stars seeded with cascade energy on each jaw snap
  function triggerBiteFire() {
    const pool = stars.filter(s =>
      s.assigned && s.refractoryUntil <= time &&
      (s.faceType === 'tooth' || s.faceType === 'tooth-lower' ||
       s.faceType === 'gum'   || s.faceType === 'gum-lower')
    );
    for (let n = 0; n < BITE_SEED_COUNT && pool.length; n++) {
      const idx = Math.floor(Math.random() * pool.length);
      const s   = pool.splice(idx, 1)[0];
      s.pulse = 1; s.cascadeEnergy = 1; s.cascadeReady = true;
      s.refractoryUntil = time + REFRACT;
      s.binaryShow = 1; s.dotOpacity = 0; s.binaryDigit = Math.random() < 0.5 ? '0' : '1';
    }
  }

  // ── Morph trigger ─────────────────────────────────────────────────────────────
  function startMorph() {
    if (state !== 'idle') return;
    state = 'morphing'; morphStart = time;
  }

  // ── Click handler (pulse wave on the canvas) ──────────────────────────────────
  function onBackgroundClick(e) {
    if (e.target.closest('a') || e.target.closest('button') || e.target.closest('nav') ||
        e.target.closest('form') || e.target.closest('input') || e.target.closest('select') ||
        e.target.closest('textarea')) return;
    if (state === 'idle') { startMorph(); return; }
    const R = 250;
    stars.forEach(s => {
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      if (d < R) {
        const I = Math.pow(1 - d / R, 1.5);
        s.pulse = Math.min(1, s.pulse + I);
        setTimeout(() => {
          s.binaryShow = Math.min(1, s.binaryShow + 0.5 + I * 0.8);
          s.dotOpacity = 0;
          s.binaryDigit = Math.random() < 0.5 ? '0' : '1';
        }, d * 0.35);
        s.cascadeEnergy = Math.min(1, s.cascadeEnergy + I * 0.7);
        s.cascadeReady = true; s.refractoryUntil = time + REFRACT;
      }
    });
  }

  // ── Main render loop ──────────────────────────────────────────────────────────
  function loop() {
    // --- White-flash transition overlay ---
    let transProgress = 0;
    let whiteOverlay  = 0;
    if (transitioning) {
      const elapsed = time - transitionStart;
      transProgress = Math.min(1, elapsed / TRANSITION_DURATION);
      if (transProgress > 0.35) whiteOverlay = Math.pow((transProgress - 0.35) / 0.65, 1.5);

      if (transProgress >= 0.95 && !transitionScrolled) {
        transitionScrolled = true;
        whiteFlashEl.style.opacity = '1';
        document.body.classList.remove('locked');
        document.body.classList.add('unlocked');
        heroEl.style.display   = 'none';
        canvas.style.display   = 'none';
        window.scrollTo({ top: 0, behavior: 'instant' });
        contentEl.classList.add('visible');
        navEl.classList.add('visible');
        sideDotsEl.classList.add('visible');
        whiteFlashEl.style.transition = 'opacity 1.5s ease';
        whiteFlashEl.style.opacity    = '0';
      }
    }

    // Skip drawing when paused (canvas hidden) unless footer is visible
    if (canvas.style.display === 'none' && !footerVisible) {
      time++;
      requestAnimationFrame(loop);
      return;
    }

    const t = time * 0.001;

    // Background colour (fades to white during transition)
    const bgR = Math.round(6  + whiteOverlay * 249);
    const bgG = Math.round(8  + whiteOverlay * 247);
    const bgB = Math.round(14 + whiteOverlay * 241);
    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.fillRect(0, 0, W, H);

    // Nebulae
    if (whiteOverlay < 0.8) {
      for (const [nx, ny, nr, c, op] of NEBULAE) {
        const px = (nx + Math.sin(t * 0.11 + nx * 7) * 0.06) * W;
        const py = (ny + Math.cos(t * 0.09 + ny * 9) * 0.06) * H;
        const r  = nr * Math.max(W, H);
        const g  = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0,   `rgba(${c[0]},${c[1]},${c[2]},${op})`);
        g.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},${op * 0.4})`);
        g.addColorStop(1,   'transparent');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }

    // Morph progress
    const globalMorphT = state === 'idle' ? 0 :
                         state === 'face' ? 1 :
                         Math.min(1, (time - morphStart) / MORPH_DUR);
    if (state === 'morphing' && globalMorphT >= 1) state = 'face';
    if (biteStartTime < 0 && globalMorphT >= BITE_START_AT) biteStartTime = time;

    const eyeAlpha = state === 'idle' ? 0
      : Math.pow(Math.max(0, (globalMorphT - EYE_GLOW_DELAY) / (1 - EYE_GLOW_DELAY)), EYE_GLOW_EASE);

    // Eye glow
    if (eyeAlpha > 0.01 && whiteOverlay < 0.8) {
      const ep = (0.68 + Math.sin(t * 1.7) * 0.12 + Math.sin(t * 3.3) * 0.05) * eyeAlpha * EYE_GLOW_INTENSITY;
      for (const [ex, ey] of [[W * 0.33, H * 0.37], [W * 0.67, H * 0.37]]) {
        const erx = W * 0.125, ery = H * 0.076;
        ctx.save(); ctx.translate(ex, ey); ctx.scale(1, ery / erx);
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, erx * 1.8);
        halo.addColorStop(0,   `rgba(180,30,0,${ep * 0.40})`);
        halo.addColorStop(0.5, `rgba(120,15,0,${ep * 0.20})`);
        halo.addColorStop(1,   'transparent');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, erx * 1.8, 0, Math.PI * 2); ctx.fill();
        const fire = ctx.createRadialGradient(0, 0, 0, 0, 0, erx);
        fire.addColorStop(0,    `rgba(255,160,20,${ep * 0.82})`);
        fire.addColorStop(0.20, `rgba(240, 90, 5,${ep * 0.68})`);
        fire.addColorStop(0.50, `rgba(185, 28, 3,${ep * 0.44})`);
        fire.addColorStop(0.80, `rgba(110, 10, 2,${ep * 0.20})`);
        fire.addColorStop(1,    'transparent');
        ctx.fillStyle = fire; ctx.beginPath(); ctx.arc(0, 0, erx, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'destination-out';
        ctx.save(); ctx.translate(ex, ey); ctx.scale(0.16, 1); ctx.translate(-ex, -ey);
        const slit = ctx.createRadialGradient(ex, ey, 0, ex, ey, erx * 0.18);
        slit.addColorStop(0, `rgba(0,0,0,${0.95 * eyeAlpha})`);
        slit.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = slit; ctx.beginPath(); ctx.arc(ex, ey, ery * 0.92, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); ctx.restore();
      }
    }

    // White overlay for transition
    if (whiteOverlay > 0.01) {
      const gr = Math.max(W, H) * (0.2 + whiteOverlay * 1.2);
      const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
      g.addColorStop(0,   `rgba(255,255,255,${whiteOverlay * 0.9})`);
      g.addColorStop(0.3, `rgba(255,255,255,${whiteOverlay * 0.5})`);
      g.addColorStop(1,   `rgba(255,255,255,0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // Neural cascade
    if (time % 4 === 0) buildGrid();
    if (time >= nextFire) { triggerFire(); scheduleNext(); }
    if (biteStartTime >= 0 &&
        (time - biteStartTime) % BITE_CYCLE === Math.round(BITE_SHUT_END * BITE_CYCLE)) {
      triggerBiteFire();
    }

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (!(s.cascadeEnergy > 0.06 && s.cascadeReady)) continue;
      s.cascadeReady = false;
      for (const ni of nbrs(s)) {
        if (ni === i) continue;
        const n = stars[ni]; if (n.refractoryUntil > time) continue;
        const d = Math.hypot(s.x - n.x, s.y - n.y);
        if (d < CONN_DIST * 1.5) {
          const tr = s.cascadeEnergy * 0.27 * (1 - d / (CONN_DIST * 1.5));
          if (tr > 0.006) {
            n.pulse = Math.min(1, n.pulse + tr * 1.2);
            n.cascadeEnergy = Math.min(0.9, n.cascadeEnergy + tr * 0.75);
            n.cascadeReady = false; n.refractoryUntil = time + REFRACT;
            n.binaryShow = Math.min(1, n.binaryShow + 0.6 + tr * 3);
            n.dotOpacity = 0; n.binaryDigit = Math.random() < 0.5 ? '0' : '1';
            setTimeout(() => { n.cascadeReady = true; }, 40 + Math.random() * 40);
          }
        }
      }
      s.cascadeEnergy *= 0.65;
    }

    // Shockwave expanding ring
    let swRadius = -1, swWidth = 120;
    if (shockwave) {
      const el = time - shockwave.startTime;
      swRadius = el * 4;
      if (swRadius > Math.sqrt(W * W + H * H) + swWidth) { shockwave = null; swRadius = -1; }
    }
    const transOutwardForce = transitioning ? transProgress * 0.8 : 0;

    // Update star positions
    const jaw    = biteOpen();
    const maxJaw = H * BITE_MAX_JAW;

    for (const s of stars) {
      s.angle += s.orbitSpeed;
      const orbX = cx + Math.cos(s.angle) * s.dist;
      const orbY = cy + Math.sin(s.angle) * s.dist;

      if (transitioning) {
        // Shockwave kick
        if (swRadius > 0 && shockwave) {
          const sdx = s.x - shockwave.cx, sdy = s.y - shockwave.cy;
          const sD = Math.hypot(sdx, sdy);
          const dfw = Math.abs(sD - swRadius);
          if (dfw < swWidth && sD > 1) {
            const wi = 1 - dfw / swWidth;
            s.vx += (sdx / sD) * wi * 1.2;
            s.vy += (sdy / sD) * wi * 1.2;
            s.pulse = Math.min(1, s.pulse + wi * 0.5);
          }
        }
        // Continuous outward acceleration
        const tdx = s.x - cx, tdy = s.y - cy;
        const tD = Math.hypot(tdx, tdy) || 1;
        s.vx += (tdx / tD) * transOutwardForce;
        s.vy += (tdy / tD) * transOutwardForce;
        s.pulse = Math.min(1, s.pulse + transProgress * 0.02);
        // Apply velocity (low damping so stars keep flying)
        s.vx *= 0.97; s.vy *= 0.97;
        s.x += s.vx; s.y += s.vy;
        // Update orbital params from new position
        const ndx = s.x - cx, ndy = s.y - cy;
        s.dist = Math.hypot(ndx, ndy);
        s.angle = Math.atan2(ndy, ndx);
      } else {
        s.dist += (s.homeDist - s.dist) * 0.003;

        if (s.assigned) {
          const _t    = Math.max(0, (globalMorphT - s.morphDelay) / (1 - s.morphDelay));
          const easeIn = Math.pow(_t, MORPH_EASE_IN);
          const localT = 1 - Math.pow(1 - easeIn, MORPH_EASE);
          s.morphT = localT;

          let tx = s.targetX, ty = s.targetY;
          if (s.jawRole && state === 'face') {
            ty += (s.jawRole === 'upper' ? -1 : 1) * jaw * maxJaw * s.jawW;
          }

          const jx = Math.sin(time * s.jFreq + s.jPhaseX) * s.jAmp * s.morphT;
          const jy = Math.cos(time * s.jFreq + s.jPhaseY) * s.jAmp * s.morphT;
          s.x = orbX + (tx - orbX) * s.morphT + jx;
          s.y = orbY + (ty - orbY) * s.morphT + jy;
        } else {
          s.x = orbX; s.y = orbY; s.morphT = 0;
        }
      }

      s.pulse         *= s.pulseDecay;
      s.cascadeEnergy *= 0.96;
      s.binaryShow    *= 0.988;
      if (s.binaryShow < 0.3) s.dotOpacity = Math.min(1, s.dotOpacity + 0.025);
      s.size = s.baseSize + s.pulse * 3.5;
    }

    // Connection lines
    for (let i = 0; i < stars.length; i++) {
      const si = stars[i];
      if (si.x < -50 || si.x > W + 50 || si.y < -50 || si.y > H + 50) continue;
      for (let j = i + 1; j < stars.length; j++) {
        const sj = stars[j], d = Math.hypot(si.x - sj.x, si.y - sj.y);
        if (d >= CONN_DIST) continue;
        let a = 1 - d / CONN_DIST; a *= a;
        const pm = Math.max(si.pulse, sj.pulse);
        a = Math.min(a * (1 + pm * 8), 0.75); if (a < 0.002) continue;
        const eye = si.faceType === 'eye' || si.faceType === 'pupil' ||
                    sj.faceType === 'eye' || sj.faceType === 'pupil';
        const mt  = Math.max(si.morphT, sj.morphT);
        const r   = eye ? Math.round(140 + mt * 60 + pm * 55) : Math.round(140 + pm * 80);
        const g   = eye ? Math.round(155 - mt * 100 + pm * 30) : Math.round(155 + pm * 70);
        const b   = eye ? Math.round(205 - mt * 197 + pm * 10) : Math.round(205 + pm * 40);
        ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.30})`;
        ctx.lineWidth = 0.6 + pm * 1.8;
        ctx.beginPath(); ctx.moveTo(si.x, si.y); ctx.lineTo(sj.x, sj.y); ctx.stroke();
      }
    }

    // Draw stars
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of stars) {
      if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) continue;
      const tw  = Math.sin(time * s.twinkleSpeed + s.twinkleOffset) * 0.12 + 0.88;
      const p   = s.pulse;
      const mt  = s.morphT;
      const tc  = targetCol(s.faceType);
      const tr2 = Math.min(255, (COL_BASE[0] + (tc[0] - COL_BASE[0]) * mt + p * 55) | 0);
      const tg2 = Math.min(255, (COL_BASE[1] + (tc[1] - COL_BASE[1]) * mt + p * 45) | 0);
      const tb2 = Math.min(255, (COL_BASE[2] + (tc[2] - COL_BASE[2]) * mt + p * 30) | 0);
      const clr = `rgb(${tr2},${tg2},${tb2})`;
      const opFade = s.assigned ? 1 : 1 - globalMorphT * 0.35;
      const op     = Math.min(1, s.baseOpacity + p * 0.6) * tw * opFade;

      if (s.binaryShow > 0.06) {
        const fs = Math.max(7, s.baseSize * 4.5 + s.binaryShow * 11 + p * 5);
        ctx.font = `${fs | 0}px monospace`;
        ctx.globalAlpha = Math.min(1, s.binaryShow * 1.2 + p * 0.2) * tw * opFade;
        ctx.fillStyle = clr; ctx.fillText(s.binaryDigit, s.x, s.y);
        if (s.binaryShow > 0.15) {
          const hr = fs * 1.2 + p * 8;
          const gg = ctx.createRadialGradient(s.x, s.y, fs * 0.15, s.x, s.y, hr);
          gg.addColorStop(0, `rgba(${tr2},${tg2},${tb2},${Math.max(s.binaryShow, p) * 0.2 * tw * opFade})`);
          gg.addColorStop(1, 'transparent');
          ctx.globalAlpha = 1; ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(s.x, s.y, hr, 0, Math.PI * 2); ctx.fill();
        }
        if (s.dotOpacity > 0.05) {
          ctx.globalAlpha = op * s.dotOpacity;
          ctx.fillStyle = clr; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.globalAlpha = op;
        ctx.fillStyle = clr; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
        if (p > 0.05) {
          const hr = s.size * 4 + p * 10;
          const gg = ctx.createRadialGradient(s.x, s.y, s.size * 0.5, s.x, s.y, hr);
          const ga = p * 0.3 * tw;
          gg.addColorStop(0,   `rgba(${tr2},${tg2},${tb2},${ga})`);
          gg.addColorStop(0.4, `rgba(${tr2},${tg2},${tb2},${ga * 0.4})`);
          gg.addColorStop(1,   'transparent');
          ctx.globalAlpha = 1; ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(s.x, s.y, hr, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
    time++;
    requestAnimationFrame(loop);
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.AstroCanvas = {

    init: function (refs) {
      canvas      = refs.canvas;
      ctx         = canvas.getContext('2d');
      whiteFlashEl = refs.whiteFlash;
      heroEl      = refs.hero;
      contentEl   = refs.content;
      navEl       = refs.nav;
      sideDotsEl  = refs.sideDots;

      document.addEventListener('click', onBackgroundClick);
      window.addEventListener('resize', () => {
        resize(); createStars();
        state = 'idle'; biteStartTime = -1;
        setTimeout(startMorph, AUTO_START_DELAY * 1000);
      });

      resize();
      createStars();
      scheduleNext();
      setTimeout(startMorph, AUTO_START_DELAY * 1000);
      loop();
    },

    startTransition: function () {
      if (transitioning) return;
      transitioning   = true;
      transitionStart = time;
      shockwave = { startTime: time, cx: W / 2, cy: H / 2 };
      heroEl.style.transition = 'opacity 1.5s ease';
      heroEl.style.opacity    = '0';
    },

    enableFooter: function () {
      footerVisible = true;
      canvas.style.display = 'block';
      resize();
      createStars();
      state = 'idle'; biteStartTime = -1;
      scheduleNext();
      setTimeout(startMorph, AUTO_START_DELAY * 1000);
    },

    disableFooter: function () {
      footerVisible = false;
      canvas.style.display = 'none';
    },
  };

})();
