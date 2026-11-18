/*
 * The page around the scene: the black water, the clock and the day in character
 * cells with the date under them, and nothing to click.
 *
 *   ?title=One%20Page&tag=is%20all%20you%20need   your own words instead of the clock
 *   ?scene=koi|birds|cat|deer|jellyfish|tiger|elephant|lion|halloween|turkey|tree|newyear
 *                               one scene always; without it the calendar picks (scene.js)
 *   ?fps=30                     frames a second at most (30 by default: kinder to a battery)
 *   keys: space to pause
 */
(() => {
  "use strict";
  const { createPond, createScene, pickScene, scenes, AsciiMark } = window.AsciiKoi;
  const root = document.documentElement;
  const q = new URLSearchParams(location.search);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.dataset.theme = "black";

  const cssVar = n => getComputedStyle(root).getPropertyValue(n).trim();
  const palette = () => ({
    water: cssVar("--pond"), ink: cssVar("--ink"), accent: cssVar("--accent"),
    koiLight: cssVar("--koi-light"), koiDark: cssVar("--koi-dark"),
    dark: cssVar("color-scheme").includes("dark")
  });

  /* the scene: the one asked for, or the one the calendar picks; a wallpaper left open moves on when the day does */
  const asked = q.get("scene");
  const sceneName = () => asked === "koi" || Object.hasOwn(scenes, asked) ? asked : pickScene(new Date());
  const scene = sceneName();
  if (!asked) setInterval(() => { if (sceneName() !== scene) location.reload(); }, 60e3);
  const fps = Math.min(120, Math.max(5, +q.get("fps") || 30));
  const box = document.getElementById("intro-box");
  const opts = {
    canvas: document.getElementById("pond"), palette, reduce, fps,
    /* the title's box in pond pixels: the scene fades under it, so the clock stays readable */
    dim: () => { const r = box.getBoundingClientRect(); return r.width ? r : null; }
  };
  const pond = scene === "koi" ? createPond(opts) : createScene(scene, opts);
  pond.size(innerWidth, innerHeight);
  window.AsciiKoi.pond = pond;

  /* ── the words: the time as the title, the day under it, then the date ── */
  const titleCanvas = document.getElementById("wordmark");
  const tagCanvas = document.getElementById("wordmark-tag");
  const dateLine = document.getElementById("intro-date");
  const own = q.get("title");
  const narrow = () => innerWidth < 720;
  const words = () => {
    const now = new Date();
    const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (own) return { title: own, tag: q.get("tag") || "", date };
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    return { title: time, tag: now.toLocaleDateString("en-GB", { weekday: "long" }), date };
  };
  let current = words();
  const serif = `"Noto Serif Display", "Iowan Old Style", Georgia, serif`;
  /* the words take on the koi colour and the water's light in the pond under them */
  const look = { tint: pond.tint, light: pond.light };
  const title = AsciiMark(titleCanvas, () => ({
    text: current.title, font: `700 ${narrow() ? 120 : own ? 170 : 230}px ${serif}`,
    cw: narrow() ? 4 : 7, ch: narrow() ? 5 : 9, maxW: Math.min(innerWidth * (narrow() ? 0.9 : 0.8), own ? 700 : 820), edge: true, glow: 1
  }), look);
  /* the day, drawn the same way as the clock, smaller and a little fainter */
  const tag = AsciiMark(tagCanvas, () => ({
    text: current.tag || " ", font: `700 ${narrow() ? 64 : 84}px ${serif}`,
    cw: narrow() ? 3 : 4, ch: narrow() ? 4 : 5, maxW: Math.min(innerWidth * (narrow() ? 0.66 : 0.42), 420), tone: 0.88, edge: !narrow(), glow: 0.7
  }), look);
  const clock = () => performance.now() / 1000;
  const buildWords = () => {
    dateLine.textContent = current.date;
    return Promise.all([title.build(clock()), tag.build(clock() + 0.35)]);
  };
  document.getElementById("sr-title").textContent = own ? `${current.title} ${current.tag}` : "ASCII Koi";

  let lastWords = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    /* the words redraw at about 15 fps, like a sign; the scene under them moves at its own rate */
    if (now - lastWords < 66) return;
    lastWords = now;
    const s = now / 1000;
    title.draw(s); tag.draw(s);
    if (!own) {
      const w = words();
      if (w.title !== current.title || w.tag !== current.tag || w.date !== current.date) { current = w; buildWords(); }
    }
  }

  addEventListener("keydown", e => {
    if (e.key === " " && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); pond.pause(); }
  });
  let resizeTimer = 0;
  addEventListener("resize", () => {
    pond.size(innerWidth, innerHeight);
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => buildWords(), 120);
  });

  pond.start();
  buildWords().then(() => { box.classList.add("go"); requestAnimationFrame(frame); });
  /* canvas text cannot trigger a webfont load; redraw once the mono face is in */
  document.fonts?.load(`600 12px "Geist Mono"`).then(() => pond.colors(), () => { /* drawn with the fallback font */ });
})();
