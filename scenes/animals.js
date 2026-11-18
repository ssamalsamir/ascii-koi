/*
 * The animals: big cats and an elephant walking the savanna, a deer in the
 * woods, a cat on a wall at night, a murmuration of birds and a bloom of
 * jellyfish. Each is painted with canvas shapes in viewport pixels and turned
 * into character cells by scene.js.
 *
 * The four-legged ones share one rig: feet plant on the ground and are carried
 * back in stance, then lift and swing forward, and each leg's joint is found
 * from its hip and foot (two-bone IK), so the stride stays on the ground at any
 * speed. Hind legs bend at the hock, front legs at the knee.
 */
(function (global) {
  "use strict";
  const K = global.AsciiKoi;
  const { clamp, lerp, sstep, mix, css, rng, noise1, draw } = K.sceneKit;
  const TAU = Math.PI * 2;

  /* ── the walking rig ── */
  function legIK(hx, hy, fx, fy, l1, l2, back) {
    const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
    const a = Math.atan2(dy, dx), A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const k = back ? a + A : a - A;
    return [hx + Math.cos(k) * l1, hy + Math.sin(k) * l1];
  }
  /* where a foot is at gait phase p: stance carries it back along the ground, swing lifts it forward */
  function foot(p, stride, lift) {
    p = ((p % 1) + 1) % 1;
    if (p < 0.6) return [stride * (0.5 - p / 0.6), 0];
    const u = (p - 0.6) / 0.4;
    return [stride * (-0.5 + sstep(0, 1, u)), -lift * Math.sin(Math.PI * u)];
  }
  /* near hind, near front, far hind, far front: a lateral walk */
  const LEGS = [{ hind: true, far: false, off: 0 }, { hind: false, far: false, off: 0.25 }, { hind: true, far: true, off: 0.5 }, { hind: false, far: true, off: 0.75 }];

  /*
   * One walker on the ground: walks for a while, stands for a while (grazing, looking),
   * and wraps round the screen. Returns the pose for the rig.
   */
  function walker(r, o) {
    const m = { x: o.x, dir: o.dir || 1, phase: r(), walk: 1, want: 1, until: o.walkFor ? o.walkFor[0] : 9, graze: 0 };
    m.step = (dt, t, w, L) => {
      if (t > m.until) {
        m.want = m.want ? 0 : 1;
        const span = m.want ? o.walkFor || [8, 14] : o.standFor || [3, 6];
        m.until = t + lerp(span[0], span[1], r());
      }
      m.walk += (m.want - m.walk) * Math.min(1, dt * 1.6);
      m.graze += ((m.want ? 0 : o.grazes ? 1 : 0) - m.graze) * Math.min(1, dt * 0.9);
      const v = o.speed * L * m.walk;
      m.x += v * m.dir * dt;
      m.phase += dt * v * 0.6 / (o.stride * L);
      const edge = L * 1.4;
      if (m.x > w + edge) m.x = -edge;
      if (m.x < -edge) m.x = w + edge;
    };
    return m;
  }

  /*
   * A four-legged animal facing right in local space, ground at y = 0, body length L.
   * spec: { leg, bodyH, bodyY, shoulder, hip, legW, footW, col, far, stride, lift,
   *         neck(g, ctx), tail(g, ctx), coat(g, ctx), bob }
   */
  function beast(spec) {
    return (g, x, y, L, dir, pose, t) => {
      g.save(); g.translate(x, y); g.scale(dir * L, L);
      const legH = spec.leg, bob = Math.abs(Math.sin(pose.phase * TAU * 2)) * (spec.bob || 0.012) * pose.walk;
      const by = -legH - spec.bodyH * spec.bodyY + bob, ctx = { by, t, pose, bob };
      const drawLeg = l => {
        const ax = l.hind ? spec.hip : spec.shoulder, ay = by + spec.bodyH * 0.35;
        const f = foot(pose.phase + l.off, spec.stride, spec.lift);
        const fx = ax + (l.hind ? -0.02 : 0.02) + f[0] * pose.walk, fy = f[1] * pose.walk;
        const l1 = (0 - ay) * 0.51, l2 = (0 - ay) * 0.51;
        const [kx, ky] = legIK(ax, ay, fx, fy, l1, l2, l.hind);
        const c = l.far ? spec.far : spec.col;
        draw.limb(g, ax, ay, kx, ky, spec.legW * (l.hind ? 1.35 : 1.1), spec.legW * 0.85, css(c));
        draw.limb(g, kx, ky, fx + 0.01, fy - spec.footW * 0.4, spec.legW * 0.85, spec.footW, css(c));
      };
      for (const l of LEGS) if (l.far) drawLeg(l);
      if (spec.tail) spec.tail(g, ctx);
      draw.ell(g, 0, by, 0.5, spec.bodyH, 0, draw.lit(g, 0, by, 0.5, spec.col, 0.3));
      if (spec.coat) spec.coat(g, ctx);
      for (const l of LEGS) if (!l.far) drawLeg(l);
      spec.neck(g, ctx);
      g.restore();
    };
  }

  /* a tail as a hanging, swaying chain from the rump */
  function tailPts(x, y, len, droop, sway, t, n = 7) {
    const pts = [[x, y]];
    for (let i = 1; i < n; i++) {
      const k = i / (n - 1), a = Math.PI + 0.4 - droop * k + Math.sin(t * 1.7 - k * 2.2) * sway * k, p = pts[i - 1];
      pts.push([p[0] + Math.cos(a) * len / (n - 1), p[1] + Math.sin(a) * len / (n - 1)]);
    }
    return pts;
  }

  /* the ground the walkers stand on: a soft band of earth with tufts of grass */
  function ground(g, api, gy, earth, grass, t, seed) {
    const w = api.w, h = api.h;
    g.fillStyle = draw.vgrad(g, gy - h * 0.02, h, earth, mix(earth, [0, 0, 0], 0.4), 0.3, 0.45);
    g.fillRect(0, gy, w, h - gy);
    const r = rng(seed);
    for (let i = 0; i < w / 14; i++) {
      const x = r() * w, y = gy + r() * (h - gy) * 0.8, hgt = (8 + r() * 18) * (0.6 + (y - gy) / (h - gy));
      const sway = Math.sin(t * 1.3 + x * 0.01) * 3;
      draw.limb(g, x, y, x + sway + (r() - 0.5) * 6, y - hgt, 3, 1, css(grass, 0.5));
    }
  }

  /* an acacia on the horizon: a trunk and a flat crown */
  function acacia(g, x, gy, s, c) {
    draw.limb(g, x, gy, x - s * 0.08, gy - s * 0.55, s * 0.06, s * 0.03, css(c));
    draw.limb(g, x - s * 0.06, gy - s * 0.4, x + s * 0.25, gy - s * 0.62, s * 0.03, s * 0.02, css(c));
    draw.ell(g, x, gy - s * 0.66, s * 0.55, s * 0.09, 0, css(c));
    draw.ell(g, x + s * 0.2, gy - s * 0.7, s * 0.3, s * 0.07, 0, css(c));
  }

  /* the savanna under the big animals */
  function savanna(api, seed) {
    return (g, t) => {
      const { w, h } = api, gy = h * 0.86, far = mix(api.P.water, [150, 120, 70], 0.4);
      g.globalAlpha = 0.5;
      acacia(g, w * 0.1, gy, h * 0.3, far);
      acacia(g, w * 0.9, gy, h * 0.22, far);
      g.globalAlpha = 1;
      /* a low sun over the horizon */
      draw.ell(g, w * 0.82, h * 0.2, h * 0.07, h * 0.07, 0, draw.lit(g, w * 0.82, h * 0.2, h * 0.07, [240, 170, 90], 0.25));
      ground(g, api, gy, [140, 105, 60], [170, 150, 80], t, seed);
      return gy;
    };
  }

  /* ── tiger ── */
  const TIGER = [222, 118, 38], CREAM = [242, 228, 204], STRIPE = [28, 20, 16];
  const tigerRig = beast({
    leg: 0.36, bodyH: 0.18, bodyY: 0.5, shoulder: 0.3, hip: -0.3, legW: 0.1, footW: 0.085, stride: 0.32, lift: 0.07,
    col: TIGER, far: mix(TIGER, [0, 0, 0], 0.35),
    tail(g, { by, t }) {
      const pts = tailPts(-0.46, by - 0.06, 0.55, 2.1, 0.5, t);
      pts.forEach((p, i) => i && draw.limb(g, pts[i - 1][0], pts[i - 1][1], p[0], p[1], 0.05, 0.045, css(i % 2 ? TIGER : STRIPE)));
    },
    coat(g, { by }) {
      g.save(); g.beginPath(); g.ellipse(0, by, 0.5, 0.18, 0, 0, TAU); g.clip();
      draw.ell(g, 0.05, by + 0.16, 0.45, 0.07, 0, css(CREAM));
      for (let i = 0; i < 11; i++) { const x = -0.42 + i * 0.08; draw.limb(g, x, by - 0.19, x + 0.05, by + 0.07, 0.035, 0.012, css(STRIPE)); }
      g.restore();
    },
    neck(g, { by, t }) {
      const hx = 0.62, hy = by - 0.08 + Math.sin(t * 0.8) * 0.01;
      draw.limb(g, 0.34, by - 0.03, hx - 0.06, hy, 0.2, 0.15, css(TIGER));
      draw.ell(g, hx - 0.08, hy - 0.1, 0.035, 0.035, 0, css(TIGER));
      draw.ell(g, hx, hy, 0.13, 0.12, 0, draw.lit(g, hx, hy, 0.13, TIGER, 0.3));
      draw.ell(g, hx + 0.08, hy + 0.035, 0.06, 0.045, 0, css(CREAM));
      for (const k of [-1, 0, 1]) draw.limb(g, hx - 0.03 + k * 0.025, hy - 0.09, hx - 0.01 + k * 0.025, hy - 0.04, 0.015, 0.008, css(STRIPE));
      draw.ell(g, hx + 0.13, hy + 0.015, 0.018, 0.014, 0, css(STRIPE));
      draw.ell(g, hx + 0.04, hy - 0.025, 0.012, 0.01, 0, css([60, 140, 60]));
    }
  });
  K.scenes.tiger = api => {
    const r = rng(7), land = savanna(api, 7), m = walker(r, { x: 0, speed: 0.5, stride: 0.34, walkFor: [10, 16], standFor: [3, 5] });
    let last = 0;
    return {
      paint(g, t) {
        const gy = land(g, t), L = Math.min(api.w * 0.3, api.h * 0.6);
        m.step(t - last, t, api.w, L); last = t;
        tigerRig(g, m.x, gy + api.h * 0.04, L, m.dir, m, t);
      }
    };
  };

  /* ── lion ── */
  const LION = [204, 152, 84], MANE = [124, 72, 32];
  const lionRig = beast({
    leg: 0.46, bodyH: 0.15, bodyY: 0.5, shoulder: 0.3, hip: -0.3, legW: 0.09, footW: 0.075, stride: 0.34, lift: 0.07,
    col: LION, far: mix(LION, [0, 0, 0], 0.35),
    tail(g, { by, t }) {
      const pts = tailPts(-0.46, by - 0.05, 0.5, 2.0, 0.6, t);
      draw.chain(g, pts, 0.04, 0.03, css(LION));
      const e = pts[pts.length - 1];
      draw.ell(g, e[0], e[1], 0.04, 0.05, 0, css(MANE));
    },
    neck(g, { by, t }) {
      const hx = 0.6, hy = by - 0.14 + Math.sin(t * 0.7) * 0.012;
      /* the mane: a ragged ring that ruffles in the wind */
      const pts = [];
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, rr = 0.2 + 0.05 * noise1(i * 1.7 + t * 0.8, 3); pts.push([hx - 0.04 + Math.cos(a) * rr * 0.9, hy + 0.02 + Math.sin(a) * rr]); }
      draw.limb(g, 0.3, by, hx - 0.06, hy + 0.04, 0.28, 0.22, css(MANE));
      draw.blob(g, pts, draw.lit(g, hx - 0.04, hy, 0.22, MANE, 0.3));
      draw.ell(g, hx + 0.03, hy, 0.1, 0.11, 0, draw.lit(g, hx, hy, 0.11, LION, 0.3));
      draw.ell(g, hx + 0.1, hy + 0.04, 0.06, 0.05, 0, css(mix(LION, [255, 240, 220], 0.4)));
      draw.ell(g, hx + 0.15, hy + 0.02, 0.02, 0.015, 0, css([50, 30, 20]));
      draw.ell(g, hx + 0.06, hy - 0.03, 0.012, 0.01, 0, css([40, 30, 20]));
    }
  });
  K.scenes.lion = api => {
    const r = rng(11), land = savanna(api, 11), m = walker(r, { x: api.w * 0.2, speed: 0.4, stride: 0.34, walkFor: [8, 12], standFor: [4, 7] });
    let last = 0;
    return {
      paint(g, t) {
        const gy = land(g, t), L = Math.min(api.w * 0.28, api.h * 0.52);
        m.step(t - last, t, api.w, L); last = t;
        lionRig(g, m.x, gy + api.h * 0.04, L, m.dir, m, t);
      }
    };
  };

  /* ── elephant, with a calf at her side ── */
  const GREY = [132, 130, 134], IVORY = [236, 228, 210];
  const elephantRig = beast({
    leg: 0.5, bodyH: 0.3, bodyY: 0.45, shoulder: 0.26, hip: -0.26, legW: 0.17, footW: 0.17, stride: 0.26, lift: 0.05, bob: 0.008,
    col: GREY, far: mix(GREY, [0, 0, 0], 0.32),
    tail(g, { by, t }) { draw.chain(g, tailPts(-0.48, by - 0.08, 0.3, 1.9, 0.4, t, 5), 0.025, 0.015, css(GREY)); },
    neck(g, { by, t, pose }) {
      const hx = 0.5, hy = by - 0.16;
      draw.ell(g, hx, hy, 0.22, 0.22, 0, draw.lit(g, hx, hy, 0.22, GREY, 0.25));
      /* the trunk: hangs and curls, swaying with the walk */
      const pts = [];
      for (let i = 0; i < 9; i++) {
        const k = i / 8, a = 1.35 + k * (0.35 + 0.35 * Math.sin(t * 0.9 + k * 2)) + pose.graze * k * 0.4;
        const prev = pts[i - 1] || [hx + 0.17, hy + 0.05];
        pts.push(i ? [prev[0] + Math.cos(a) * 0.07, prev[1] + Math.sin(a) * 0.07] : prev);
      }
      draw.chain(g, pts, 0.13, 0.06, css(GREY));
      draw.limb(g, hx + 0.15, hy + 0.09, hx + 0.27, hy + 0.17, 0.035, 0.02, css(IVORY));
      draw.ell(g, hx + 0.1, hy - 0.05, 0.016, 0.014, 0, css([30, 30, 30]));
      /* the ear flaps slowly, a fan in the heat */
      const flap = 0.1 + 0.15 * Math.sin(t * 1.4);
      draw.ell(g, hx - 0.1, hy + 0.04, 0.15, 0.2, flap, draw.lit(g, hx - 0.1, hy, 0.2, mix(GREY, [70, 60, 66], 0.45), 0.25));
    }
  });
  K.scenes.elephant = api => {
    const r = rng(5), land = savanna(api, 5);
    const mom = walker(r, { x: api.w * 0.25, speed: 0.22, stride: 0.26, walkFor: [12, 18], standFor: [4, 6], grazes: true });
    let last = 0;
    return {
      paint(g, t) {
        const gy = land(g, t), L = Math.min(api.w * 0.22, api.h * 0.36), dt = t - last; last = t;
        mom.step(dt, t, api.w, L);
        const calf = { phase: mom.phase * 1.4 + 0.3, walk: mom.walk, graze: mom.graze };
        elephantRig(g, mom.x - L * 0.75, gy + api.h * 0.07, L * 0.5, mom.dir, calf, t + 1);
        elephantRig(g, mom.x, gy + api.h * 0.035, L, mom.dir, mom, t);
      }
    };
  };

  /* ── deer in the woods ── */
  const DEER = [158, 104, 62], DEER_PALE = [236, 222, 200], ANTLER = [214, 196, 160];
  const deerRig = beast({
    leg: 0.62, bodyH: 0.14, bodyY: 0.5, shoulder: 0.3, hip: -0.28, legW: 0.05, footW: 0.04, stride: 0.38, lift: 0.1,
    col: DEER, far: mix(DEER, [0, 0, 0], 0.35),
    tail(g, { by, t }) { draw.ell(g, -0.48, by - 0.08, 0.04, 0.06, -0.4 + Math.sin(t * 5) * 0.15, css(DEER_PALE)); },
    coat(g, { by }) { draw.ell(g, 0, by + 0.09, 0.38, 0.05, 0, css(mix(DEER, DEER_PALE, 0.5))); },
    neck(g, { by, t, pose }) {
      /* head up, or down to the grass while it grazes */
      const gz = pose.graze, nx = lerp(0.58, 0.66, gz), ny = lerp(by - 0.3, -0.06, gz);
      draw.limb(g, 0.32, by - 0.02, nx - 0.04, ny + 0.05, 0.17, 0.08, css(DEER));
      const a = lerp(0.2, 1.3, gz);
      g.save(); g.translate(nx, ny); g.rotate(a);
      draw.ell(g, 0.04, 0, 0.1, 0.055, 0, draw.lit(g, 0.04, 0, 0.1, DEER, 0.3));
      draw.ell(g, 0.12, 0.01, 0.025, 0.02, 0, css([40, 28, 20]));
      draw.ell(g, 0.03, -0.015, 0.012, 0.012, 0, css([20, 15, 10]));
      /* ears flick now and then */
      const flick = Math.max(0, Math.sin(t * 0.9) - 0.9) * 6;
      draw.ell(g, -0.04, -0.06, 0.05, 0.02, -0.6 - flick, css(DEER));
      /* antlers: two branching tines */
      for (const side of [0, 0.03]) {
        const bx = -0.01 + side, b = [[bx, -0.05], [bx - 0.03, -0.18], [bx - 0.01, -0.3], [bx + 0.04, -0.4]];
        draw.chain(g, b, 0.022, 0.012, css(ANTLER));
        draw.limb(g, b[1][0], b[1][1], b[1][0] + 0.07, b[1][1] - 0.06, 0.015, 0.008, css(ANTLER));
        draw.limb(g, b[2][0], b[2][1], b[2][0] + 0.07, b[2][1] - 0.04, 0.014, 0.008, css(ANTLER));
      }
      g.restore();
    }
  });
  K.scenes.deer = api => {
    const r = rng(3), m = walker(r, { x: api.w * 0.3, speed: 0.3, stride: 0.38, walkFor: [5, 8], standFor: [6, 10], grazes: true });
    const trees = Array.from({ length: 14 }, () => ({ x: r(), depth: r(), w: 0.6 + r() * 0.8 }));
    const leaves = Array.from({ length: 50 }, () => ({ x: r(), y: r(), s: 0.4 + r() * 0.6, c: [[214, 120, 40], [200, 160, 60], [170, 70, 40]][(r() * 3) | 0], p: r() * TAU }));
    let last = 0;
    return {
      paint(g, t) {
        const { w, h, P } = api, gy = h * 0.86, dt = t - last; last = t;
        for (const tr of trees.slice().sort((a, b) => a.depth - b.depth)) {
          const c = mix(P.water, [90, 70, 55], 0.2 + tr.depth * 0.5), tw = (14 + tr.depth * 26) * tr.w;
          draw.limb(g, tr.x * w, gy + 10, tr.x * w + 4, -20, tw, tw * 0.7, css(c, 0.25 + tr.depth * 0.25));
        }
        ground(g, api, gy, [80, 90, 50], [120, 140, 70], t, 3);
        const L = Math.min(api.w * 0.22, api.h * 0.36);
        m.step(dt, t, w, L);
        deerRig(g, m.x, gy + h * 0.04, L, m.dir, m, t);
        for (const f of leaves) {
          const y = ((f.y + t * 0.03 * f.s) % 1) * h, x = (f.x * w + Math.sin(t * 0.8 + f.p) * 30 + w) % w;
          api.glyph(x, y, Math.sin(t * 2 + f.p) > 0 ? "*" : "~", f.c, 0.5 + 0.4 * f.s);
        }
      }
    };
  };

  /* ── a cat on a wall at night, watching the fireflies ── */
  const GINGER = [214, 138, 66], GINGER_DARK = [150, 84, 36];
  K.scenes.cat = api => {
    const r = rng(9), flies = Array.from({ length: 16 }, () => ({ x: r(), y: 0.3 + r() * 0.5, p: r() * TAU, s: 0.5 + r() }));
    return {
      paint(g, t) {
        const { w, h, P } = api, s = Math.min(w * 0.22, h * 0.42), cx = w * 0.72, wy = h * 0.8;
        /* the moon, the wall */
        draw.ell(g, w * 0.86, h * 0.18, h * 0.08, h * 0.08, 0, draw.lit(g, w * 0.86, h * 0.18, h * 0.08, [236, 230, 206], 0.2));
        const wall = mix(P.water, [120, 110, 100], 0.35);
        g.fillStyle = css(wall, 0.5); g.fillRect(0, wy, w, h - wy);
        for (let y = wy + 4, row = 0; y < h; y += 26, row++) for (let x = (row % 2) * 30; x < w; x += 60) g.clearRect(x, y, 2, 24);
        /* breath, a slow blink, the tail hanging over the edge */
        const br = 1 + Math.sin(t * 1.6) * 0.015;
        const tail = [];
        for (let i = 0; i < 9; i++) { const k = i / 8; tail.push([cx - s * 0.18 + Math.sin(t * 1.1 - k * 2.5) * s * 0.1 * k, wy + k * s * 0.55]); }
        draw.chain(g, tail, s * 0.07, s * 0.05, css(GINGER));
        draw.ell(g, cx, wy - s * 0.3 * br, s * 0.24, s * 0.32 * br, 0, draw.lit(g, cx, wy - s * 0.3, s * 0.3, GINGER, 0.3));
        draw.ell(g, cx + s * 0.08, wy - s * 0.25, s * 0.12, s * 0.22, 0, css(mix(GINGER, [250, 236, 214], 0.55)));
        for (let i = 0; i < 4; i++) draw.limb(g, cx - s * 0.2, wy - s * (0.1 + i * 0.12), cx - s * 0.05, wy - s * (0.12 + i * 0.12), s * 0.03, s * 0.015, css(GINGER_DARK));
        draw.ell(g, cx + s * 0.1, wy - s * 0.03, s * 0.08, s * 0.04, 0, css(GINGER));
        /* the head drifts a little, following the fireflies */
        const hx = cx + s * (0.03 + Math.sin(t * 0.3) * 0.02), hy = wy - s * 0.72;
        for (const e of [-1, 1]) {
          g.fillStyle = css(GINGER); g.beginPath();
          g.moveTo(hx + e * s * 0.16, hy - s * 0.02); g.lineTo(hx + e * s * 0.13, hy - s * 0.22); g.lineTo(hx + e * s * 0.02, hy - s * 0.1); g.fill();
        }
        draw.ell(g, hx, hy, s * 0.17, s * 0.14, 0, draw.lit(g, hx, hy, s * 0.17, GINGER, 0.3));
        draw.ell(g, hx, hy + s * 0.06, s * 0.08, s * 0.05, 0, css(mix(GINGER, [250, 236, 214], 0.6)));
        const blink = (t % 6) < 0.25;
        for (const e of [-1, 1]) api.glyph(hx + e * s * 0.07, hy - s * 0.01, blink ? "-" : "o", [180, 220, 90], 1);
        for (const f of flies) {
          const x = (f.x + 0.05 * Math.sin(t * 0.3 * f.s + f.p)) * w, y = (f.y + 0.04 * Math.sin(t * 0.5 * f.s + f.p * 2)) * h;
          api.glyph(x, y, "·", [230, 240, 120], clamp(Math.sin(t * f.s * 1.5 + f.p), 0, 1));
        }
      }
    };
  };

  /* ── birds: a murmuration that folds over itself, a few on the wire ── */
  K.scenes.birds = api => {
    const r = rng(13), N = 110;
    const flock = Array.from({ length: N }, () => ({ x: api.w * (0.3 + r() * 0.4), y: api.h * (0.2 + r() * 0.3), vx: (r() - 0.5) * 60, vy: (r() - 0.5) * 60, p: r() * TAU }));
    const wire = Array.from({ length: 9 }, () => ({ x: r(), hop: r() * 20 }));
    let last = 0;
    return {
      paint(g, t) {
        const { w, h, P } = api, dt = Math.min(0.05, t - last); last = t;
        /* the flock chases a slowly wandering point; neighbours keep apart and match speed */
        const gx = w * (0.5 + 0.32 * Math.sin(t * 0.13) + 0.1 * Math.sin(t * 0.31)), gyy = h * (0.32 + 0.14 * Math.sin(t * 0.21));
        for (const b of flock) {
          let sx = 0, sy = 0, ax = 0, ay = 0, n = 0;
          for (const o of flock) {
            if (o === b) continue;
            const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
            if (d2 < 6400) { ax += o.vx; ay += o.vy; n++; if (d2 < 1600) { sx -= dx / (d2 + 50) * 900; sy -= dy / (d2 + 50) * 900; } }
          }
          if (n) { b.vx += (ax / n - b.vx) * dt * 1.5; b.vy += (ay / n - b.vy) * dt * 1.5; }
          b.vx += (sx * 4 + (gx - b.x) * 0.25) * dt; b.vy += (sy * 4 + (gyy - b.y) * 0.25) * dt;
          const v = Math.hypot(b.vx, b.vy), max = 220;
          if (v > max) { b.vx *= max / v; b.vy *= max / v; }
          b.x += b.vx * dt; b.y += b.vy * dt;
          const flap = Math.sin(t * 14 + b.p);
          api.glyph(b.x, b.y, flap > 0.3 ? "v" : flap < -0.3 ? "^" : "-", P.ink, 0.85);
        }
        /* the wire and the birds that stayed */
        const wy = h * 0.82, sag = h * 0.04;
        const wireY = x => wy + sag * Math.sin(Math.PI * x / w);
        g.strokeStyle = css(mix(P.ink, P.water, 0.4)); g.lineWidth = 3; g.beginPath(); g.moveTo(0, wy);
        for (let x = 0; x <= w; x += 40) g.lineTo(x, wireY(x));
        g.stroke();
        draw.limb(g, w * 0.04, wy - 30, w * 0.04, h, 22, 22, css(mix(P.water, [110, 90, 70], 0.5)));
        for (const b of wire) {
          const x = b.x * w, hop = Math.max(0, Math.sin(t * 0.7 + b.hop) - 0.95) * 200, y = wireY(x) - 14 - hop;
          draw.ell(g, x, y, 12, 9, 0, css([70, 66, 74]));
          draw.ell(g, x + 9, y - 8, 6, 6, 0, css([70, 66, 74]));
          draw.limb(g, x - 8, y + 2, x - 20, y + 8, 6, 3, css([60, 56, 64]));
        }
      }
    };
  };

  /* ── jellyfish: bells that pulse and rise, then drift back down ── */
  K.scenes.jellyfish = api => {
    const r = rng(17), HUES = [[236, 130, 190], [150, 130, 240], [110, 210, 230], [250, 170, 120]];
    const jellies = Array.from({ length: 6 }, (_, i) => ({ x: r(), y: r(), s: 0.5 + r() * 0.7, c: HUES[i % 4], p: r() * TAU, rate: 0.35 + r() * 0.2, vx: 0, vy: 0 }));
    const snow = Array.from({ length: 120 }, () => ({ x: r(), y: r(), s: r() }));
    let last = 0;
    return {
      paint(g, t) {
        const { w, h, P } = api, dt = Math.min(0.05, t - last); last = t;
        for (const m of snow) api.glyph(m.x * w + Math.sin(t * 0.2 + m.s * 9) * 10, ((m.y + t * 0.006 * (0.3 + m.s)) % 1) * h, "·", P.ink, 0.15 + m.s * 0.2);
        for (const j of jellies.slice().sort((a, b) => a.s - b.s)) {
          const R = Math.min(w, h) * 0.12 * j.s, ph = (t * j.rate + j.p / TAU) % 1;
          /* a quick squeeze, then a slow relax; the squeeze pushes the bell up */
          const squeeze = ph < 0.3 ? Math.sin(Math.PI * ph / 0.3) : 0;
          j.vy += (-squeeze * 42 * j.s + 7) * dt; j.vy *= 1 - dt * 0.9; j.vx *= 1 - dt * 0.6;
          j.y += j.vy * dt / h; j.x += (j.vx * dt + Math.sin(t * 0.1 + j.p) * 4 * dt) / w;
          if (j.y < -0.25) j.y = 1.2; if (j.y > 1.25) j.y = -0.2;
          j.x = ((j.x % 1) + 1) % 1;
          const x = j.x * w, y = j.y * h, rx = R * (1 - 0.18 * squeeze), ry = R * (1.05 + 0.15 * squeeze);
          /* tentacles first, trailing in a slow wave */
          for (let k = 0; k < 7; k++) {
            const pts = [], ox = (k / 6 - 0.5) * rx * 1.6;
            for (let i = 0; i < 9; i++) { const u = i / 8; pts.push([x + ox * (1 - u * 0.3) + Math.sin(t * 1.4 + k + u * 4) * R * 0.25 * u, y + u * R * 3.6 + R * 0.05]); }
            draw.chain(g, pts, R * 0.08, R * 0.03, css(j.c, 0.6));
          }
          for (let k = 0; k < 3; k++) {
            const pts = [], ox = (k - 1) * rx * 0.25;
            for (let i = 0; i < 7; i++) { const u = i / 6; pts.push([x + ox + Math.sin(t * 1.1 + k * 2 + u * 3) * R * 0.2 * u, y + u * R * 1.6]); }
            draw.chain(g, pts, R * 0.18, R * 0.06, css(mix(j.c, [255, 255, 255], 0.3), 0.8));
          }
          g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, 0, Math.PI, TAU); g.quadraticCurveTo(x, y + ry * 0.35, x - rx, y); g.closePath();
          const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.6, 0, x, y, R * 1.1);
          gr.addColorStop(0, css(mix(j.c, [255, 255, 255], 0.6), 0.95)); gr.addColorStop(0.6, css(j.c, 0.8)); gr.addColorStop(1, css(j.c, 0.35));
          g.fillStyle = gr; g.fill(); g.restore();
        }
      }
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
