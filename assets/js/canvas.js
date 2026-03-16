/**
 * canvas.js — Star field background animation
 *
 * Exposes window.AstroCanvas with:
 *   init(refs)           — boot the canvas (call once on DOMContentLoaded)
 *   startTransition()    — trigger the apply-button warp sequence
 *   enableFooter()       — re-activate canvas when apply-footer is visible
 *   disableFooter()      — hide canvas when apply-footer leaves viewport
 */
(function () {
  'use strict';

  // --- DOM refs (injected via init) ---
  let canvasEl, ctx, whiteFlashEl, heroEl, contentEl, navEl, sideDotsEl;

  // --- Shared state ---
  let W, H, cx, cy;
  let stars = [];
  let mouse = { x: -9999, y: -9999 };
  let time = 0;
  let canvasPaused = false;
  let footerVisible = false;
  let shockwave = null;
  let transitioning = false;
  let transitionScrolled = false;
  let transitionStart = 0;
  let whiteOverlay = 0;

  // --- Constants ---
  const TRANSITION_DURATION = 180;
  const MOUSE_RADIUS = 110;
  const MOUSE_REPULSION = 0.3;
  const CONN_DIST = 140;
  const DRIFT_BACK = 0.003;
  const STAR_GRAVITY_RADIUS = 100;
  const STAR_GRAVITY_STRENGTH = 0.0008;
  const REFRACTORY_FRAMES = 180;
  const MIN_STAR_DIST = 12;
  const MIN_STAR_REPULSION = 0.15;

  // --- Nebulae ---
  const nebulae = [
    { x: 0.15, y: 0.3,  r: 0.35, color: [18, 28, 72] },
    { x: 0.50, y: 0.15, r: 0.32, color: [14, 30, 62] },
    { x: 0.80, y: 0.65, r: 0.30, color: [42, 18, 72] },
    { x: 0.35, y: 0.80, r: 0.28, color: [55, 15, 65] },
    { x: 0.70, y: 0.25, r: 0.24, color: [35, 12, 58] },
    { x: 0.25, y: 0.60, r: 0.22, color: [48, 14, 52] },
  ];

  // --- Spatial grid ---
  const gridCellSize = STAR_GRAVITY_RADIUS;
  let grid = {};

  function buildGrid() {
    grid = {};
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const k = Math.floor(s.x / gridCellSize) + ',' + Math.floor(s.y / gridCellSize);
      if (!grid[k]) grid[k] = [];
      grid[k].push(i);
    }
  }

  function getNeighborIndices(s) {
    const gx = Math.floor(s.x / gridCellSize);
    const gy = Math.floor(s.y / gridCellSize);
    const r = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = (gx + dx) + ',' + (gy + dy);
        if (grid[k]) for (const i of grid[k]) r.push(i);
      }
    }
    return r;
  }

  // --- Star creation ---
  function resize() {
    W = canvasEl.width = window.innerWidth;
    H = canvasEl.height = window.innerHeight;
    cx = W / 2;
    cy = H / 2;
  }

  function createStars() {
    stars = [];
    const count = Math.floor((W * H) / 3600);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const baseSize = Math.random() * 2.2 + 0.6;
      const charge = Math.random() < 0.3 ? -(Math.random() * 0.5 + 0.5) : (Math.random() * 0.8 + 0.2);
      stars.push({
        angle, dist, homeDist: dist, x, y, vx: 0, vy: 0,
        size: baseSize, baseSize,
        opacity: Math.random() * 0.45 + 0.18, orbitSpeed: 0,
        twinkleSpeed: 0.006 + Math.random() * 0.01,
        twinkleOffset: Math.random() * Math.PI * 2,
        pulse: 0, pulseDecay: 0.955, cascadeEnergy: 0, cascadeReady: false,
        charge, refractoryUntil: 0,
        binaryDigit: Math.random() < 0.5 ? '0' : '1', binaryShow: 0, dotOpacity: 1
      });
      const s = stars[stars.length - 1];
      const ed = Math.max(s.dist, 50);
      const md = Math.sqrt(cx * cx + cy * cy);
      const nc = 1 - Math.sqrt(ed / md);
      s.orbitSpeed = 0.00002 + nc * nc * 0.0008;
    }
  }

  // --- Neural firing ---
  let nextFireTime = 200;
  const FIRE_INTERVAL_MIN = 250, FIRE_INTERVAL_MAX = 600;

  function scheduleNextFire() {
    nextFireTime = time + FIRE_INTERVAL_MIN + Math.random() * (FIRE_INTERVAL_MAX - FIRE_INTERVAL_MIN);
  }

  function triggerNeuralFire() {
    if (transitioning && !footerVisible) return;
    const candidates = stars.filter(s => {
      if (s.refractoryUntil > time) return false;
      let n = 0;
      for (const o of stars) {
        if (o === s) continue;
        const d = Math.sqrt((s.x - o.x) ** 2 + (s.y - o.y) ** 2);
        if (d < CONN_DIST * 1.6) n++;
        if (n >= 2) return true;
      }
      return false;
    });
    if (!candidates.length) return;
    const seed = candidates[Math.floor(Math.random() * candidates.length)];
    seed.pulse = 1; seed.cascadeEnergy = 1; seed.cascadeReady = true;
    seed.refractoryUntil = time + REFRACTORY_FRAMES;
    seed.binaryShow = 1; seed.dotOpacity = 0;
    seed.binaryDigit = Math.random() < 0.5 ? '0' : '1';
  }

  // --- Click on background ---
  function onBackgroundClick(e) {
    if (e.target.closest('a') || e.target.closest('button') || e.target.closest('nav') ||
        e.target.closest('form') || e.target.closest('input') || e.target.closest('select') ||
        e.target.closest('textarea')) return;
    if (transitioning && !footerVisible) return;
    const clickX = e.clientX, clickY = e.clientY;
    const activationRadius = 250;
    stars.forEach(s => {
      const d = Math.sqrt((s.x - clickX) ** 2 + (s.y - clickY) ** 2);
      if (d < activationRadius) {
        const intensity = Math.pow(1 - d / activationRadius, 1.5);
        s.pulse = Math.min(1, s.pulse + intensity * 1.0);
        const delay = d * 0.4;
        setTimeout(() => {
          s.binaryShow = Math.min(1, s.binaryShow + 0.5 + intensity * 0.8);
          s.dotOpacity = 0;
          s.binaryDigit = Math.random() < 0.5 ? '0' : '1';
        }, delay);
        s.cascadeEnergy = Math.min(1, s.cascadeEnergy + intensity * 0.7);
        s.cascadeReady = true;
        s.refractoryUntil = time + REFRACTORY_FRAMES;
      }
    });
  }

  // --- Main render loop ---
  function loop() {
    if (canvasPaused && !footerVisible) { requestAnimationFrame(loop); return; }

    let transProgress = 0;
    if (transitioning && !canvasPaused) {
      const elapsed = time - transitionStart;
      transProgress = Math.min(1, elapsed / TRANSITION_DURATION);
      if (transProgress > 0.35) whiteOverlay = Math.pow((transProgress - 0.35) / 0.65, 1.5);

      if (transProgress >= 0.95 && !transitionScrolled) {
        transitionScrolled = true;
        whiteFlashEl.style.opacity = '1';
        document.body.classList.remove('locked');
        document.body.classList.add('unlocked');
        heroEl.style.display = 'none';
        canvasEl.style.display = 'none';
        canvasPaused = true;
        window.scrollTo({ top: 0, behavior: 'instant' });
        contentEl.classList.add('visible');
        navEl.classList.add('visible');
        sideDotsEl.classList.add('visible');
        whiteFlashEl.style.transition = 'opacity 1.5s ease';
        whiteFlashEl.style.opacity = '0';
      }
    }

    const bgR = Math.round(7 + whiteOverlay * 248);
    const bgG = Math.round(10 + whiteOverlay * 245);
    const bgB = Math.round(18 + whiteOverlay * 237);
    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.fillRect(0, 0, W, H);

    if (whiteOverlay < 0.8) {
      const nebOp = 1 - whiteOverlay * 1.25, t = time * 0.001;
      for (const neb of nebulae) {
        const dX = Math.sin(t * 0.12 + neb.x * 7) * 0.18 + Math.sin(t * 0.05) * 0.08;
        const dY = Math.cos(t * 0.10 + neb.x * 9) * 0.14 + Math.cos(t * 0.04) * 0.06;
        const nx = (neb.x + dX) * W, ny = (neb.y + dY) * H;
        const rP = 1 + Math.sin(t * 0.15 + neb.x * 12) * 0.2;
        const nr = neb.r * Math.max(W, H) * rP;
        const sX = 1 + Math.sin(t * 0.07 + neb.x * 6) * 0.25;
        const sY = 1 + Math.cos(t * 0.09 + neb.x * 5) * 0.2;
        const op = (0.12 + Math.sin(t * 0.3 + neb.x * 5) * 0.05) * nebOp;
        const [cr, cg, cb] = neb.color;
        ctx.save(); ctx.translate(nx, ny); ctx.scale(sX, sY);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, nr);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${op})`);
        g.addColorStop(0.5, `rgba(${cr},${cg},${cb},${op * 0.4})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.fillRect(-nr * 1.5, -nr * 1.5, nr * 3, nr * 3); ctx.restore();
      }
    }

    if (whiteOverlay > 0.01 && !canvasPaused) {
      const gr = Math.max(W, H) * (0.2 + whiteOverlay * 1.2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
      g.addColorStop(0, `rgba(255,255,255,${whiteOverlay * 0.9})`);
      g.addColorStop(0.3, `rgba(255,255,255,${whiteOverlay * 0.5})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    let swRadius = -1, swWidth = 120;
    if (shockwave) {
      const el = time - shockwave.startTime;
      swRadius = el * (transitioning ? 4 : 6);
      if (swRadius > Math.sqrt(W * W + H * H) + swWidth) { shockwave = null; swRadius = -1; }
    }

    if (time >= nextFireTime) { triggerNeuralFire(); scheduleNextFire(); }

    // Cascade propagation
    if (!transitioning || footerVisible) {
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (s.cascadeEnergy > 0.06 && s.cascadeReady) {
          s.cascadeReady = false;
          for (let j = 0; j < stars.length; j++) {
            if (i === j) continue;
            const n = stars[j];
            if (n.refractoryUntil > time) continue;
            const dx = s.x - n.x, dy = s.y - n.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < CONN_DIST * 1.6) {
              const transfer = s.cascadeEnergy * 0.27 * (1 - d / (CONN_DIST * 1.6));
              if (transfer > 0.006) {
                n.pulse = Math.min(1, n.pulse + transfer * 1.2);
                n.cascadeEnergy = Math.min(0.9, n.cascadeEnergy + transfer * 0.75);
                n.cascadeReady = false; n.refractoryUntil = time + REFRACTORY_FRAMES;
                n.binaryShow = Math.min(1, n.binaryShow + 0.6 + transfer * 3);
                n.dotOpacity = 0; n.binaryDigit = Math.random() < 0.5 ? '0' : '1';
                setTimeout(() => { n.cascadeReady = true; }, 40 + Math.random() * 40);
              }
            }
          }
          s.cascadeEnergy *= 0.65;
        }
      }
    }

    if (time % 3 === 0) buildGrid();

    const maxDist = Math.sqrt(cx * cx + cy * cy);
    const transOutwardForce = (transitioning && !canvasPaused) ? transProgress * 0.8 : 0;

    stars.forEach((s, idx) => {
      s.angle += s.orbitSpeed;
      let x = cx + Math.cos(s.angle) * s.dist, y = cy + Math.sin(s.angle) * s.dist;

      if (!transitioning || footerVisible) {
        const mdx = x - mouse.x, mdy = y - mouse.y, mD = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mD < MOUSE_RADIUS && mD > 1) {
          const f = MOUSE_REPULSION * Math.pow(1 - mD / MOUSE_RADIUS, 2);
          s.vx += (mdx / mD) * f; s.vy += (mdy / mD) * f;
        }
      }

      if (transitioning && !canvasPaused && transProgress < 0.95) {
        const tdx = x - cx, tdy = y - cy, tD = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        s.vx += (tdx / tD) * transOutwardForce; s.vy += (tdy / tD) * transOutwardForce;
        s.pulse = Math.min(1, s.pulse + transProgress * 0.02);
      }

      if (swRadius > 0 && shockwave) {
        const sdx = x - shockwave.cx, sdy = y - shockwave.cy;
        const sD = Math.sqrt(sdx * sdx + sdy * sdy);
        const dfw = Math.abs(sD - swRadius);
        if (dfw < swWidth && sD > 1) {
          const wi = 1 - dfw / swWidth, pf = wi * (transitioning ? 1.2 : 0.6);
          s.vx += (sdx / sD) * pf; s.vy += (sdy / sD) * pf;
          s.pulse = Math.min(1, s.pulse + wi * 0.5);
          if (!transitioning || footerVisible) {
            s.binaryShow = Math.min(1, s.binaryShow + wi * 0.7);
            s.dotOpacity = 0; s.binaryDigit = Math.random() < 0.5 ? '0' : '1';
          }
        }
      }

      if (time % 2 === 0 && (transProgress < 0.5 || footerVisible)) {
        const neighbors = getNeighborIndices(s);
        for (const ni of neighbors) {
          if (ni === idx) continue;
          const n = stars[ni];
          const gdx = n.x - x, gdy = n.y - y, gd = Math.sqrt(gdx * gdx + gdy * gdy);
          if (gd < MIN_STAR_DIST && gd > 0.5) {
            const of2 = MIN_STAR_REPULSION * (1 - gd / MIN_STAR_DIST);
            s.vx -= (gdx / gd) * of2; s.vy -= (gdy / gd) * of2;
          } else if (gd < STAR_GRAVITY_RADIUS && gd > MIN_STAR_DIST) {
            const cc = s.charge * n.charge, fo = 1 - gd / STAR_GRAVITY_RADIUS;
            const gf = cc * STAR_GRAVITY_STRENGTH * fo;
            s.vx += (gdx / gd) * gf; s.vy += (gdy / gd) * gf;
          }
        }
      }

      const damp = (transitioning && !canvasPaused) ? 0.97 : 0.88;
      s.vx *= damp; s.vy *= damp; x += s.vx; y += s.vy;
      const nDx = x - cx, nDy = y - cy;
      s.dist = Math.sqrt(nDx * nDx + nDy * nDy); s.angle = Math.atan2(nDy, nDx);

      if (!transitioning || footerVisible) { s.dist += (s.homeDist - s.dist) * DRIFT_BACK; }

      const ed = Math.max(s.dist, 50), nc = 1 - Math.sqrt(ed / maxDist);
      s.orbitSpeed = 0.00002 + nc * nc * 0.0008;
      s.x = x; s.y = y;
      s.pulse *= s.pulseDecay; s.cascadeEnergy *= 0.96;
      s.binaryShow *= 0.988;
      if (s.binaryShow < 0.3) { s.dotOpacity = Math.min(1, s.dotOpacity + 0.025); }
      s.size = s.baseSize + s.pulse * 3.5;
    });

    // Draw connections
    const connAlpha = (transitioning && !canvasPaused) ? Math.max(0, 1 - transProgress * 2) : 1;
    if (connAlpha > 0.01) {
      for (let i = 0; i < stars.length; i++) {
        const si = stars[i];
        if (si.x < -50 || si.x > W + 50 || si.y < -50 || si.y > H + 50) continue;
        for (let j = i + 1; j < stars.length; j++) {
          const sj = stars[j], dx = si.x - sj.x, dy = si.y - sj.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONN_DIST) {
            let a = 1 - d / CONN_DIST; a *= a;
            const pm = Math.max(si.pulse, sj.pulse); a = Math.min(a * (1 + pm * 8), 0.75);
            if (a < 0.002) continue;
            const r = Math.round(140 + pm * 80), g = Math.round(155 + pm * 70), b = Math.round(205 + pm * 40);
            ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.28 * connAlpha})`;
            ctx.lineWidth = 0.6 + pm * 1.8;
            ctx.beginPath(); ctx.moveTo(si.x, si.y); ctx.lineTo(sj.x, sj.y); ctx.stroke();
          }
        }
      }
    }

    // Draw stars
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sBB = (transitioning && !canvasPaused) ? transProgress * 0.5 : 0;
    stars.forEach(s => {
      if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) return;
      const tw = Math.sin(time * s.twinkleSpeed + s.twinkleOffset) * 0.12 + 0.88;
      const p = s.pulse;
      const tr2 = (transitioning && !canvasPaused) ? Math.min(255, Math.round(185 + p * 55 + transProgress * 70)) : Math.round(185 + p * 55);
      const tg2 = (transitioning && !canvasPaused) ? Math.min(255, Math.round(195 + p * 45 + transProgress * 60)) : Math.round(195 + p * 45);
      const tb2 = (transitioning && !canvasPaused) ? Math.min(255, Math.round(218 + p * 30 + transProgress * 37)) : Math.round(218 + p * 30);
      const clr = `rgb(${Math.min(tr2, 255)},${Math.min(tg2, 255)},${Math.min(tb2, 255)})`;

      if (s.binaryShow > 0.06 && (!transitioning || footerVisible)) {
        const fs = Math.max(8, s.baseSize * 4.5 + s.binaryShow * 12 + p * 5);
        ctx.font = `${Math.round(fs)}px 'Space Grotesk',monospace`;
        ctx.globalAlpha = Math.min(1, s.binaryShow * 1.2 + p * 0.2) * tw;
        ctx.fillStyle = clr; ctx.fillText(s.binaryDigit, s.x, s.y);
        if (s.binaryShow > 0.15) {
          const hr = fs * 1.2 + p * 8;
          const gg = ctx.createRadialGradient(s.x, s.y, fs * 0.15, s.x, s.y, hr);
          gg.addColorStop(0, `rgba(${Math.min(tr2,255)},${Math.min(tg2,255)},${Math.min(tb2,255)},${Math.max(s.binaryShow, p) * 0.2 * tw})`);
          gg.addColorStop(1, `rgba(${Math.min(tr2,255)},${Math.min(tg2,255)},${Math.min(tb2,255)},0)`);
          ctx.globalAlpha = 1; ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(s.x, s.y, hr, 0, Math.PI * 2); ctx.fill();
        }
        if (s.dotOpacity > 0.05) {
          ctx.globalAlpha = Math.min(1, (s.opacity + p * 0.6)) * tw * s.dotOpacity;
          ctx.fillStyle = clr; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.globalAlpha = Math.min(1, (s.opacity + p * 0.6 + sBB)) * tw;
        ctx.fillStyle = clr;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
        if (p > 0.05 || sBB > 0.1) {
          const hr = s.size * 4 + p * 10 + sBB * 12;
          const gg = ctx.createRadialGradient(s.x, s.y, s.size * 0.5, s.x, s.y, hr);
          const ga = (p * 0.3 + sBB * 0.2) * tw;
          gg.addColorStop(0, `rgba(${Math.min(tr2,255)},${Math.min(tg2,255)},${Math.min(tb2,255)},${ga})`);
          gg.addColorStop(0.4, `rgba(${Math.min(tr2,255)},${Math.min(tg2,255)},${Math.min(tb2,255)},${ga * 0.4})`);
          gg.addColorStop(1, `rgba(${Math.min(tr2,255)},${Math.min(tg2,255)},${Math.min(tb2,255)},0)`);
          ctx.globalAlpha = 1; ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(s.x, s.y, hr, 0, Math.PI * 2); ctx.fill();
        }
      }
    });

    ctx.globalAlpha = 1;
    time++;
    if (transitioning && !canvasPaused && transProgress >= 1) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    }
    requestAnimationFrame(loop);
  }

  // --- Public API ---
  window.AstroCanvas = {

    init: function (refs) {
      canvasEl    = refs.canvas;
      ctx         = canvasEl.getContext('2d');
      whiteFlashEl = refs.whiteFlash;
      heroEl      = refs.hero;
      contentEl   = refs.content;
      navEl       = refs.nav;
      sideDotsEl  = refs.sideDots;

      canvasEl.style.pointerEvents = 'auto';
      document.addEventListener('click', onBackgroundClick);
      window.addEventListener('resize', () => { resize(); createStars(); });
      window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
      window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

      resize();
      createStars();
      scheduleNextFire();
      loop();
    },

    startTransition: function () {
      if (transitioning) return;
      transitioning = true;
      transitionStart = time;
      shockwave = { startTime: time, cx: W / 2, cy: H / 2 };
      heroEl.style.transition = 'opacity 1.5s ease';
      heroEl.style.opacity = '0';
    },

    enableFooter: function () {
      footerVisible = true;
      canvasEl.style.display = 'block';
      whiteOverlay = 0;
      resize();
      createStars();
      scheduleNextFire();
    },

    disableFooter: function () {
      footerVisible = false;
      canvasEl.style.display = 'none';
    },
  };

})();
