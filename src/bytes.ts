const CHUNK_SIZE = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, "");
  if (clean.length === 0) return new Uint8Array(0);

  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((clean.length * 3) / 4) - padding;
  const out = new Uint8Array(byteLength);

  let offset = 0;
  for (let i = 0; i < clean.length; i += CHUNK_SIZE) {
    const binary = atob(clean.slice(i, i + CHUNK_SIZE));
    for (let j = 0; j < binary.length; j++) {
      out[offset++] = binary.charCodeAt(j);
    }
  }

  return offset === byteLength ? out : out.subarray(0, offset);
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}
