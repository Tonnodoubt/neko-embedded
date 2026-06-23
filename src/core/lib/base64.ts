const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes: Uint8Array): string {
  const btoa = (globalThis as { btoa?: (input: string) => string }).btoa;

  if (btoa) {
    let binary = '';

    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index] ?? 0);
    }

    return btoa(binary);
  }

  return encodeBase64Fallback(bytes);
}

function encodeBase64Fallback(bytes: Uint8Array): string {
  let output = '';

  for (let offset = 0; offset < bytes.length; offset += 3) {
    const left = bytes[offset] ?? 0;
    const center = bytes[offset + 1] ?? 0;
    const right = bytes[offset + 2] ?? 0;
    const combined = (left << 16) | (center << 8) | right;

    output += BASE64_ALPHABET[(combined >> 18) & 0x3f];
    output += BASE64_ALPHABET[(combined >> 12) & 0x3f];
    output += offset + 1 < bytes.length ? BASE64_ALPHABET[(combined >> 6) & 0x3f] : '=';
    output += offset + 2 < bytes.length ? BASE64_ALPHABET[combined & 0x3f] : '=';
  }

  return output;
}

export function decodeBase64(base64: string): Uint8Array {
  const atob = (globalThis as { atob?: (input: string) => string }).atob;

  if (atob) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  return decodeBase64Fallback(base64);
}

function decodeBase64Fallback(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const outputLength = Math.floor((normalized.length * 3) / 4) - padding;
  const output = new Uint8Array(outputLength);
  let outputOffset = 0;

  for (let inputOffset = 0; inputOffset < normalized.length; inputOffset += 4) {
    const left = readBase64Value(normalized[inputOffset]);
    const centerLeft = readBase64Value(normalized[inputOffset + 1]);
    const centerRight = readBase64Value(normalized[inputOffset + 2]);
    const right = readBase64Value(normalized[inputOffset + 3]);
    const combined = (left << 18) | (centerLeft << 12) | (centerRight << 6) | right;

    if (outputOffset < outputLength) output[outputOffset] = (combined >> 16) & 0xff;
    outputOffset += 1;
    if (outputOffset < outputLength) output[outputOffset] = (combined >> 8) & 0xff;
    outputOffset += 1;
    if (outputOffset < outputLength) output[outputOffset] = combined & 0xff;
    outputOffset += 1;
  }

  return output;
}

export function readBase64Value(value: string | undefined): number {
  if (!value || value === '=') {
    return 0;
  }

  const index = BASE64_ALPHABET.indexOf(value);
  return index < 0 ? 0 : index;
}

export function encodeInt16LE(frame: Int16Array): Uint8Array {
  const bytes = new Uint8Array(frame.length * 2);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < frame.length; index += 1) {
    view.setInt16(index * 2, frame[index] ?? 0, true);
  }

  return bytes;
}
