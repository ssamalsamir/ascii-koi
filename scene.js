/*
 * Scenes: everything that is not the koi pond, drawn in the same character cells.
 *
 * A scene paints with the ordinary canvas 2D API onto a small hidden canvas,
 * two samples per cell side, in viewport pixels. Every frame that canvas is
 * read back and each cell becomes one glyph: how much of the cell is covered
 * and how dark the paint is pick the glyph (shadow dense, light sparse, edges
 * thin), the paint's colour colours it, and a faint tile of the same colour
 * gives a body its mass. Particles (snow, sparks, stars, lights) skip the paint
 * and ask for a glyph in a cell directly.
 *
 * The calendar picks the scene: Halloween, Thanksgiving, Christmas and New
 * Year in season, and one animal a day the rest of the year.
 *
 * Scenes register themselves in AsciiKoi.scenes[name] = api => ({ paint(g, t, dt), poke?(x, y) }).
 */
(function (global) {
  "use strict";
  const K = global.AsciiKoi = global.AsciiKoi || {};
  const scenes = K.scenes = K.scenes || {};

  /* ── small maths, shared with the scenes ── */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, e) => a + (b - a) * e;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgb = hex => { const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16, (n >> 8) & 255, n & 255]; };
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  /* a seeded random stream, so a scene looks the same every time it starts */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  const h2 = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const noise1 = (x, seed = 0) => { const i = Math.floor(x), u = sstep(0, 1, x - i); return lerp(h2(i, seed), h2(i + 1, seed), u); };

  /* ── drawing helpers: shapes in viewport pixels ── */
  const draw = {
    ell(g, x, y, rx, ry, rot, fill) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, Math.max(1e-6, rx), Math.max(1e-6, ry), rot || 0, 0, 6.2832); g.fill(); },
    /* a closed smooth outline through the points */
    blob(g, pts, fill) {
      const n = pts.length, mid = i => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
      g.fillStyle = fill; g.beginPath();
      const m0 = mid(n - 1); g.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) { const m = mid(i); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
      g.fill();
    },
    /* a tapered capsule from (x1, y1), w1 wide, to (x2, y2), w2 wide: legs, necks, tails */
    limb(g, x1, y1, x2, y2, w1, w2, fill) {
      const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a);
      g.fillStyle = fill; g.beginPath();
      g.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2); g.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2);
      g.lineTo(x2 - nx * w2 / 2, y2 - ny * w2 / 2); g.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2); g.fill();
      g.beginPath(); g.arc(x1, y1, w1 / 2, 0, 6.2832); g.arc(x2, y2, w2 / 2, 0, 6.2832); g.fill();
    },
    /* a chain of limbs through points, widths from w0 to w1 */
    chain(g, pts, w0, w1, fill) {
      for (let i = 0; i < pts.length - 1; i++) {
        const k0 = i / (pts.length - 1), k1 = (i + 1) / (pts.length - 1);
        draw.limb(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], lerp(w0, w1, k0), lerp(w0, w1, k1), fill);
      }
    },
    /* a fill lit from the upper left: lighter toward the light, darker away from it */
    lit(g, x, y, r, c, k = 0.35) {
      const gr = g.createRadialGradient(x - r * 0.45, y - r * 0.5, 0, x, y, r * 1.25);
      gr.addColorStop(0, css(mix(c, [255, 255, 255], k)));
      gr.addColorStop(0.55, css(c));
      gr.addColorStop(1, css(mix(c, [0, 0, 0], k + 0.15)));
      return gr;
    },
    vgrad(g, y0, y1, c0, c1, a0 = 1, a1 = 1) {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, css(c0, a0)); gr.addColorStop(1, css(c1, a1));
      return gr;
    }
  };

  /* ── the calendar ── */
  const ANIMALS = ["koi", "birds", "cat", "deer", "jellyfish", "tiger", "elephant", "lion"];
  /* the fourth Thursday of November */
  const thanksgiving = y => { const d = new Date(y, 10, 1).getDay(); return 1 + ((4 - d + 7) % 7) + 21; };
  function pick(date) {
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    if (m === 9 && d >= 15) return "halloween";
    if (m === 10) {
      /* the turkey from the first of November to the Sunday after Thanksgiving */
      if (d <= thanksgiving(y) + 3) return "turkey";
      return "tree";
    }
    if (m === 11 && d <= 26) return "tree";
    if ((m === 11 && d >= 27) || (m === 0 && d <= 2)) return "newyear";
    /* one animal a day, in turn */
    const day = Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 864e5);
    return ANIMALS[(day + y) % ANIMALS.length];
  }

  const MONO = `"Geist Mono", ui-monospace, Menlo, monospace`;
  /* by darkness: light paint gets sparse glyphs, shadow dense ones */
  const RAMP = ".:-=+*#%@";
  const S = 2;

  function createScene(name, opts) {
    const factory = scenes[name];
    if (!factory) throw new Error(`no scene "${name}"`);
    const canvas = opts.canvas, ctx = canvas.getContext("2d");
    const pc = document.createElement("canvas"), g = pc.getContext("2d", { willReadFrequently: true });
    const frameMs = 1000 / (opts.fps || 30) - 2;
    let vw = 0, vh = 0, cw = 8, ch = 11, cols = 0, rows = 0, dpr = 1, P = null, t = 0, paused = false, running = false, dirty = true;
    let over = new Map();
    const cssCache = new Map();
    const cssOf = n => { let s = cssCache.get(n); if (!s) { s = `rgb(${n >> 16},${(n >> 8) & 255},${n & 255})`; if (cssCache.size > 4000) cssCache.clear(); cssCache.set(n, s); } return s; };
    /* colours land on a coarse grid, so neighbouring cells share a fill and the canvas switches style less */
    const pack = c => ((clamp(c[0], 0, 255) & 0xf8) << 16) | ((clamp(c[1], 0, 255) & 0xf8) << 8) | (clamp(c[2], 0, 255) & 0xf8);

    const api = {
      get w() { return vw; }, get h() { return vh; }, get cw() { return cw; }, get ch() { return ch; }, get P() { return P; },
      /* a glyph in the cell under viewport point (x, y); the brightest request for a cell wins */
      glyph(x, y, chr, c, a = 1) {
        const col = Math.floor(x / cw), row = Math.floor(y / ch);
        if (col < 0 || row < 0 || col >= cols || row >= rows || a <= 0.02) return;
        const i = row * cols + col, o = over.get(i);
        if (!o || o.a < a) over.set(i, { chr, c, a: Math.min(1, a) });
      }
    };
    const scene = factory(api);

    function size(w, h) {
      dpr = Math.min(2, global.devicePixelRatio || 1);
      vw = w; vh = h;
      cw = clamp(Math.round(vw / 150), 7, 10); ch = cw + 3;
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      cols = Math.ceil(vw / cw); rows = Math.ceil(vh / ch);
      pc.width = cols * S; pc.height = rows * S;
      dirty = true;
    }

    function colors() {
      const c = opts.palette();
      P = { dark: !!c.dark, water: rgb(c.water), ink: rgb(c.ink), accent: rgb(c.accent) };
      P.bgL = lum(P.water);
      dirty = true;
    }

    function render() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, pc.width, pc.height);
      g.setTransform(S / cw, 0, 0, S / ch, 0, 0);
      over = new Map();
      scene.paint(g, t, P);
      const d = g.getImageData(0, 0, pc.width, pc.height).data, W = pc.width;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = css(P.water);
      ctx.fillRect(0, 0, vw, vh);
      ctx.font = `600 ${Math.round(ch * 0.74)}px ${MONO}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";

      /* the scene fades under the title, as the koi do, so the clock keeps a clear space */
      const box = opts.dim ? opts.dim() : null, pad = cw * 8;
      const dimAt = box ? (x, y) => 0.5 + 0.5 * sstep(0, pad, Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom))) : () => 1;
      const snap = v => Math.round(v * dpr) / dpr, gap = cw * 0.05;
      const cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        let sa = 0, sr = 0, sg = 0, sb = 0;
        for (let j = 0; j < S; j++) for (let k = 0; k < S; k++) {
          const p = ((r * S + j) * W + c * S + k) * 4, a = d[p + 3];
          sa += a; sr += d[p] * a; sg += d[p + 1] * a; sb += d[p + 2] * a;
        }
        const o = over.get(i);
        if (sa < 10 && !o) continue;
        const x = c * cw + cw / 2, y = r * ch + ch / 2, dim = dimAt(x, y);
        const a = sa / (S * S * 255), col = sa ? [sr / sa, sg / sa, sb / sa] : P.water;
        /* a requested glyph keeps the body under it: a star over the moon, snow over a jellyfish */
        if (o) { cells.push({ x, y, c: pack(o.c), a: o.a * dim, chr: o.chr, tile: a >= 0.55 ? a * 0.92 * dim : 0, tc: pack(col) }); continue; }
        if (a < 0.55) {
          /* thin paint (an edge, the land behind) is a light stroke in its own colour */
          cells.push({ x, y, c: pack(col), a: (0.3 + 0.7 * a) * dim, chr: RAMP[Math.min(4, Math.round(a * 8))], tile: 0 });
          continue;
        }
        /* a body is a tile in its colour with a darker glyph pressed in: shadowed paint dense, lit paint sparse */
        const dark = clamp(1 - lum(col) / 255, 0, 1);
        const chr = RAMP[clamp(Math.round((0.15 + 0.85 * dark) * (RAMP.length - 1)), 0, RAMP.length - 1)];
        cells.push({ x, y, c: pack(mix(col, [0, 0, 0], 0.45)), a: 0.9 * dim, chr, tile: a * 0.92 * dim, tc: pack(col) });
      }
      /* bodies cast a soft shadow down and to the right, under everything */
      ctx.fillStyle = P.dark ? "#000" : css(mix(P.water, [0, 0, 0], 0.45));
      for (const e of cells) {
        if (!e.tile) continue;
        ctx.globalAlpha = e.tile * 0.3;
        ctx.fillRect(snap(e.x - cw / 2 + cw * 0.6), snap(e.y - ch / 2 + ch * 0.5), snap(cw), snap(ch));
      }
      /* every tile, then every glyph: long runs of one kind for the GPU */
      let fill = -1;
      for (const e of cells) {
        if (!e.tile) continue;
        if (e.tc !== fill) { fill = e.tc; ctx.fillStyle = cssOf(fill); }
        const x0 = snap(e.x - cw / 2 + gap), y0 = snap(e.y - ch / 2 + gap);
        ctx.globalAlpha = e.tile; ctx.fillRect(x0, y0, snap(e.x + cw / 2 - gap) - x0, snap(e.y + ch / 2 - gap) - y0);
      }
      fill = -1;
      for (const e of cells) {
        if (e.c !== fill) { fill = e.c; ctx.fillStyle = cssOf(fill); }
        ctx.globalAlpha = e.a; ctx.fillText(e.chr, e.x, e.y);
      }
      ctx.globalAlpha = 1;
    }

    let last = 0, drawn = 0;
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (now - drawn < frameMs && !dirty) return;
      const dt = Math.min(0.1, (now - last) / 1000 || 0);
      last = now; drawn = now;
      if (!paused && !opts.reduce) t += dt;
      if ((paused || opts.reduce) && !dirty) return;
      dirty = false;
      render();
    }

    return {
      size(w, h) { size(w, h); },
      colors,
      render,
      start() {
        /* a still scene (reduced motion) is shown a few seconds in, once things have settled */
        if (opts.reduce) t = 6;
        running = true;
        requestAnimationFrame(now => { last = now; frame(now); });
      },
      stop() { running = false; },
      pause(v) { paused = v === undefined ? !paused : !!v; dirty = true; return paused; },
      get paused() { return paused; },
      get time() { return t; },
      paw: (x, y) => { scene.poke && scene.poke(x, y, t); dirty = true; },
      feed: (x, y) => { scene.poke && scene.poke(x, y, t); dirty = true; },
      tint: () => null,
      light: () => 0
    };
  }

  Object.assign(K, { createScene, pickScene: pick, ANIMALS, sceneKit: { clamp, lerp, sstep, mix, rgb, css, lum, rng, h2, noise1, draw } });
})(typeof window !== "undefined" ? window : globalThis);
