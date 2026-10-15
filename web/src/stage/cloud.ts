/**
 * Loader for AGSC point clouds (pipeline/src/alphagenome_platform/stage/clouds.py).
 *
 *   [0:4] "AGSC" · [4:8] version u32 · [8:12] header length u32 · JSON header (padded to 8)
 *   then N records of 8 bytes: x,y,z int16 · amp u8 (0.01 Å steps) · class u8 (bit 7 = padding)
 *
 * The records go to the GPU untouched: no per-point work in JavaScript.
 */

export interface CloudHeader {
  pdbId: string;
  points: number;
  recordBytes: number;
  radiusA: number;
  extentA: number[];
  ampStepA: number;
  classes: string[];
  padFlag: number;
}

export interface Cloud {
  header: CloudHeader;
  /** Interleaved records, 8 bytes each, ready for gl.bufferData. */
  records: ArrayBuffer;
}

export interface StageEntry {
  id: string;
  role: string;
  chapter: number;
  file: string;
  bytesGz: number;
  points: number;
  radiusA: number;
  maxExtentA: number;
  provenance: {
    experimentalMethod: string;
    resolutionA: number;
    title: string;
    url: string;
    citation: { title?: string; year?: string; journal?: string; doi?: string; pmid?: string; firstAuthor?: string };
  };
}

export interface StageIndex {
  format: string;
  points: number;
  structures: StageEntry[];
}

export function parseCloud(buf: ArrayBuffer): Cloud {
  const head = new DataView(buf, 0, 12);
  const magic = String.fromCharCode(head.getUint8(0), head.getUint8(1), head.getUint8(2), head.getUint8(3));
  if (magic !== 'AGSC') throw new Error(`not an AGSC block: ${magic}`);
  const version = head.getUint32(4, true);
  if (version !== 1) throw new Error(`unknown AGSC version ${version}`);
  const hlen = head.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hlen))) as CloudHeader;
  const start = 12 + hlen;
  if (buf.byteLength - start !== header.points * 8) throw new Error('AGSC truncated');
  return { header, records: buf.slice(start) };
}

export async function loadCloud(base: string, file: string, signal?: AbortSignal): Promise<Cloud> {
  const res = await fetch(base + file, { signal });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return parseCloud(await res.arrayBuffer());
}

export async function loadIndex(base: string): Promise<StageIndex> {
  const res = await fetch(base + 'index.json');
  if (!res.ok) throw new Error(`stage index: HTTP ${res.status}`);
  return (await res.json()) as StageIndex;
}
