/**
 * lib/qr.ts — Dependency-free QR Code generator (§7).
 *
 * Pure TypeScript, no npm packages, no network — so labels render identically on the
 * server and in print, exactly like the Code128 helper it replaces. Produces a boolean
 * module matrix that the <QRCode> component renders as crisp SVG rects.
 *
 * Scope: versions 1–6, error-correction level M (good redundancy for a small jewellery
 * tag). v1–6 hold up to 122 bytes — plenty for a SKU ("AJ1004") or a short product link.
 * Capping at v6 deliberately avoids version-information bits (only needed at v7+).
 *
 * Correctness rests only on universal QR constants:
 *   - GF(256) with primitive polynomial 0x11D and generator α = 2 (the QR standard).
 *   - Reed–Solomon generator g(x) = ∏(x − α^i), then polynomial long division.
 *   - Format-info BCH(15,5) generator 0x537, mask pattern 0x5412.
 * These are exercised by tests/qr.test.ts against the canonical "HELLO WORLD" vector.
 */

export type EccLevel = "L" | "M" | "Q" | "H";

// ---------------------------------------------------------------- GF(256) ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Reed–Solomon generator polynomial of given degree (coefficients high→low). */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** ECC codewords (length `ecLen`) for a data-codeword block. Exported for tests. */
export function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < gen.length - 1; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}

// ----------------------------------------------- version / ECC (level M) ----
// { dataCodewords, ecPerBlock, blocks }. For levels other than M on v1–6 the
// table is the same shape; we only ship M here (no mixed groups → simple split).
type VerSpec = { data: number; ecPerBlock: number; blocks: number };
const SPEC_M: Record<number, VerSpec> = {
  1: { data: 16, ecPerBlock: 10, blocks: 1 },
  2: { data: 28, ecPerBlock: 16, blocks: 1 },
  3: { data: 44, ecPerBlock: 26, blocks: 1 },
  4: { data: 64, ecPerBlock: 18, blocks: 2 },
  5: { data: 86, ecPerBlock: 24, blocks: 2 },
  6: { data: 108, ecPerBlock: 16, blocks: 4 },
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

// ------------------------------------------------------------- bit buffer ----
class Bits {
  bits: number[] = [];
  push(value: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
}

type Mode = "numeric" | "alphanumeric" | "byte";
const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function detectMode(s: string): Mode {
  if (/^[0-9]+$/.test(s)) return "numeric";
  if ([...s].every((c) => ALNUM.includes(c))) return "alphanumeric";
  return "byte";
}

function utf8(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function countBits(mode: Mode): number {
  // versions 1–9
  return mode === "numeric" ? 10 : mode === "alphanumeric" ? 9 : 8;
}

function encodeData(text: string, mode: Mode): { bits: Bits; charLen: number } {
  const bits = new Bits();
  if (mode === "numeric") {
    bits.push(1, 4); // mode 0001
  } else if (mode === "alphanumeric") {
    bits.push(2, 4); // 0010
  } else {
    bits.push(4, 4); // 1000 byte
  }
  // (char-count indicator is added later once version is known)
  const payload = new Bits();
  if (mode === "numeric") {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      payload.push(parseInt(chunk, 10), chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4);
    }
    return { bits: merge(bits, payload), charLen: text.length };
  }
  if (mode === "alphanumeric") {
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) {
        payload.push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
      } else {
        payload.push(ALNUM.indexOf(text[i]), 6);
      }
    }
    return { bits: merge(bits, payload), charLen: text.length };
  }
  const bytes = utf8(text);
  for (const b of bytes) payload.push(b, 8);
  return { bits: merge(bits, payload), charLen: bytes.length };
}

function merge(a: Bits, b: Bits): Bits {
  const out = new Bits();
  out.bits = a.bits.slice();
  out.bits.push(...b.bits);
  return out;
}

// ------------------------------------------------------------- matrix ---------
type Grid = { size: number; mods: boolean[][]; fn: boolean[][] };

function newGrid(size: number): Grid {
  return {
    size,
    mods: Array.from({ length: size }, () => new Array(size).fill(false)),
    fn: Array.from({ length: size }, () => new Array(size).fill(false)),
  };
}

function setF(g: Grid, r: number, c: number, v: boolean) {
  g.mods[r][c] = v;
  g.fn[r][c] = true;
}

