/* Alexander Bots — Obsidian-style force-directed note graph.
 *
 * window.renderGraph(canvas, notes, onNodeClick)
 *   Mounts an interactive graph on <canvas>. `notes` is an array of
 *   {id, title, links:[ids]}. Clicking/tapping a node calls onNodeClick(id).
 *   Calling renderGraph again destroys any previous instance (no stacked loops).
 *
 * window.__graphSetFilter(text)   — dim nodes whose title/id don't match.
 * window.__graphStats()            — {nodes, links} for the active graph.
 * window.__graphDestroy()          — stop the animation loop, remove listeners.
 *
 * Design language: dark navy #041027 background, glowing gold #ffd479 hub
 * nodes, azure #6db3ff / violet #a78bfa for the rest, links rgba(150,190,255,.3).
 * Top-level is side-effect free (safe for node --check); all DOM/canvas work
 * happens inside renderGraph at runtime.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------- palette
  var BG = '#041027';
  var GOLD = '#ffd479';
  var AZURE = '#6db3ff';
  var VIOLET = '#a78bfa';
  var LINK_COLOR = 'rgba(150,190,255,.3)';
  var LINK_DIM = 'rgba(150,190,255,.08)';
  var TEXT = '#eaf2ff';

  // ---------------------------------------------------------------- helpers
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist2(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  var active = null; // the currently mounted graph instance, if any.

  // ---------------------------------------------------------------- mount
  function renderGraph(canvas, notes, onNodeClick) {
    if (active) { destroyInstance(active); }

    var ctx = canvas.getContext('2d');

    // ------------------------------------------------------------ model
    var idToNode = {};
    var nodeList = (notes || []).map(function (n, i) {
      var node = {
        id: n.id, title: n.title || n.id,
        links: [], x: 0, y: 0, vx: 0, vy: 0,
        degree: 0, radius: 8, color: AZURE, idx: i
      };
      idToNode[node.id] = node;
      return node;
    });
    // Seed positions in a loose circle so the layout starts sane.
    nodeList.forEach(function (n, i) {
      var a = (i / Math.max(nodeList.length, 1)) * Math.PI * 2;
      n.x = Math.cos(a) * 140;
      n.y = Math.sin(a) * 140;
    });

    var edges = [];
    var seenEdge = {};
    nodeList.forEach(function (n) {
      var src = idToNode[n.id];
      (notes.filter(function (m) { return m.id === n.id; })[0].links || []).forEach(function (lid) {
        var dst = idToNode[lid];
        if (!dst || dst === src) { return; }
        var key = [src.id, dst.id].sort().join('|');
        if (seenEdge[key]) { return; }
        seenEdge[key] = true;
        edges.push({ a: src, b: dst });
        src.degree++; dst.degree++;
        src.links.push(dst.id); dst.links.push(src.id);
      });
    });

    var maxDegree = 1;
    nodeList.forEach(function (n) { if (n.degree > maxDegree) { maxDegree = n.degree; } });
    nodeList.forEach(function (n) {
      n.radius = 7 + n.degree * 2.2;
      if (n.degree === maxDegree && maxDegree > 1) {
        n.color = GOLD; // hub node(s)
      } else {
        n.color = (n.idx % 2 === 0) ? AZURE : VIOLET;
      }
    });

    // ------------------------------------------------------------ state
    var inst = {
      canvas: canvas, ctx: ctx, nodes: nodeList, edges: edges,
      running: true, raf: 0,
      view: { x: 0, y: 0, scale: 1 },
      hover: null, dragNode: null, panning: false,
      downPos: null, downNode: null, moved: false,
      pinch: null, filter: '', settled: 0, simActive: true,
      dirty: true, listeners: [], tooltip: null, dpr: 1,
      w: 0, h: 0
    };

    // ------------------------------------------------------------ tooltip
    var tip = document.createElement('div');
    tip.style.cssText =
      'position:absolute;pointer-events:none;z-index:5;display:none;' +
      'background:rgba(4,16,39,.92);border:1px solid #2b5390;border-radius:8px;' +
      'color:#eaf2ff;font:12px/1.5 system-ui,sans-serif;padding:6px 10px;' +
      'box-shadow:0 0 18px rgba(255,212,121,.25);white-space:nowrap;';
    var parent = canvas.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    if (parent) { parent.appendChild(tip); }
    inst.tooltip = tip;

    function showTip(node, sx, sy) {
      tip.innerHTML = '';
      var b = document.createElement('b');
      b.style.color = GOLD;
      b.textContent = node.title;
      tip.appendChild(b);
      var span = document.createElement('span');
      span.style.color = '#9db8e8';
      span.textContent = ' · ' + node.degree + (node.degree === 1 ? ' link' : ' links');
      tip.appendChild(span);
      tip.style.display = 'block';
      tip.style.left = (sx + 14) + 'px';
      tip.style.top = (sy - 10) + 'px';
    }
    function hideTip() { tip.style.display = 'none'; }

    // ------------------------------------------------------------ geometry
    function resize() {
      var r = canvas.getBoundingClientRect();
      inst.dpr = Math.min(window.devicePixelRatio || 1, 2);
      inst.w = Math.max(r.width, 1);
      inst.h = Math.max(r.height, 1);
      canvas.width = Math.round(inst.w * inst.dpr);
      canvas.height = Math.round(inst.h * inst.dpr);
      inst.dirty = true;
    }

    function toWorld(sx, sy) {
      return {
        x: (sx - inst.w / 2 - inst.view.x) / inst.view.scale,
        y: (sy - inst.h / 2 - inst.view.y) / inst.view.scale
      };
    }
    function toScreen(wx, wy) {
      return {
        x: wx * inst.view.scale + inst.w / 2 + inst.view.x,
        y: wy * inst.view.scale + inst.h / 2 + inst.view.y
      };
    }
    function hitNode(wx, wy) {
      for (var i = nodeList.length - 1; i >= 0; i--) {
        var n = nodeList[i];
        var pad = (n.radius + 6) / inst.view.scale;
        if (dist2(wx, wy, n.x, n.y) <= pad * pad) { return n; }
      }
      return null;
    }

    // ------------------------------------------------------------ physics
    var REPEL = 9000;      // repulsion strength
    var SPRING_LEN = 130;  // edge rest length (world px)
    var SPRING_K = 0.012;  // spring stiffness
    var GRAVITY = 0.008;   // centering pull
    var DAMPING = 0.86;

    function stepPhysics() {
      var i, j, n, m, dx, dy, d2, d, f;
      // Repulsion (n is small; O(n^2) is fine).
      for (i = 0; i < nodeList.length; i++) {
        n = nodeList[i];
        for (j = i + 1; j < nodeList.length; j++) {
          m = nodeList[j];
          dx = n.x - m.x; dy = n.y - m.y;
          d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 1; }
          d = Math.sqrt(d2);
          f = REPEL / d2;
          if (f > 4) { f = 4; }
          dx /= d; dy /= d;
          n.vx += dx * f; n.vy += dy * f;
          m.vx -= dx * f; m.vy -= dy * f;
        }
      }
      // Springs along edges.
      for (i = 0; i < edges.length; i++) {
        var e = edges[i], a = e.a, b = e.b;
        dx = b.x - a.x; dy = b.y - a.y;
        d = Math.sqrt(dx * dx + dy * dy) || 1;
        f = (d - SPRING_LEN) * SPRING_K;
        dx /= d; dy /= d;
        a.vx += dx * f * d; a.vy += dy * f * d;
        b.vx -= dx * f * d; b.vy -= dy * f * d;
      }
      // Centering gravity + integration.
      var maxV = 0;
      for (i = 0; i < nodeList.length; i++) {
        n = nodeList[i];
        if (n === inst.dragNode) { n.vx = 0; n.vy = 0; continue; }
        n.vx += -n.x * GRAVITY;
        n.vy += -n.y * GRAVITY;
        n.vx *= DAMPING; n.vy *= DAMPING;
        n.x += n.vx; n.y += n.vy;
        var v = Math.abs(n.vx) + Math.abs(n.vy);
        if (v > maxV) { maxV = v; }
      }
      if (maxV < 0.05) {
        inst.settled++;
        if (inst.settled > 90) { inst.simActive = false; }
      } else {
        inst.settled = 0;
      }
    }
    function wake() { inst.simActive = true; inst.settled = 0; inst.dirty = true; }

    // ------------------------------------------------------------ filter
    function matches(n) {
      if (!inst.filter) { return true; }
      return (n.title + ' ' + n.id).toLowerCase().indexOf(inst.filter) !== -1;
    }

    // ------------------------------------------------------------ draw
    function draw() {
      var c = inst.ctx;
      c.setTransform(inst.dpr, 0, 0, inst.dpr, 0, 0);
      c.fillStyle = BG;
      c.fillRect(0, 0, inst.w, inst.h);

      var i, p, q, e;
      // Edges.
      for (i = 0; i < edges.length; i++) {
        e = edges[i];
        var lit = matches(e.a) && matches(e.b);
        p = toScreen(e.a.x, e.a.y); q = toScreen(e.b.x, e.b.y);
        c.strokeStyle = lit ? LINK_COLOR : LINK_DIM;
        c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
      }
      // Nodes.
      for (i = 0; i < nodeList.length; i++) {
        var n = nodeList[i];
        p = toScreen(n.x, n.y);
        var r = n.radius * inst.view.scale;
        var on = matches(n);
        var alpha = on ? 1 : 0.14;
        var isHover = inst.hover === n;

        c.globalAlpha = alpha;
        // Glow halo.
        var halo = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
        halo.addColorStop(0, n.color);
        halo.addColorStop(1, 'rgba(4,16,39,0)');
        c.globalAlpha = alpha * (isHover ? 0.85 : 0.45);
        c.fillStyle = halo;
        c.beginPath(); c.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2); c.fill();

        // Core with glow.
        c.globalAlpha = alpha;
        c.shadowColor = n.color;
        c.shadowBlur = isHover ? 26 : 14;
        c.fillStyle = n.color;
        c.beginPath(); c.arc(p.x, p.y, Math.max(r, 2.5), 0, Math.PI * 2); c.fill();
        c.shadowBlur = 0;

        // Bright center dot.
        c.fillStyle = 'rgba(234,242,255,.9)';
        c.beginPath(); c.arc(p.x, p.y, Math.max(r * 0.32, 1.2), 0, Math.PI * 2); c.fill();

        // Label under node.
        c.globalAlpha = on ? (isHover ? 1 : 0.82) : 0.12;
        c.fillStyle = isHover ? GOLD : TEXT;
        c.font = (isHover ? '600 ' : '') + Math.max(11, 11 * inst.view.scale) + 'px system-ui,sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(n.title, p.x, p.y + r + 6);
        c.globalAlpha = 1;
      }
    }

    // ------------------------------------------------------------ events
    function evtPos(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }

    function onMouseDown(ev) {
      var s = evtPos(ev);
      var w = toWorld(s.x, s.y);
      var n = hitNode(w.x, w.y);
      inst.downPos = s;
      inst.downNode = n;
      inst.moved = false;
      if (n) { inst.dragNode = n; wake(); }
      else { inst.panning = true; inst.panStart = { x: inst.view.x, y: inst.view.y }; }
      canvas.setPointerCapture && ev.pointerId !== undefined && canvas.setPointerCapture(ev.pointerId);
    }
    function onMouseMove(ev) {
      var s = evtPos(ev);
      if (inst.downPos) {
        var dx = s.x - inst.downPos.x, dy = s.y - inst.downPos.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) { inst.moved = true; }
        if (inst.moved) {
          if (inst.dragNode) {
            var w = toWorld(s.x, s.y);
            inst.dragNode.x = w.x; inst.dragNode.y = w.y;
            wake();
          } else if (inst.panning) {
            inst.view.x = inst.panStart.x + dx;
            inst.view.y = inst.panStart.y + dy;
            inst.dirty = true;
          }
          hideTip();
        }
      } else {
        // Hover highlight + tooltip.
        var w2 = toWorld(s.x, s.y);
        var n = hitNode(w2.x, w2.y);
        if (n !== inst.hover) {
          inst.hover = n;
          inst.dirty = true;
          if (n) { showTip(n, s.x, s.y); }
          else { hideTip(); }
        }
        canvas.style.cursor = n ? 'pointer' : 'grab';
      }
    }
    function onMouseUp(ev) {
      if (inst.downPos && !inst.moved && inst.downNode && typeof onNodeClick === 'function') {
        onNodeClick(inst.downNode.id);
      }
      inst.downPos = null; inst.downNode = null;
      inst.dragNode = null; inst.panning = false; inst.moved = false;
    }
    function onMouseLeave() {
      inst.hover = null; hideTip();
      inst.downPos = null; inst.dragNode = null; inst.panning = false;
      inst.dirty = true;
    }
    function onWheel(ev) {
      ev.preventDefault();
      var s = evtPos(ev);
      var before = toWorld(s.x, s.y);
      var factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      inst.view.scale = clamp(inst.view.scale * factor, 0.25, 4);
      // Keep the point under the cursor fixed.
      inst.view.x = s.x - inst.w / 2 - before.x * inst.view.scale;
      inst.view.y = s.y - inst.h / 2 - before.y * inst.view.scale;
      inst.dirty = true;
    }

    // ---- touch (1 finger: drag node / pan, tap = open; 2 fingers: pinch zoom)
    function touchPos(t) {
      var r = canvas.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function onTouchStart(ev) {
      ev.preventDefault();
      var ts = ev.touches;
      if (ts.length === 1) {
        var s = touchPos(ts[0]);
        var w = toWorld(s.x, s.y);
        var n = hitNode(w.x, w.y);
        inst.downPos = s; inst.downNode = n; inst.moved = false;
        if (n) { inst.dragNode = n; wake(); }
        else { inst.panning = true; inst.panStart = { x: inst.view.x, y: inst.view.y }; }
      } else if (ts.length === 2) {
        var a = touchPos(ts[0]), b = touchPos(ts[1]);
        inst.pinch = {
          d0: Math.hypot(a.x - b.x, a.y - b.y),
          scale0: inst.view.scale,
          mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
          vx: inst.view.x, vy: inst.view.y
        };
        inst.dragNode = null; inst.panning = false;
        inst.downPos = null; inst.moved = true; // a pinch is never a tap
        hideTip();
      }
    }
    function onTouchMove(ev) {
      ev.preventDefault();
      var ts = ev.touches;
      if (inst.pinch && ts.length === 2) {
        var a = touchPos(ts[0]), b = touchPos(ts[1]);
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        var ns = clamp(inst.pinch.scale0 * d / inst.pinch.d0, 0.25, 4);
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        // Zoom about the original midpoint, then pan by midpoint delta.
        var wx = (inst.pinch.mx - inst.w / 2 - inst.pinch.vx) / inst.pinch.scale0;
        var wy = (inst.pinch.my - inst.h / 2 - inst.pinch.vy) / inst.pinch.scale0;
        inst.view.scale = ns;
        inst.view.x = mx - inst.w / 2 - wx * ns;
        inst.view.y = my - inst.h / 2 - wy * ns;
        inst.dirty = true;
        return;
      }
      if (ts.length === 1 && inst.downPos) {
        var s = touchPos(ts[0]);
        var dx = s.x - inst.downPos.x, dy = s.y - inst.downPos.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) { inst.moved = true; }
        if (inst.moved) {
          if (inst.dragNode) {
            var w = toWorld(s.x, s.y);
            inst.dragNode.x = w.x; inst.dragNode.y = w.y;
            wake();
          } else if (inst.panning) {
            inst.view.x = inst.panStart.x + dx;
            inst.view.y = inst.panStart.y + dy;
            inst.dirty = true;
          }
        }
      }
    }
    function onTouchEnd(ev) {
      if (inst.pinch && ev.touches.length < 2) { inst.pinch = null; }
      if (ev.touches.length === 0) {
        if (inst.downPos && !inst.moved && inst.downNode && typeof onNodeClick === 'function') {
          onNodeClick(inst.downNode.id);
        }
        inst.downPos = null; inst.downNode = null;
        inst.dragNode = null; inst.panning = false; inst.moved = false;
      }
    }

    function add(el, type, fn, opts) {
      el.addEventListener(type, fn, opts);
      inst.listeners.push([el, type, fn, opts]);
    }
    add(canvas, 'mousedown', onMouseDown);
    add(canvas, 'mousemove', onMouseMove);
    add(window, 'mouseup', onMouseUp);
    add(canvas, 'mouseleave', onMouseLeave);
    add(canvas, 'wheel', onWheel, { passive: false });
    add(canvas, 'touchstart', onTouchStart, { passive: false });
    add(canvas, 'touchmove', onTouchMove, { passive: false });
    add(canvas, 'touchend', onTouchEnd);
    add(canvas, 'touchcancel', onTouchEnd);
    add(window, 'resize', resize);

    resize();

    // ------------------------------------------------------------ main loop
    function tick() {
      if (!inst.running) { return; }
      if (inst.simActive) { stepPhysics(); inst.dirty = true; }
      if (inst.dirty) { draw(); inst.dirty = false; }
      inst.raf = requestAnimationFrame(tick);
    }
    tick();

    active = inst;

    window.__graphSetFilter = function (text) {
      if (active !== inst) { return; }
      inst.filter = String(text || '').toLowerCase().trim();
      inst.dirty = true;
    };
    window.__graphStats = function () {
      if (active !== inst) { return { nodes: 0, links: 0 }; }
      return { nodes: inst.nodes.length, links: inst.edges.length };
    };
    window.__graphDestroy = function () {
      if (active === inst) { destroyInstance(inst); active = null; }
    };

    return inst;
  }

  function destroyInstance(inst) {
    inst.running = false;
    if (inst.raf) { cancelAnimationFrame(inst.raf); }
    inst.listeners.forEach(function (l) {
      l[0].removeEventListener(l[1], l[2], l[3]);
    });
    inst.listeners = [];
    if (inst.tooltip && inst.tooltip.parentNode) {
      inst.tooltip.parentNode.removeChild(inst.tooltip);
    }
  }

  window.renderGraph = renderGraph;
  window.__graphDestroy = function () {
    if (active) { destroyInstance(active); active = null; }
  };
  window.__graphSetFilter = function () {};
  window.__graphStats = function () { return { nodes: 0, links: 0 }; };
})();
