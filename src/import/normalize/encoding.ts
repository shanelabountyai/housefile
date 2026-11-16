// N9 / D-10: strip the BOM; decode as UTF-8; on a decode error fall back to cp1252; record which.
// The cp1252 decoder is written here (32-entry table for 0x80–0x9F; everything else is Latin-1) so the
// result does not depend on the host's ICU build.

export const RULE = 'N9';
export type Encoding = 'utf-8' | 'utf-8-sig' | 'cp1252';
export type Decoded = { text: string; encoding: Encoding; rule: string };

// Windows-1252 0x80–0x9F. 0x81, 0x8D, 0x8F, 0x90, 0x9D are undefined in cp1252 and map to U+FFFD.
const CP1252_HIGH = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd,
  0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178,
];

export function decodeCp1252(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : b);
  return out;
}

export function decodeBytes(bytes: Uint8Array): Decoded {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = bom ? bytes.subarray(3) : bytes;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
    return { text, encoding: bom ? 'utf-8-sig' : 'utf-8', rule: RULE };
  } catch {
    return { text: decodeCp1252(bytes), encoding: 'cp1252', rule: RULE };
  }
}
