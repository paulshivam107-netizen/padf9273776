// Shared by the page (encode) and the local decoder. Obfuscation only stops casual peeking; it is not encryption.
// Round 1: a tier per shoe (0 love, 1 maybe, 2 nope). Round 2: round-robin among finalists.
const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
export const TIERS = ['Love it', 'Maybe', 'Not for me'];

// Canonical matchups over a sorted id list: [a, b] with a < b.
export function pairs(ids) {
  const s = [...ids].sort((x, y) => x - y), out = [];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) out.push([s[i], s[j]]);
  return out;
}

// tiers[id-1]. Loves go through; if fewer than 3, add all maybes, then all nopes.
export function finalists(tiers) {
  let f = [];
  for (let t = 0; t < 3 && f.length < 3; t++) tiers.forEach((x, k) => { if (x === t) f.push(k + 1); });
  return f.sort((a, b) => a - b);
}

const mask = (bits) => { // pseudo-random bit mask; bit k depends only on k
  let x = 0x2545f491n, m = 0n;
  for (let k = 0; k < bits; k++) { x = (x * 1103515245n + 12345n) & 0x7fffffffn; m |= ((x >> 16n) & 1n) << BigInt(k); }
  return m;
};
const check = (v) => { let h = 7n; for (const c of v.toString(2)) h = (h * 31n + BigInt(c)) % 1021n; return h; }; // 10 bits

// winners[k] = id that won pairs(finalists(tiers))[k]. Returns e.g. "7KQ2-9XAB-M".
export function encode(tiers, winners) {
  const ps = pairs(finalists(tiers)), T = 2 * tiers.length, L = T + ps.length;
  if (tiers.some((t) => t < 0 || t > 2) || winners.length !== ps.length) throw new Error('incomplete');
  let v = 0n;
  tiers.forEach((t, k) => { v |= BigInt(t) << BigInt(2 * k); });
  ps.forEach(([, b], k) => { if (winners[k] === b) v |= 1n << BigInt(T + k); });
  v = (v ^ mask(L)) | (check(v) << BigInt(L));
  let s = '';
  for (let k = Math.ceil((L + 10) / 5); k > 0; k--) { s = ABC[Number(v & 31n)] + s; v >>= 5n; }
  return s.match(/.{1,4}/g).join('-');
}

export function decode(n, code) {
  let v = 0n;
  for (const c of code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')) {
    const d = ABC.indexOf(c);
    if (d < 0) throw new Error('bad character: ' + c);
    v = (v << 5n) | BigInt(d);
  }
  const T = 2 * n, low = (v & ((1n << BigInt(T)) - 1n)) ^ mask(T);
  const tiers = Array.from({ length: n }, (_, k) => Number((low >> BigInt(2 * k)) & 3n));
  if (tiers.some((t) => t > 2)) throw new Error('checksum mismatch: code mistyped?');
  const f = finalists(tiers), ps = pairs(f), L = BigInt(T + ps.length);
  const bits = (v & ((1n << L) - 1n)) ^ mask(T + ps.length);
  if ((v >> L) !== check(bits)) throw new Error('checksum mismatch: code mistyped?');
  return { tiers, finalists: f, winners: ps.map(([a, b], k) => ((bits >> BigInt(T + k)) & 1n ? b : a)) };
}

// Rank ids by wins; ties resolved by wins among the tied group only (recursively).
// A group where everyone has equal wins (e.g. a 3-way cycle) stays tied.
export function rank(ids, winners) {
  const ps = pairs(ids), beat = new Set(ps.map(([a, b], k) => (winners[k] === a ? `${a}>${b}` : `${b}>${a}`)));
  const winsIn = (group, a) => group.filter((b) => beat.has(`${a}>${b}`)).length;
  const resolve = (group) => {
    if (group.length === 1) return [{ ids: group, tied: false }];
    const w = new Map(group.map((a) => [a, winsIn(group, a)]));
    const levels = [...new Set(w.values())].sort((a, b) => b - a);
    if (levels.length === 1) return [{ ids: group, tied: true }];
    return levels.flatMap((l) => resolve(group.filter((a) => w.get(a) === l)));
  };
  const all = [...ids].sort((a, b) => a - b);
  return resolve(all).map((t) => ({ ...t, wins: t.ids.map((a) => winsIn(all, a)) }));
}
