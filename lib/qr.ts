/**
 * lib/qr.ts — Minimal, self-contained QR-code encoder (no external library), in the same
 * spirit as lib/barcode.ts. Byte mode, error-correction level M, versions 1–5 (up to ~84
 * characters — plenty for SKUs and short URLs). Returns the module matrix so it can be
 * rendered as plain SVG rects and printed reliably offline.
 *
 * QR labels replace Code-128 for Aggarwal's stickers: they stay scannable at small sizes,
 * survive smudging (error correction), and phone cameras read them natively.
 */

// ---------------------------------------------------------------- GF(256) arithmetic
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Reed-Solomon error-correction codewords for `data` (nEc codewords). */
function rsEncode(data: number[], nEc: number): number[] {
  // generator polynomial
  let gen = [1];
  for (let i = 0; i < nEc; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];                     // × x
      next[j + 1] ^= gmul(gen[j], EXP[i]);   // × α^i
    }
    gen = next;
  }
  const res = new Array(nEc).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift(); res.push(0);
    if (factor !== 0) for (let j = 0; j < nEc; j++) res[j] ^= gmul(gen[j + 1], factor);
  }
  return res;
}

// ------------------------------------------------- version tables (ECC level M only)
// [totalCodewords, ecPerBlock, blocks] — data codewords = total − ec×blocks.
const VER_M: Record<number, [number, number, number]> = {
  1: [26, 10, 1],   // 16 data
  2: [44, 16, 1],   // 28 data
  3: [70, 26, 1],   // 44 data
  4: [100, 18, 2],  // 64 data
  5: [134, 24, 2],  // 86 data
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };

// ------------------------------------------------------------------------ bit buffer
class Bits {
  bits: number[] = [];
  push(val: number, len: number) { for (let i = len - 1; i >= 0; i--) this.bits.push((val >> i) & 1); }
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

/** BCH(15,5) format info for ECC M (bits `00`) + mask, pre-masked with 0x5412. */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // M = 00
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Encode `text` (byte mode, ECC M). Returns the square module matrix (true = dark). */
export function qrMatrix(text: string): boolean[][] {
  const bytes: number[] = [];
  for (const ch of new TextEncoder().encode(text)) bytes.push(ch);

  // pick the smallest version that fits: data capacity − 2 header bytes
  let version = 0;
  for (const v of [1, 2, 3, 4, 5]) {
    const [total, ec, blocks] = VER_M[v];
    if (bytes.length <= total - ec * blocks - 2) { version = v; break; }
  }
  if (!version) throw new Error(`QR payload too long (${bytes.length} bytes; max 84)`);
  const [total, ecPerBlock, numBlocks] = VER_M[version];
  const dataCw = total - ecPerBlock * numBlocks;
  const size = 17 + version * 4;

  // ---- data bit stream: mode 0100, 8-bit count, bytes, terminator, pad
  const bb = new Bits();
  bb.push(0b0100, 4);
  bb.push(bytes.length, 8);
  for (const b of bytes) bb.push(b, 8);
  const capacityBits = dataCw * 8;
  bb.push(0, Math.min(4, capacityBits - bb.bits.length)); // terminator
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j];
    codewords.push(v);
  }
  const PAD = [0xec, 0x11];
  for (let i = 0; codewords.length < dataCw; i++) codewords.push(PAD[i % 2]);

  // ---- split into blocks + interleave data & EC
  const perBlock = Math.floor(dataCw / numBlocks);
  const extra = dataCw % numBlocks; // first `numBlocks-extra` blocks are short
  const blocks: number[][] = [];
  let off = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = perBlock + (b >= numBlocks - extra ? 1 : 0);
    blocks.push(codewords.slice(off, off + len)); off += len;
  }
  const ecBlocks = blocks.map((blk) => rsEncode(blk, ecPerBlock));
  const inter: number[] = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) for (const blk of blocks) if (i < blk.length) inter.push(blk[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const eb of ecBlocks) inter.push(eb[i]);

  // ---- module matrix with function patterns
  const M: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
  const setFinder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      M[rr][cc] = on;
    }
  };
  setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);
  // alignment (before timing; skipped where it would overlap a finder)
  const centers = ALIGN[version];
  for (const r of centers) for (const c of centers) {
    if (M[r][c] !== null) continue; // skip finders
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      M[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
    }
  }
  // timing (fills only what alignment/finders left open)
  for (let i = 8; i < size - 8; i++) {
    if (M[6][i] === null) M[6][i] = i % 2 === 0;
    if (M[i][6] === null) M[i][6] = i % 2 === 0;
  }
  // reserve format areas + dark module
  for (let i = 0; i < 9; i++) { if (M[8][i] === null) M[8][i] = false; if (M[i][8] === null) M[i][8] = false; }
  for (let i = 0; i < 8; i++) { if (M[8][size - 1 - i] === null) M[8][size - 1 - i] = false; if (M[size - 1 - i][8] === null) M[size - 1 - i][8] = false; }
  M[size - 8][8] = true; // dark module

  // ---- place data bits (zigzag, right to left, skipping column 6)
  const dataBits: number[] = [];
  for (const cw of inter) for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1);
  const positions: [number, number][] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) if (M[r][c] === null) positions.push([r, c]);
    }
    upward = !upward;
  }
  const placed = new Set(positions.map(([r, c]) => r * size + c));

  // ---- try all masks, keep the lowest penalty
  let best: boolean[][] | null = null; let bestScore = Infinity; let bestMask = 0;
  for (let m = 0; m < 8; m++) {
    const G: boolean[][] = M.map((row) => row.map((v) => v ?? false));
    positions.forEach(([r, c], i) => {
      const bit = i < dataBits.length ? dataBits[i] === 1 : false;
      G[r][c] = MASKS[m](r, c) ? !bit : bit;
    });
    // format info — placed twice, bit i = the i-th least-significant bit
    const f = formatBits(m);
    const fb = (i: number) => ((f >> i) & 1) === 1;
    for (let i = 0; i < 15; i++) {
      // vertical strip (around the top-left finder, going down col 8 then bottom-left)
      if (i < 6) G[i][8] = fb(i);
      else if (i < 8) G[i + 1][8] = fb(i);
      else G[size - 15 + i][8] = fb(i);
      // horizontal strip (row 8: right edge then left of the top-left finder)
      if (i < 8) G[8][size - 1 - i] = fb(i);
      else if (i < 9) G[8][15 - i] = fb(i);
      else G[8][14 - i] = fb(i);
    }
    G[size - 8][8] = true;

    const score = penalty(G);
    if (score < bestScore) { bestScore = score; best = G; bestMask = m; }
  }
  void bestMask; void placed;
  return best as boolean[][];
}