function placeFinder(g: Grid, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || rr >= g.size || cc < 0 || cc >= g.size) continue;
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark = inRing && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      setF(g, rr, cc, dark);
    }
  }
}

function placeAlignment(g: Grid, version: number) {
  const centers = ALIGN[version];
  for (const r of centers) {
    for (const c of centers) {
      // Skip the three finder corners.
      if ((r === 6 && c === 6) || (r === 6 && c === g.size - 7) || (r === g.size - 7 && c === 6)) continue;
      if (g.fn[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setF(g, r + dr, c + dc, dark);
        }
      }
    }
  }
}

function placeTimingAndStatics(g: Grid, version: number) {
  // Finders + separators
  placeFinder(g, 0, 0);
  placeFinder(g, 0, g.size - 7);
  placeFinder(g, g.size - 7, 0);
  // Separators (white) around finders
  for (let i = 0; i < 8; i++) {
    setF(g, 7, i, false); setF(g, i, 7, false);
    setF(g, 7, g.size - 1 - i, false); setF(g, i, g.size - 8, false);
    setF(g, g.size - 8, i, false); setF(g, g.size - 1 - i, 7, false);
  }
  // Timing patterns
  for (let i = 8; i < g.size - 8; i++) {
    const v = i % 2 === 0;
    setF(g, 6, i, v);
    setF(g, i, 6, v);
  }
  placeAlignment(g, version);
  // Dark module
  setF(g, g.size - 8, 8, true);
  // Reserve format-info areas (filled later)
  reserveFormat(g);
}

function reserveFormat(g: Grid) {
  for (let i = 0; i < 9; i++) {
    if (!g.fn[8][i]) setF(g, 8, i, false);
    if (!g.fn[i][8]) setF(g, i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!g.fn[8][g.size - 1 - i]) setF(g, 8, g.size - 1 - i, false);
    if (!g.fn[g.size - 1 - i][8]) setF(g, g.size - 1 - i, 8, false);
  }
}

function placeData(g: Grid, data: number[]) {
  let bitIdx = 0;
  const total = data.length * 8;
  const bitAt = (i: number) => (i < total ? (data[i >> 3] >> (7 - (i & 7))) & 1 : 0);
  let up = true;
  for (let col = g.size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let n = 0; n < g.size; n++) {
      const row = up ? g.size - 1 - n : n;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (g.fn[row][c]) continue;
        g.mods[row][c] = bitAt(bitIdx) === 1;
        bitIdx++;
      }
    }
    up = !up;
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number): Grid {
  const out = newGrid(g.size);
  out.fn = g.fn.map((row) => row.slice());
  out.mods = g.mods.map((row) => row.slice());
  const fn = MASKS[mask];
  for (let r = 0; r < g.size; r++)
    for (let c = 0; c < g.size; c++) if (!g.fn[r][c] && fn(r, c)) out.mods[r][c] = !out.mods[r][c];
  return out;
}

