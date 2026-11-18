// The calendar that picks a scene: node scripts/scenes-check.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const ctx = { globalThis: {} };
vm.runInNewContext(readFileSync(new URL("../scene.js", import.meta.url), "utf8"), ctx);
const { pickScene, ANIMALS } = ctx.globalThis.AsciiKoi;
const at = (y, m, d) => pickScene(new Date(y, m - 1, d));
assert.equal(at(2026, 10, 14), ANIMALS[(287 + 2026) % ANIMALS.length]);
assert.equal(at(2026, 10, 15), "halloween");
assert.equal(at(2026, 10, 31), "halloween");
assert.equal(at(2026, 11, 1), "turkey");
assert.equal(at(2026, 11, 26), "turkey");   // Thanksgiving 2026
assert.equal(at(2026, 11, 29), "turkey");   // the Sunday after
assert.equal(at(2026, 11, 30), "tree");
assert.equal(at(2027, 11, 25), "turkey");   // Thanksgiving 2027
assert.equal(at(2027, 11, 28), "turkey");
assert.equal(at(2027, 11, 29), "tree");
assert.equal(at(2026, 12, 25), "tree");
assert.equal(at(2026, 12, 27), "newyear");
assert.equal(at(2027, 1, 1), "newyear");
assert.equal(at(2027, 1, 2), "newyear");
assert.notEqual(at(2027, 1, 3), "newyear");
const seen = new Set();
for (let d = 1; d <= 8; d++) seen.add(at(2027, 3, d));
assert.equal(seen.size, ANIMALS.length, "eight days in a row show eight different animals");
console.log("calendar ok");
