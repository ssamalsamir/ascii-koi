/*
 * The page around the scene: the black water, nothing on top, nothing to click.
 *
 *   ?scene=koi|birds|cat|deer|jellyfish|tiger|elephant|lion|halloween|turkey|tree|newyear
 *                               one scene always; without it the calendar picks (scene.js)
 *   ?fps=30                     frames a second at most (30 by default: kinder to a battery)
 *   keys: space to pause
 */
(() => {
  "use strict";
  const { createPond, createScene, pickScene, scenes } = window.AsciiKoi;
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
  const opts = { canvas: document.getElementById("pond"), palette, reduce, fps };
  const pond = scene === "koi" ? createPond(opts) : createScene(scene, opts);
  pond.size(innerWidth, innerHeight);
  window.AsciiKoi.pond = pond;

  addEventListener("keydown", e => {
    if (e.key === " " && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); pond.pause(); }
  });
  addEventListener("resize", () => pond.size(innerWidth, innerHeight));

  pond.start();
  /* canvas text cannot trigger a webfont load; redraw once the mono face is in */
  document.fonts?.load(`600 12px "Geist Mono"`).then(() => pond.colors(), () => { /* drawn with the fallback font */ });
})();
