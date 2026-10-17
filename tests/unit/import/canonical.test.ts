import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Bytes, sha256Hex } from '@/lib/canonical';

// Ported from Adjuster tests/rules/canonical.test.ts (f8c92c5); task 1.3 acceptance: sorts keys, rejects floats.

function shuffled(v: unknown, seed = { s: 7 }): unknown {
  if (Array.isArray(v)) return v.map((x) => shuffled(x, seed));
  if (v === null || typeof v !== 'object') return v;
  const keys = Object.keys(v);
  for (let i = keys.length - 1; i > 0; i--) {
    seed.s = (seed.s * 1103515245 + 12345) % 2147483648;
    const j = seed.s % (i + 1);
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
  }
  return Object.fromEntries(keys.map((k) => [k, shuffled((v as Record<string, unknown>)[k], seed)]));
}

describe('canonicalJson', () => {
  it('sorts keys at every depth and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}');
  });
  it('shuffled key order gives identical bytes and hash', () => {
    const doc = { id: 'C0001', fields: { first: 'Zoë', last: 'Rivera', zip: '80206' }, gifts: [{ id: 'G1', cents: 250000 }, { id: 'G2', cents: 10000 }] };
    const mixed = shuffled(doc);
    expect(JSON.stringify(mixed)).not.toBe(JSON.stringify(doc));
    expect(canonicalJson(mixed)).toBe(canonicalJson(doc));
    expect(sha256Hex(mixed)).toBe(sha256Hex(doc));
  });
  it('escapes strings the JSON way and normalises -0', () => {
    expect(canonicalJson({ s: 'a"\né', z: -0 })).toBe('{"s":"a\\"\\né","z":0}');
  });
  it.each([
    ['a float', { x: 79.5 }, '$.x'],
    ['NaN', [NaN], '$[0]'],
    ['Infinity', { x: Infinity }, '$.x'],
    ['an unsafe integer', { x: 2 ** 53 }, '$.x'],
    ['undefined', { x: undefined }, '$.x'],
    ['a Date object', { x: new Date(0) }, '$.x'],
    ['a Map', { x: new Map() }, '$.x'],
    ['a bigint', { x: 1n }, '$.x'],
  ])('rejects %s, naming the path', (_, v, path) => expect(() => canonicalJson(v)).toThrow(path));
  it('hash is sha256 hex of the canonical bytes', () => expect(sha256Hex({})).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'));
  it('sha256Bytes hashes raw bytes', () => expect(sha256Bytes(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
});
