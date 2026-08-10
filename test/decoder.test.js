import test from "node:test";
import assert from "node:assert/strict";
import { candidateYears, decodeVin, generationFor, normalizeVin, validateVin } from "../src/decoder.js";

test("normalizes spaces, dashes, and case", () => {
  assert.equal(normalizeVin("wp0 zzz-99zms216267"), "WP0ZZZ99ZMS216267");
});

test("decodes the supplied 2021 Porsche 911 test VIN", () => {
  const result = decodeVin("WP0ZZZ99ZMS216267", { currentYear: 2026 });
  assert.equal(result.valid, true);
  assert.equal(result.year, 2021);
  assert.equal(result.model, "911");
  assert.equal(result.generation, "992 generation");
  assert.equal(result.plant, "Stuttgart-Zuffenhausen");
  assert.equal(result.market, "Rest of world");
  assert.equal(result.serial, "216267");
});

test("understands the 30-year model-year cycle", () => {
  assert.deepEqual(candidateYears("M", 2026), [1991, 2021]);
});

test("uses chassis compatibility to keep historic type 964 in 1991", () => {
  const result = decodeVin("WP0ZZZ96ZMS400001", { currentYear: 2026 });
  assert.equal(result.year, 1991);
  assert.equal(result.generation, "964 generation");
});

test("rejects invalid lengths", () => {
  const result = validateVin("WP0ZZZ99ZM");
  assert.equal(result.valid, false);
  assert.match(result.error, /17 characters/);
});

test("rejects forbidden VIN letters", () => {
  const result = validateVin("WP0ZZZ99ZMS21626I");
  assert.equal(result.valid, false);
  assert.match(result.error, /cannot contain I, O, Q/);
});

test("rejects non-Porsche VINs", () => {
  const result = validateVin("WVWZZZ1JZXW000001");
  assert.equal(result.valid, false);
  assert.match(result.error, /Porsche manufacturer code/);
});

test("maps major 911 generations", () => {
  assert.equal(generationFor("911", 2021), "992 generation");
  assert.equal(generationFor("911", 2016), "991 generation");
  assert.equal(generationFor("911", 1991), "964 generation");
});
