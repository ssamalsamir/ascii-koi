/*
 * The holidays: a jack-o'-lantern night for Halloween, a strutting turkey for
 * Thanksgiving, a lit tree in the snow for Christmas and fireworks over the
 * city for the New Year. Painted shapes become cells in scene.js; sparks, snow,
 * lights and stars ask for their glyphs directly.
 */
(function (global) {
  "use strict";
  const K = global.AsciiKoi;
  const { clamp, lerp, mix, css, rng, noise1, draw } = K.sceneKit;
  const TAU = Math.PI * 2;

  /* things that fall and sway: snow, leaves */
  function fall(api, list, t, speed, glyphs) {
    const { w, h } = api;
    for (const f of list) {
      const y = ((f.y + t * speed * (0.4 + f.s)) % 1) * h, x = ((f.x * w + Math.sin(t * 0.7 + f.p) * 28 * f.s) % w + w) % w;
      api.glyph(x, y, glyphs[(f.p * 10 | 0) % glyphs.length], f.c, 0.35 + 0.55 * f.s);
    }
  }
  const scatter = (r, n, cols) => Array.from({ length: n }, () => ({ x: r(), y: r(), s: r(), p: r() * TAU, c: cols[(r() * cols.length) | 0] }));

  /* ── Halloween ── */
  const PUMPKIN = [232, 118, 26], STEM = [90, 100, 40];
  function pumpkin(g, api, x, y, R, t, seed) {
    const f = 0.65 + 0.35 * noise1(t * 6, seed), glow = mix([230, 130, 30], [255, 240, 170], f);
    const gr = g.createRadialGradient(x, y + R * 0.8, R * 0.2, x, y + R * 0.8, R * 2.2);
    gr.addColorStop(0, css(glow, 0.14 * f)); gr.addColorStop(1, css(glow, 0));
    g.fillStyle = gr; g.fillRect(x - R * 2.2, y + R * 0.6, R * 4.4, R * 1.2);
    draw.limb(g, x, y - R * 0.85, x + R * 0.1, y - R * 1.15, R * 0.16, R * 0.1, css(STEM));
    for (const k of [-0.55, 0.55, -0.28, 0.28, 0]) draw.ell(g, x + k * R, y, R * (0.55 - Math.abs(k) * 0.25), R * 0.85, 0, draw.lit(g, x + k * R, y, R, mix(PUMPKIN, [0, 0, 0], Math.abs(k) * 0.3), 0.3));
    /* the face, lit from inside by a candle that never quite settles */
    g.fillStyle = css(glow);
    for (const e of [-1, 1]) { g.beginPath(); g.moveTo(x + e * R * 0.55, y - R * 0.05); g.lineTo(x + e * R * 0.1, y - R * 0.05); g.lineTo(x + e * R * 0.32, y - R * 0.5); g.fill(); }
    g.beginPath(); g.moveTo(x - R * 0.12, y + R * 0.12); g.lineTo(x + R * 0.12, y + R * 0.12); g.lineTo(x, y - R * 0.08); g.fill();
    g.beginPath(); g.moveTo(x - R * 0.65, y + R * 0.22);
    for (let i = 0; i <= 6; i++) g.lineTo(x - R * 0.65 + i * R * 0.217, y + R * (i % 2 ? 0.36 : 0.22));
    g.quadraticCurveTo(x, y + R * 0.8, x - R * 0.65, y + R * 0.22); g.fill();
  }
  /* a bare tree: branches split and taper, the tips sway */
  function bareTree(g, x, y, len, a, w, depth, r, t, c) {
    const sway = depth < 3 ? Math.sin(t * 0.8 + x * 0.01) * 0.04 * (4 - depth) : 0;
    const x2 = x + Math.cos(a + sway) * len, y2 = y + Math.sin(a + sway) * len;
    draw.limb(g, x, y, x2, y2, w, w * 0.65, css(c));
    if (depth <= 0) return;
    const n = depth > 3 ? 2 : 2 + (r() > 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) bareTree(g, x2, y2, len * (0.62 + r() * 0.15), a + (i - (n - 1) / 2) * (0.5 + r() * 0.3), w * 0.65, depth - 1, r, t, c);
  }
  K.scenes.halloween = api => {
    const r = rng(31), bats = Array.from({ length: 7 }, () => ({ p: r() * TAU, s: 0.5 + r() * 0.6, y: 0.1 + r() * 0.35, sp: 0.03 + r() * 0.03 }));
    const stars = scatter(r, 70, [[230, 230, 210]]);
    return {
      paint(g, t) {
        const { w, h, P } = api, gy = h * 0.88;
        for (const s of stars) if (s.y < 0.6) api.glyph(s.x * w, s.y * h, s.s > 0.8 ? "+" : "·", s.c, 0.2 + 0.4 * Math.abs(Math.sin(t * 0.6 + s.p)));
        const mr = h * 0.11, mx = w * 0.8, my = h * 0.2;
        draw.ell(g, mx, my, mr, mr, 0, draw.lit(g, mx, my, mr, [240, 232, 200], 0.15));
        for (const [cx, cy, cr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.22], [-0.1, 0.35, 0.12]]) draw.ell(g, mx + cx * mr, my + cy * mr, cr * mr, cr * mr, 0, css([200, 192, 160]));
        bareTree(g, w * 0.1, gy, h * 0.24, -Math.PI / 2 - 0.05, h * 0.045, 6, rng(4), t, mix(P.water, [40, 30, 40], 0.6));
        g.fillStyle = draw.vgrad(g, gy, h, [70, 60, 76], [40, 34, 48], 0.4, 0.5); g.fillRect(0, gy, w, h - gy);
        const R = Math.min(w, h) * 0.11;
        pumpkin(g, api, w * 0.68, gy - R * 0.55, R, t, 1);
        pumpkin(g, api, w * 0.8, gy - R * 0.4, R * 0.7, t, 2);
        /* a ghost drifting across, bobbing as it goes */
        const gxp = ((t * 0.025) % 1.3 - 0.15) * w, gyp = h * 0.42 + Math.sin(t * 0.9) * h * 0.03, gr = Math.min(w, h) * 0.06;
        g.fillStyle = css([236, 238, 246], 0.85); g.beginPath();
        g.arc(gxp, gyp, gr, Math.PI, TAU);
        for (let i = 0; i <= 6; i++) g.lineTo(gxp + gr - i * gr / 3, gyp + gr * 1.3 + Math.sin(t * 4 + i) * gr * 0.12 * (i % 2 ? 1 : -1));
        g.fill();
        for (const e of [-1, 1]) draw.ell(g, gxp + e * gr * 0.35, gyp - gr * 0.1, gr * 0.12, gr * 0.2, 0, css([30, 26, 34]));
        /* bats: two wings that beat, crossing the sky on looping paths */
        for (const b of bats) {
          const x = ((t * b.sp + b.p / TAU) % 1.2 - 0.1) * w, y = (b.y + 0.05 * Math.sin(t * 0.9 + b.p)) * h, s = 22 * b.s, f = Math.sin(t * 9 + b.p);
          g.fillStyle = css([56, 46, 64]);
          for (const e of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + e * s * 1.6, y - f * s * 0.8); g.lineTo(x + e * s * 0.9, y + s * 0.15); g.lineTo(x + e * s * 0.5, y - f * s * 0.2 + s * 0.3); g.fill(); }
          draw.ell(g, x, y, s * 0.3, s * 0.4, 0, css([56, 46, 64]));
        }
        /* fog along the ground */
        for (let x = 0; x < w; x += api.cw) {
          const n = noise1(x * 0.01 + t * 0.3, 8);
          if (n > 0.5) api.glyph(x, gy + api.ch * (1 + ((x * 7) % 3)), n > 0.7 ? "~" : "-", [180, 180, 200], (n - 0.5) * 0.8);
        }
      }
    };
  };

  /* ── Thanksgiving ── */
  const BRONZE = [112, 66, 34], RUST = [178, 96, 40], TIP = [232, 206, 160], WATTLE = [210, 50, 40], HEAD = [150, 172, 196];
  K.scenes.turkey = api => {
    const r = rng(23), leaves = scatter(r, 70, [[214, 110, 34], [196, 150, 50], [168, 60, 36], [140, 90, 40]]);
    return {
      paint(g, t) {
        const { w, h } = api, gy = h * 0.9, s = Math.min(w * 0.2, h * 0.36), x = w * 0.78, y = gy - s * 0.45;
        g.fillStyle = draw.vgrad(g, gy, h, [150, 110, 60], [110, 76, 40], 0.35, 0.5); g.fillRect(0, gy, w, h - gy);
        /* pumpkins and gourds by the turkey's feet */
        draw.ell(g, w * 0.88, gy - s * 0.08, s * 0.13, s * 0.1, 0, draw.lit(g, w * 0.88, gy - s * 0.08, s * 0.13, [226, 120, 30], 0.3));
        draw.ell(g, w * 0.55, gy - s * 0.05, s * 0.09, s * 0.07, 0, draw.lit(g, w * 0.55, gy - s * 0.05, s * 0.09, [214, 170, 60], 0.3));
        /* the strut: every few seconds the tail fans wide and the body puffs up */
        const strut = clamp(Math.sin(t * 0.5) * 1.6, 0, 1), span = lerp(1.6, 2.9, strut), R = s * lerp(0.62, 0.78, strut);
        const fx = x - s * 0.08, fy = y - s * 0.1, N = 15;
        for (const [k, c] of [[1, TIP], [0.9, [70, 40, 22]], [0.82, RUST], [0.6, BRONZE]]) {
          for (let i = 0; i < N; i++) {
            const a = -Math.PI / 2 + (i / (N - 1) - 0.5) * span + Math.sin(t * 1.2 + i) * 0.01;
            draw.ell(g, fx + Math.cos(a) * R * k * 0.55, fy + Math.sin(a) * R * k * 0.55, R * k * 0.5, s * 0.075 * (0.7 + k * 0.4), a, css(c));
          }
        }
        /* legs, body, wing */
        for (const e of [-1, 1]) draw.limb(g, x + e * s * 0.06, y + s * 0.2, x + e * s * 0.08, gy, s * 0.035, s * 0.025, css([200, 120, 60]));
        const puff = 1 + strut * 0.06;
        draw.ell(g, x, y, s * 0.3 * puff, s * 0.26 * puff, 0, draw.lit(g, x, y, s * 0.3, BRONZE, 0.3));
        draw.ell(g, x - s * 0.05, y + s * 0.02, s * 0.2, s * 0.13, 0.3, draw.lit(g, x, y, s * 0.2, RUST, 0.3));
        /* neck and head: a bob, and now and then a peck at the ground */
        const peck = Math.max(0, Math.sin(t * 0.37 + 1) - 0.8) * 5, hx = x + s * (0.28 + peck * 0.05), hy = y - s * (0.32 - peck * 0.35) + Math.sin(t * 3) * s * 0.01;
        draw.limb(g, x + s * 0.18, y - s * 0.08, hx, hy, s * 0.1, s * 0.06, css(HEAD));
        draw.ell(g, hx, hy, s * 0.065, s * 0.06, 0, draw.lit(g, hx, hy, s * 0.065, HEAD, 0.3));
        draw.limb(g, hx + s * 0.05, hy, hx + s * 0.1, hy + s * 0.015, s * 0.035, s * 0.01, css([226, 190, 90]));
        const sw = Math.sin(t * 2.4) * s * 0.03;
        draw.limb(g, hx + s * 0.03, hy + s * 0.04, hx + s * 0.02 + sw, hy + s * 0.13, s * 0.04, s * 0.03, css(WATTLE));
        draw.limb(g, hx + s * 0.05, hy - s * 0.03, hx + s * 0.09 + sw * 0.5, hy + s * 0.06, s * 0.02, s * 0.015, css(WATTLE));
        api.glyph(hx + s * 0.02, hy - s * 0.01, "o", [20, 20, 20], 1);
        fall(api, leaves, t, 0.03, ["*", "~", ",", "'"]);
      }
    };
  };

  /* ── Christmas ── */
  const PINE = [36, 112, 62], BULBS = [[240, 70, 60], [250, 200, 80], [90, 160, 250], [120, 220, 120], [250, 140, 200]];
  K.scenes.tree = api => {
    const r = rng(41), snow = scatter(r, 160, [[240, 244, 250]]);
    const lights = Array.from({ length: 64 }, (_, i) => ({ u: i / 64, c: BULBS[i % BULBS.length], p: r() * TAU, f: 0.8 + r() * 1.5 }));
    const gifts = [[-0.32, [200, 50, 50], [240, 210, 90]], [0.28, [60, 110, 200], [240, 240, 240]], [0.05, [70, 160, 90], [220, 60, 60]]];
    return {
      paint(g, t) {
        const { w, h, P } = api, gy = h * 0.9, H = h * 0.62, x = w * 0.76, top = gy - H;
        /* far hills and small trees */
        g.fillStyle = css(mix(P.water, [220, 230, 240], 0.4), 0.3);
        g.beginPath(); g.moveTo(0, gy); for (let i = 0; i <= 12; i++) g.lineTo(i / 12 * w, gy - h * (0.06 + 0.04 * Math.sin(i * 1.3))); g.lineTo(w, gy); g.fill();
        for (let i = 0; i < 6; i++) {
          const tx = w * (0.05 + i * 0.09), th = h * (0.1 + 0.05 * Math.sin(i * 2.1));
          g.fillStyle = css(mix(PINE, [200, 220, 210], 0.2), 0.5); g.beginPath(); g.moveTo(tx, gy - h * 0.07 - th); g.lineTo(tx - th * 0.35, gy - h * 0.05); g.lineTo(tx + th * 0.35, gy - h * 0.05); g.fill();
        }
        g.fillStyle = draw.vgrad(g, gy, h, [236, 240, 248], [200, 210, 224], 0.45, 0.5); g.fillRect(0, gy, w, h - gy);
        /* the tree: tiers that droop at the hem, swaying a hair in the wind */
        draw.limb(g, x, gy, x, gy - H * 0.12, H * 0.07, H * 0.06, css([100, 66, 40]));
        for (let i = 0; i < 5; i++) {
          const k = i / 4, ty = top + H * (0.08 + k * 0.72), half = H * (0.1 + k * 0.24), tip = top + H * k * 0.55, sway = Math.sin(t * 0.5 + i) * H * 0.004;
          g.fillStyle = draw.lit(g, x, ty - H * 0.1, half, mix(PINE, [10, 60, 30], k * 0.3), 0.3);
          g.beginPath(); g.moveTo(x + sway, tip);
          g.quadraticCurveTo(x + half * 0.5, ty - H * 0.06, x + half + sway, ty + H * 0.03);
          g.quadraticCurveTo(x, ty - H * 0.02, x - half + sway, ty + H * 0.03);
          g.quadraticCurveTo(x - half * 0.5, ty - H * 0.06, x + sway, tip); g.fill();
          /* snow on each hem */
          draw.ell(g, x + half * 0.55, ty + H * 0.005, half * 0.3, H * 0.012, -0.25, css([240, 244, 250], 0.85));
        }
        /* lights on a garland that spirals down, each twinkling at its own pace */
        for (const L of lights) {
          const v = 0.08 + L.u * 0.8, half = H * (0.04 + v * 0.3), a = L.u * TAU * 4.5;
          if (Math.cos(a) < -0.2) continue;
          const lx = x + Math.sin(a) * half * 0.85, ly = top + H * v + Math.cos(a) * H * 0.02;
          const on = 0.5 + 0.5 * Math.sin(t * L.f + L.p);
          api.glyph(lx, ly, on > 0.7 ? "*" : "o", L.c, 0.35 + 0.65 * on);
        }
        /* the star, breathing */
        const sr = H * 0.06 * (1 + Math.sin(t * 2) * 0.06);
        g.fillStyle = css([250, 214, 90]); g.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? sr * 0.45 : sr; g.lineTo(x + Math.cos(a) * rr, top - H * 0.02 + Math.sin(a) * rr); }
        g.fill();
        for (const [ox, gc, rc] of gifts) {
          const bw = H * 0.12, bx = x + ox * H - bw / 2, by = gy - bw * 0.8;
          g.fillStyle = draw.lit(g, bx + bw / 2, by + bw * 0.4, bw, gc, 0.3); g.fillRect(bx, by, bw, bw * 0.8);
          g.fillStyle = css(rc); g.fillRect(bx + bw * 0.44, by, bw * 0.12, bw * 0.8); g.fillRect(bx, by + bw * 0.3, bw, bw * 0.1);
        }
        fall(api, snow, t, 0.025, ["*", "·", ".", "+"]);
      }
    };
  };

  /* ── New Year ── */
  const SPARKS = [[255, 120, 100], [255, 210, 110], [130, 200, 255], [190, 140, 255], [140, 255, 170], [255, 255, 255]];
  K.scenes.newyear = api => {
    const r = rng(53), rockets = [], sparks = [];
    const city = Array.from({ length: 34 }, () => ({ w: 0.02 + r() * 0.04, h: 0.06 + r() * 0.2, seed: (r() * 1e6) | 0 }));
    let next = 0.2, last = 0;
    const burst = (x, y) => {
      const c1 = SPARKS[(r() * SPARKS.length) | 0], c2 = SPARKS[(r() * SPARKS.length) | 0], kind = r(), n = 90 + (r() * 60 | 0), sp = 260 + r() * 200;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + r() * 0.05, v = kind < 0.3 ? sp : sp * (0.3 + r() * 0.7);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: kind > 0.75 ? 3.2 : 1.6 + r() * 0.6, c: i % 3 ? c1 : c2, willow: kind > 0.75 });
      }
    };
    return {
      paint(g, t) {
        const { w, h, P } = api, dt = Math.min(0.05, t - last); last = t;
        if (t > next) { rockets.push({ x: w * (0.1 + r() * 0.8), y: h, vy: -(h * 0.75 + r() * h * 0.35), top: h * (0.12 + r() * 0.3) }); next = t + 0.35 + r() * 0.8; }
        for (let i = rockets.length - 1; i >= 0; i--) {
          const k = rockets[i];
          k.vy += h * 0.3 * dt; k.y += k.vy * dt; k.x += Math.sin(t * 9 + i) * 0.6;
          api.glyph(k.x, k.y, "|", [255, 220, 160], 0.9);
          api.glyph(k.x, k.y + api.ch, ".", [255, 180, 120], 0.5);
          if (k.y <= k.top || k.vy >= 0) { burst(k.x, k.y); rockets.splice(i, 1); }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.life += dt;
          if (s.life > s.max) { sparks.splice(i, 1); continue; }
          const drag = s.willow ? 1.1 : 1.4;
          s.vx *= 1 - drag * dt; s.vy = s.vy * (1 - drag * dt) + (s.willow ? 40 : 70) * dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          const k = s.life / s.max, a = (1 - k) * (0.6 + 0.4 * Math.sin(s.life * 30 + i));
          api.glyph(s.x, s.y, k < 0.25 ? "*" : k < 0.55 ? "+" : k < 0.8 ? "." : "·", s.willow ? mix(s.c, [255, 200, 110], k) : s.c, a);
          if (k < 0.6) api.glyph(s.x - s.vx * 0.05, s.y - s.vy * 0.05, "·", s.c, a * 0.5);
        }
        /* the skyline, its windows lit and going out one by one */
        const gy = h * 0.96;
        let x = 0;
        for (const b of city) {
          const bw = b.w * w, bh = b.h * h, wr = rng(b.seed);
          g.fillStyle = css(mix(P.water, [90, 100, 130], 0.5), 0.45); g.fillRect(x, gy - bh, bw - 4, bh + h * 0.04);
          for (let wy = gy - bh + 12; wy < gy - 6; wy += api.ch * 1.5) for (let wx = x + 6; wx < x + bw - 8; wx += api.cw * 1.5) {
            const seed = wr();
            if (seed < 0.45 && Math.sin(t * 0.05 + seed * 80) > -0.6) api.glyph(wx, wy, ".", [250, 210, 120], 0.45 + seed);
          }
          x += bw;
          if (x > w) break;
        }
        g.fillStyle = css(mix(P.water, [90, 100, 130], 0.5), 0.45); g.fillRect(0, gy, w, h - gy);
      }
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