// Format-info BCH(15,5): data = (ecc 2 bits)(mask 3 bits). Exported for tests.
export function formatBits(ecc: EccLevel, mask: number): number {
  const eccBits: Record<EccLevel, number> = { M: 0, L: 1, H: 2, Q: 3 };
  const data = (eccBits[ecc] << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function placeFormat(g: Grid, ecc: EccLevel, mask: number) {
  const bits = formatBits(ecc, mask); // 15 bits, MSB = bit14
  const bit = (i: number) => (bits >> i) & 1;
  // Around top-left finder
  for (let i = 0; i <= 5; i++) g.mods[8][i] = bit(i) === 1;
  g.mods[8][7] = bit(6) === 1;
  g.mods[8][8] = bit(7) === 1;
  g.mods[7][8] = bit(8) === 1;
  for (let i = 9; i <= 14; i++) g.mods[14 - i][8] = bit(i) === 1;
  // Around the other two finders
  for (let i = 0; i <= 7; i++) g.mods[g.size - 1 - i][8] = bit(i) === 1;
  for (let i = 8; i <= 14; i++) g.mods[8][g.size - 15 + i] = bit(i) === 1;
  g.mods[g.size - 8][8] = true; // dark module stays
}

function penalty(g: Grid): number {
  const n = g.size, m = g.mods;
  let score = 0;
  // Rule 1: runs of ≥5 same-colour in rows and columns
  for (let r = 0; r < n; r++) {
    for (const line of [m[r], m.map((row) => row[r])]) {
      let run = 1;
      for (let i = 1; i < n; i++) {
        if (line[i] === line[i - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
      }
    }
  }
  // Rule 2: 2×2 blocks
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
  // Rule 3: finder-like 1011101 patterns (with 4-white padding)
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < n; r++)
    for (let c = 0; c <= n - 11; c++) {
      const rowSlice = m[r].slice(c, c + 11);
      const colSlice = Array.from({ length: 11 }, (_, k) => m[c + k][r]);
      if (eq(rowSlice, pat1) || eq(rowSlice, pat2)) score += 40;
      if (eq(colSlice, pat1) || eq(colSlice, pat2)) score += 40;
    }
  // Rule 4: dark/light balance
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}
function eq(a: boolean[], b: boolean[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ---------------------------------------------------------------- public ----
function pickVersion(charLen: number, mode: Mode): number {
  for (let v = 1; v <= 6; v++) {
    const capacityBits = SPEC_M[v].data * 8;
    const header = 4 + countBits(mode);
    let dataBits: number;
    if (mode === "byte") dataBits = charLen * 8;
    else if (mode === "alphanumeric") dataBits = Math.floor(charLen / 2) * 11 + (charLen % 2) * 6;
    else dataBits = Math.floor(charLen / 3) * 10 + (charLen % 3 === 2 ? 7 : charLen % 3 === 1 ? 4 : 0);
    if (header + dataBits <= capacityBits) return v;
  }
  throw new Error("QR payload too large for v1–6 (keep it short — a SKU or short link).");
}

export type QrResult = { size: number; modules: boolean[][]; version: number; mask: number };

/** Encode `text` into a QR matrix (ECC level M). Throws if the payload exceeds v6. */
export function encodeQr(text: string, ecc: EccLevel = "M"): QrResult {
  const mode = detectMode(text);
  const charLen = mode === "byte" ? utf8(text).length : text.length;
  const version = pickVersion(charLen, mode);
  const spec = SPEC_M[version];

  // 1) Build the bitstream: mode + count + payload + terminator + pad.
  const { bits } = encodeData(text, mode);
  const withCount = new Bits();
  withCount.bits = bits.bits.slice(0, 4); // mode nibble
  // insert char-count indicator right after the mode nibble
  const cnt = new Bits();
  cnt.push(charLen, countBits(mode));
  withCount.bits.push(...cnt.bits, ...bits.bits.slice(4));

  const capacityBits = spec.data * 8;
  // terminator (≤4 bits)
  for (let i = 0; i < 4 && withCount.length < capacityBits; i++) withCount.bits.push(0);
  // pad to byte boundary
  while (withCount.length % 8 !== 0) withCount.bits.push(0);
  // pad bytes 0xEC, 0x11
  const pads = [0xec, 0x11];
  let p = 0;
  const dataCw: number[] = [];
  for (let i = 0; i < withCount.length; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | withCount.bits[i + k];
    dataCw.push(b);
  }
  while (dataCw.length < spec.data) dataCw.push(pads[p++ % 2]);

  // 2) Split into blocks, compute ECC, then interleave.
  const perBlock = spec.data / spec.blocks;
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let b = 0; b < spec.blocks; b++) {
    const block = dataCw.slice(b * perBlock, (b + 1) * perBlock);
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, spec.ecPerBlock));
  }
  const finalCw: number[] = [];
  for (let i = 0; i < perBlock; i++) for (const blk of dataBlocks) finalCw.push(blk[i]);
  for (let i = 0; i < spec.ecPerBlock; i++) for (const blk of eccBlocks) finalCw.push(blk[i]);

  // 3) Lay out the matrix and pick the lowest-penalty mask.
  const size = 17 + version * 4;
  const base = newGrid(size);
  placeTimingAndStatics(base, version);
  placeData(base, finalCw);

  let best: Grid | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand = applyMask(base, mask);
    placeFormat(cand, ecc, mask);
    const s = penalty(cand);
    if (s < bestScore) { bestScore = s; best = cand; bestMask = mask; }
  }
  return { size, modules: best!.mods, version, mask: bestMask };
}

/** Render a QR matrix as a self-contained SVG string (with a 4-module quiet zone). */
export function qrToSvg(text: string, opts: { ecc?: EccLevel; margin?: number } = {}): string {
  const { modules, size } = encodeQr(text, opts.ecc ?? "M");
  const margin = opts.margin ?? 4;
  const dim = size + margin * 2;
  let rects = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (modules[r][c]) rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
