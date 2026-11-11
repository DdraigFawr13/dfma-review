import { describe, expect, test } from "vitest";
import { parseShard, shardOf } from "./parity-shard";

describe("parity shards", () => {
  test("every entry lands on one shard, and the load is balanced by size", () => {
    const sizes = [900, 800, 700, 600, 500, 400, 300, 200, 100, 50];
    const shard = shardOf(sizes, 4);
    expect(shard).toHaveLength(sizes.length);
    const load = [0, 0, 0, 0];
    sizes.forEach((s, i) => { load[shard[i]] += s; });
    expect(Math.max(...load) - Math.min(...load)).toBeLessThanOrEqual(900);
    expect(shardOf(sizes, 4)).toEqual(shard); // deterministic
  });

  test("one shard takes everything", () => {
    expect(shardOf([3, 1, 2], 1)).toEqual([0, 0, 0]);
  });

  test("bad shard specs are refused", () => {
    expect(parseShard("2/4")).toEqual({ k: 2, n: 4 });
    expect(() => parseShard("4/4")).toThrow();
    expect(() => parseShard("x")).toThrow();
    expect(() => shardOf([1], 0)).toThrow();
  });
});
