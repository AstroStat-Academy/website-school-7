const bar = document.getElementById('bar');
const TOTAL = 24;

function segmentColor(i) {
  const t = i / (TOTAL - 1);
  const stops = [
    { t: 0,    r: 245, g: 208, b:  96 },
    { t: 0.35, r: 232, g: 112, b:  48 },
    { t: 0.65, r: 232, g:  80, b:  80 },
    { t: 1,    r: 192, g:  32, b:  32 },
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let k = 0; k < stops.length - 1; k++) {
    if (t >= stops[k].t && t <= stops[k+1].t) { lo = stops[k]; hi = stops[k+1]; break; }
  }
  const f = (t - lo.t) / (hi.t - lo.t);
  const r = Math.round(lo.r + f * (hi.r - lo.r));
  const g = Math.round(lo.g + f * (hi.g - lo.g));
  const b = Math.round(lo.b + f * (hi.b - lo.b));
  return `rgb(${r},${g},${b})`;
}

function segmentHeight(i) {
  const boundaries = [0, 6, 12, 18, 23];
  const dist = Math.min(...boundaries.map(b => Math.abs(i - b)));
  if (dist === 0) return 72;
  if (dist === 1) return 62;
  return 50 + Math.random() * 10 | 0;
}

const segments = [];
for (let i = 0; i < TOTAL; i++) {
  const seg = document.createElement('div');
  seg.className = 'segment';
  seg.style.backgroundColor = segmentColor(i);
  seg.style.height = segmentHeight(i) + 'px';
  seg.style.alignSelf = 'flex-end';
  bar.appendChild(seg);
  segments.push(seg);
}

const labels    = Array.from(document.querySelectorAll('.label'));
const annoStart = document.querySelector('.annotation-start');
const annoEnd   = document.querySelector('.annotation-end');
const CYCLE_MS  = 7000;

function resetAnim(el, anim) {
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = anim;
}

function play() {
  segments.forEach((seg, i) => {
    const delay = 0.03 + i * 0.04;
    resetAnim(seg, `popUp 0.4s cubic-bezier(0.34,1.56,0.64,1) ${delay}s forwards`);
  });
  labels.forEach((lbl, i) => {
    resetAnim(lbl, `riseIn 0.5s ease ${0.1 + i * 0.1}s forwards`);
  });
  resetAnim(annoStart, 'fadeIn 0.6s ease 1.8s forwards');
  resetAnim(annoEnd,   'fadeIn 0.6s ease 2.4s forwards');
  setTimeout(play, CYCLE_MS);
}

play();