/** Standard mask-selection penalty (rules N1–N4). */
function penalty(G: boolean[][]): number {
  const n = G.length; let score = 0;
  // N1: runs of 5+
  for (let dir = 0; dir < 2; dir++) {
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        const cur = dir ? G[j][i] : G[i][j];
        const prev = dir ? G[j - 1][i] : G[i][j - 1];
        if (cur === prev) { run++; if (j === n - 1 && run >= 5) score += 3 + run - 5; }
        else { if (run >= 5) score += 3 + run - 5; run = 1; }
      }
    }
  }
  // N2: 2×2 blocks
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    if (G[r][c] === G[r][c + 1] && G[r][c] === G[r + 1][c] && G[r][c] === G[r + 1][c + 1]) score += 3;
  }
  // N3: finder-like patterns 1011101 with 4 light on either side
  const pat = [true, false, true, true, true, false, true];
  const check = (get: (k: number) => boolean | undefined, i: number) => {
    let ok = true;
    for (let k = 0; k < 7; k++) if (get(i + k) !== pat[k]) { ok = false; break; }
    if (!ok) return false;
    const before = [0, 1, 2, 3].every((k) => get(i - 1 - k) === false);
    const after = [0, 1, 2, 3].every((k) => get(i + 7 + k) === false);
    return before || after;
  };
  for (let r = 0; r < n; r++) for (let i = 0; i <= n - 7; i++) {
    if (check((k) => (k >= 0 && k < n ? G[r][k] : undefined), i)) score += 40;
    if (check((k) => (k >= 0 && k < n ? G[k][r] : undefined), i)) score += 40;
  }
  // N4: dark proportion
  let dark = 0; for (const row of G) for (const v of row) if (v) dark++;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/** SVG path `d` for the dark modules (1 unit per module) — render inside a viewBox of `size`. */
export function qrPath(matrix: boolean[][]): { d: string; size: number } {
  const size = matrix.length;
  let d = "";
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (matrix[r][c]) d += `M${c} ${r}h1v1h-1z`;
  }
  return { d, size };
}
