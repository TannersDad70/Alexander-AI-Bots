<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__ - Graph</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #041027; color: #eaf2ff;
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; overflow: hidden; }
  #bar {
    position: fixed; inset: 0 0 auto 0; display: flex; align-items: center; gap: 12px;
    padding: 10px 14px; background: #061530ee; border-bottom: 1px solid #173464; z-index: 5;
  }
  #bar a.back {
    padding: 8px 14px; border: 1px solid #2b5390; border-radius: 10px; background: #0b1f42cc;
    color: #cfe6ff; text-decoration: none; font-weight: 700; font-size: 14px; white-space: nowrap;
  }
  #bar a.back:hover { background: #12305e; }
  #title { font-weight: 700; font-size: 15px; color: #ffd479; white-space: nowrap; }
  #search {
    margin-left: auto; padding: 8px 12px; border-radius: 10px; border: 1px solid #2b5390;
    background: #081c3c; color: #eaf2ff; font-size: 14px; width: 220px;
  }
  #count { font-size: 13px; color: #9fb6d9; white-space: nowrap; }
  #settings {
    padding: 8px 12px; border-radius: 10px; border: 1px solid #2b5390; background: #0b1f42cc;
    color: #cfe6ff; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap;
    font-family: inherit;
  }
  #settings:hover, #settings.on { background: #12305e; border-color: #3f74c4; }
  canvas { position: fixed; inset: 0; display: block; cursor: grab; }
  canvas.dragging { cursor: grabbing; }
  #hint {
    position: fixed; left: 14px; bottom: 12px; font-size: 13px; color: #7d94b8; z-index: 5;
  }
  #tip {
    position: fixed; pointer-events: none; z-index: 6; padding: 6px 10px; border-radius: 9px;
    background: #0b1f42f2; border: 1px solid #2b5390; font-size: 14px; color: #eaf2ff;
    display: none; max-width: 320px;
  }
  #panel {
    position: fixed; top: 58px; right: 14px; width: 264px; z-index: 7;
    background: #061530f7; border: 1px solid #2b5390; border-radius: 12px;
    padding: 12px 14px 14px; display: none; box-shadow: 0 14px 34px rgba(0,0,0,.5);
  }
  #panel.open { display: block; }
  #panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
  #panel-head span { font-weight: 700; font-size: 14px; color: #ffd479; }
  #panel-head button {
    padding: 4px 10px; border-radius: 8px; border: 1px solid #2b5390; background: #0b1f42cc;
    color: #cfe6ff; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
  }
  #panel-head button:hover { background: #12305e; }
  .row { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin: 11px 0 0; font-size: 13px; color: #cfe6ff; }
  .row .lbl { grid-column: 1 / 2; }
  .row .val { grid-column: 2 / 3; color: #9fb6d9; font-variant-numeric: tabular-nums; text-align: right; }
  .row input[type=range] { grid-column: 1 / 3; width: 100%; accent-color: #4da3ff; margin: 4px 0 0; }
  @media (max-width: 760px) {
    #bar { flex-wrap: wrap; gap: 8px; padding: 8px 10px; }
    #title { font-size: 14px; }
    #search { width: 100%; margin-left: 0; order: 5; }
    #settings { margin-left: auto; }
    #count { font-size: 12px; }
    #hint { font-size: 11px; left: 10px; bottom: 8px; right: 10px; }
    #bar a.back { padding: 7px 11px; font-size: 13px; }
    #panel { top: auto; bottom: 10px; left: 10px; right: 10px; width: auto; }
  }
</style>
</head>
<body>
<div id="bar">
  <a class="back" href="__APP_URL__">&#8592; Back to __NAME__</a>
  <a class="back" href="__VAULT_URL__">Notes</a>
  <span id="title">Obsidian Graph</span>
  <input id="search" placeholder="Filter notes..." autocomplete="off">
  <button id="settings" type="button">&#9881; Graph settings</button>
  <span id="count"></span>
</div>
<div id="panel">
  <div id="panel-head"><span>Graph settings</span><button id="reset" type="button">Reset</button></div>
  <div id="controls"></div>
</div>
<canvas id="cv"></canvas>
<div id="hint">drag a dot &middot; scroll to zoom &middot; drag background to pan &middot; click a dot to open its note &middot; settings in the top bar</div>
<div id="tip"></div>
<script>
const GRAPH = __GRAPH_JSON__;
const VAULT_URL = "__VAULT_URL__";

const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('tip');
let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

// ---- graph settings (the Obsidian controls) --------------------------------
const DEFAULTS = {
  nodeSize: 1,        // 0.2 - 3    bubble size
  linkDistance: 110,  // 20 - 300   how far apart linked bubbles sit
  linkForce: 1,       // 0 - 3      how hard the lines pull
  repel: 1,           // 0 - 3      push between unlinked bubbles
  center: 1,          // 0 - 1      pull towards the middle
  textFade: 0.5,      // 0 - 3      zoom at which labels appear
};
const S = Object.assign({}, DEFAULTS);
try { Object.assign(S, JSON.parse(localStorage.getItem('ob_graph_settings') || '{}')); } catch (e) {}
function saveSettings() {
  try { localStorage.setItem('ob_graph_settings', JSON.stringify(S)); } catch (e) {}
}

const CONTROLS = [
  ['nodeSize', 'Node size', 0.2, 3, 0.1],
  ['linkDistance', 'Link distance', 20, 300, 5],
  ['linkForce', 'Link force', 0, 3, 0.1],
  ['repel', 'Repel force', 0, 3, 0.1],
  ['center', 'Center force', 0, 1, 0.05],
  ['textFade', 'Text fade threshold', 0, 3, 0.1],
];

const panel = document.getElementById('panel');
const inputs = {};
(function buildControls() {
  const box = document.getElementById('controls');
  for (const [key, label, min, max, step] of CONTROLS) {
    const row = document.createElement('label');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'val';
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = min; inp.max = max; inp.step = step; inp.value = S[key];
    val.textContent = S[key];
    inp.addEventListener('input', () => {
      S[key] = parseFloat(inp.value);
      val.textContent = inp.value;
      saveSettings();
    });
    row.append(lbl, val, inp);
    box.appendChild(row);
    inputs[key] = { inp, val };
  }
})();

document.getElementById('settings').addEventListener('click', (e) => {
  panel.classList.toggle('open');
  e.currentTarget.classList.toggle('on', panel.classList.contains('open'));
});
document.getElementById('reset').addEventListener('click', () => {
  Object.assign(S, DEFAULTS);
  for (const [key, { inp, val }] of Object.entries(inputs)) { inp.value = S[key]; val.textContent = S[key]; }
  saveSettings();
});

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize); resize();

// nodes and links
const nodes = GRAPH.nodes.map((n, i) => ({
  ...n, i,
  x: (Math.random() - 0.5) * Math.min(W, 900),
  y: (Math.random() - 0.5) * Math.min(H, 700),
  vx: 0, vy: 0,
}));
const byId = new Map(nodes.map(n => [n.id, n]));
const links = GRAPH.links
  .map(l => ({ s: byId.get(l.source), t: byId.get(l.target) }))
  .filter(l => l.s && l.t);
nodes.forEach(n => { n.deg = 0; });
links.forEach(l => { l.s.deg++; l.t.deg++; });

const view = { x: 0, y: 0, k: 1 };
let hover = null, dragNode = null, panning = false, last = null, filter = '', pinchStart = null;

function toWorld(px, py) { return { x: (px - W / 2) / view.k - view.x, y: (py - H / 2) / view.k - view.y }; }
function toScreen(x, y) { return { x: (x + view.x) * view.k + W / 2, y: (y + view.y) * view.k + H / 2 }; }

// ---- force simulation ----
function tick() {
  const k = 0.06;
  // repulsion
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const d = Math.sqrt(d2);
      const rep = 2600 * S.repel / d2;
      const fx = (dx / d) * rep, fy = (dy / d) * rep;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
  }
  // springs
  for (const l of links) {
    const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const target = S.linkDistance;
    const f = (d - target) * 0.02 * S.linkForce;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy;
  }
  // gravity to centre
  for (const n of nodes) {
    n.vx += -n.x * 0.004 * S.center;
    n.vy += -n.y * 0.004 * S.center;
    n.vx *= 0.85; n.vy *= 0.85;
    n.x += n.vx * k * 10;
    n.y += n.vy * k * 10;
  }
}

function radius(n) { return (5 + Math.min(n.deg, 12) * 1.7) * S.nodeSize; }

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(view.k, view.k);
  ctx.translate(view.x, view.y);

  // links
  for (const l of links) {
    const dim = filter && !match(l.s) && !match(l.t);
    ctx.strokeStyle = dim ? 'rgba(120,160,220,.08)' : 'rgba(150,190,255,.30)';
    ctx.lineWidth = 1 / view.k;
    ctx.beginPath();
    ctx.moveTo(l.s.x, l.s.y);
    ctx.lineTo(l.t.x, l.t.y);
    ctx.stroke();
  }

  // the closer you zoom, the more labels show (Obsidian's text fade threshold)
  const fade = Math.max(0, Math.min(1, (view.k - S.textFade) / 0.5));

  // nodes
  for (const n of nodes) {
    const dim = filter && !match(n);
    const r = radius(n);
    const isHover = hover === n || (hover && links.some(l => (l.s === hover && l.t === n) || (l.t === hover && l.s === n)));
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = dim ? 'rgba(90,120,170,.25)' : (isHover ? '#ffd479' : n.color);
    ctx.fill();
    ctx.lineWidth = 1.2 / view.k;
    ctx.strokeStyle = 'rgba(10,26,52,.9)';
    ctx.stroke();

    const alpha = hover === n ? 1 : fade;
    if (!dim && alpha > 0.02) {
      ctx.globalAlpha = alpha;
      ctx.font = `${13 / view.k}px system-ui, sans-serif`;
      ctx.fillStyle = hover === n ? '#ffd479' : 'rgba(226,238,255,.92)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.label, n.x, n.y + r + 3 / view.k);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function match(n) { return !filter || n.label.toLowerCase().includes(filter); }

function loop() { tick(); draw(); requestAnimationFrame(loop); }
loop();

// ---- interaction ----
function pick(px, py) {
  const w = toWorld(px, py);
  let best = null, bestD = Infinity;
  for (const n of nodes) {
    const dx = n.x - w.x, dy = n.y - w.y;
    const d2 = dx * dx + dy * dy;
    const r = radius(n) + 6 / view.k;
    if (d2 < r * r && d2 < bestD) { best = n; bestD = d2; }
  }
  return best;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = toWorld(e.clientX, e.clientY);
  view.k *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
  view.k = Math.max(0.25, Math.min(4, view.k));
  const after = toWorld(e.clientX, e.clientY);
  view.x += after.x - before.x;
  view.y += after.y - before.y;
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  const n = pick(e.clientX, e.clientY);
  if (n) { dragNode = n; canvas.classList.add('dragging'); }
  else { panning = true; last = { x: e.clientX, y: e.clientY }; canvas.classList.add('dragging'); }
});

canvas.addEventListener('mousemove', (e) => {
  if (dragNode) {
    const w = toWorld(e.clientX, e.clientY);
    dragNode.x = w.x; dragNode.y = w.y; dragNode.vx = 0; dragNode.vy = 0;
    return;
  }
  if (panning && last) {
    view.x += (e.clientX - last.x) / view.k;
    view.y += (e.clientY - last.y) / view.k;
    last = { x: e.clientX, y: e.clientY };
    return;
  }
  const n = pick(e.clientX, e.clientY);
  if (n !== hover) hover = n;
  if (n) {
    tip.style.display = 'block';
    tip.textContent = n.label + '  (' + n.deg + (n.deg === 1 ? ' link' : ' links') + ')';
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(e.clientX + 14, W - tw - 10) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
  } else {
    tip.style.display = 'none';
  }
});

window.addEventListener('mouseup', (e) => {
  if (dragNode) {
    const moved = Math.hypot(dragNode.x - toWorld(e.clientX, e.clientY).x, dragNode.y - toWorld(e.clientX, e.clientY).y);
    const n = dragNode;
    dragNode = null; canvas.classList.remove('dragging');
    if (moved < 2 && n.anchor) window.location.href = VAULT_URL + n.anchor;
    return;
  }
  panning = false; last = null; canvas.classList.remove('dragging');
});


// ---- touch: pan, drag a dot, pinch to zoom, tap to open ----
let touchStart = null, touchMoved = 0;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
    touchMoved = 0;
    const n = pick(t.clientX, t.clientY);
    if (n) { dragNode = n; } else { panning = true; last = { x: t.clientX, y: t.clientY }; }
  } else if (e.touches.length === 2) {
    const [a, b] = e.touches;
    pinchStart = {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      k: view.k,
    };
    dragNode = null; panning = false;
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    if (touchStart) touchMoved = Math.max(touchMoved, Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y));
    if (dragNode) {
      const w = toWorld(t.clientX, t.clientY);
      dragNode.x = w.x; dragNode.y = w.y; dragNode.vx = 0; dragNode.vy = 0;
    } else if (panning && last) {
      view.x += (t.clientX - last.x) / view.k;
      view.y += (t.clientY - last.y) / view.k;
      last = { x: t.clientX, y: t.clientY };
    }
  } else if (e.touches.length === 2 && pinchStart) {
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    view.k = Math.max(0.25, Math.min(4, pinchStart.k * (d / Math.max(pinchStart.dist, 1))));
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (dragNode) {
    const n = dragNode;
    dragNode = null;
    if (touchMoved < 8 && n.anchor) window.location.href = VAULT_URL + n.anchor;
  }
  panning = false; last = null; touchStart = null;
  if (e.touches.length === 0) pinchStart = null;
}, { passive: false });

document.getElementById('search').addEventListener('input', (e) => {
  filter = e.target.value.trim().toLowerCase();
});
document.getElementById('count').textContent = nodes.length + ' notes, ' + links.length + ' links';
</script>
</body>
</html>