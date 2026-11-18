// The calendar that picks a scene: node scripts/scenes-check.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const ctx = { globalThis: {} };
vm.runInNewContext(readFileSync(new URL("../scene.js", import.meta.url), "utf8"), ctx);
const { pickScene, ANIMALS } = ctx.globalThis.AsciiKoi;
const at = (y, m, d) => pickScene(new Date(y, m - 1, d));
const animal = (y, m, d) => assert.ok(ANIMALS.includes(at(y, m, d)), `${y}-${m}-${d} is an animal day`);
animal(2026, 10, 25);
assert.equal(at(2026, 10, 26), "halloween");  // five days before
assert.equal(at(2026, 10, 31), "halloween");
animal(2026, 11, 1);
animal(2026, 11, 20);
assert.equal(at(2026, 11, 21), "turkey");     // Thanksgiving 2026 is the 26th
assert.equal(at(2026, 11, 26), "turkey");
animal(2026, 11, 27);
assert.equal(at(2027, 11, 20), "turkey");     // Thanksgiving 2027 is the 25th
assert.equal(at(2027, 11, 25), "turkey");
animal(2026, 12, 19);
assert.equal(at(2026, 12, 20), "tree");
assert.equal(at(2026, 12, 25), "tree");
animal(2026, 12, 26);
assert.equal(at(2026, 12, 27), "newyear");
assert.equal(at(2026, 12, 31), "newyear");
assert.equal(at(2027, 1, 1), "newyear");
animal(2027, 1, 2);
const seen = new Set();
for (let d = 1; d <= 8; d++) seen.add(at(2027, 3, d));
assert.equal(seen.size, ANIMALS.length, "eight days in a row show eight different animals");
console.log("calendar ok");
