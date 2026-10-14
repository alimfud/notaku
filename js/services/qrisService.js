// QRIS eksperimental: membentuk payload MPM dinamis dari QRIS statis.
//
// Ini bukan pengganti API QRIS Dinamis resmi dari GoPay/PJP. Payload dasar
// tetap harus berasal dari QRIS merchant sendiri; NotaKu hanya menambahkan
// nominal transaksi, mengubah POI method menjadi dinamis, lalu menghitung CRC.

// QR byte-capacity block layout untuk error correction level M. Setiap tripel
// berisi jumlah blok, total codeword per blok, lalu data codeword per blok.
// Tabel lengkap ini membuat payload QRIS yang panjang tetap bisa digambar
// offline, sampai QR Code version 40.
const QR_DATA_BLOCK_GROUPS_M = {
  1: [1, 26, 16],
  2: [1, 44, 28],
  3: [1, 70, 44],
  4: [2, 50, 32],
  5: [2, 67, 43],
  6: [4, 43, 27],
  7: [4, 49, 31],
  8: [2, 60, 38, 2, 61, 39],
  9: [3, 58, 36, 2, 59, 37],
  10: [4, 69, 43, 1, 70, 44],
  11: [1, 80, 50, 4, 81, 51],
  12: [6, 58, 36, 2, 59, 37],
  13: [8, 59, 37, 1, 60, 38],
  14: [4, 64, 40, 5, 65, 41],
  15: [5, 65, 41, 5, 66, 42],
  16: [7, 73, 45, 3, 74, 46],
  17: [10, 74, 46, 1, 75, 47],
  18: [9, 69, 43, 4, 70, 44],
  19: [3, 70, 44, 11, 71, 45],
  20: [3, 67, 41, 13, 68, 42],
  21: [17, 68, 42],
  22: [17, 74, 46],
  23: [4, 75, 47, 14, 76, 48],
  24: [6, 73, 45, 14, 74, 46],
  25: [8, 75, 47, 13, 76, 48],
  26: [19, 74, 46, 4, 75, 47],
  27: [22, 73, 45, 3, 74, 46],
  28: [3, 73, 45, 23, 74, 46],
  29: [21, 73, 45, 7, 74, 46],
  30: [19, 75, 47, 10, 76, 48],
  31: [2, 74, 46, 29, 75, 47],
  32: [10, 74, 46, 23, 75, 47],
  33: [14, 74, 46, 21, 75, 47],
  34: [14, 74, 46, 23, 75, 47],
  35: [12, 75, 47, 26, 76, 48],
  36: [6, 75, 47, 34, 76, 48],
  37: [29, 74, 46, 14, 75, 47],
  38: [13, 74, 46, 32, 75, 47],
  39: [40, 75, 47, 7, 76, 48],
  40: [18, 75, 47, 31, 76, 48],
};

function expandQrBlocks(groups) {
  const blocks = [];
  for (let index = 0; index < groups.length; index += 3) {
    const count = groups[index];
    const dataCodewords = groups[index + 2];
    for (let block = 0; block < count; block++) blocks.push(dataCodewords);
  }
  return blocks;
}

const QR_DATA_BLOCKS_M = Object.fromEntries(
  Object.entries(QR_DATA_BLOCK_GROUPS_M).map(([version, groups]) => [version, expandQrBlocks(groups)]),
);

const QR_ECC_CODEWORDS = Object.fromEntries(
  Object.entries(QR_DATA_BLOCK_GROUPS_M).map(([version, groups]) => [version, groups[1] - groups[2]]),
);

const ALIGNMENT_POSITIONS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
  17: [6, 30, 54, 78],
  18: [6, 30, 56, 82],
  19: [6, 30, 58, 86],
  20: [6, 34, 62, 90],
  21: [6, 28, 50, 72, 94],
  22: [6, 26, 50, 74, 98],
  23: [6, 30, 54, 78, 102],
  24: [6, 28, 54, 80, 106],
  25: [6, 32, 58, 84, 110],
  26: [6, 30, 58, 86, 114],
  27: [6, 34, 62, 90, 118],
  28: [6, 26, 50, 74, 98, 122],
  29: [6, 30, 54, 78, 102, 126],
  30: [6, 26, 52, 78, 104, 130],
  31: [6, 30, 56, 82, 108, 134],
  32: [6, 34, 60, 86, 112, 138],
  33: [6, 30, 58, 86, 114, 142],
  34: [6, 34, 62, 90, 118, 146],
  35: [6, 30, 54, 78, 102, 126, 150],
  36: [6, 24, 50, 76, 102, 128, 154],
  37: [6, 28, 54, 80, 106, 132, 158],
  38: [6, 32, 58, 84, 110, 136, 162],
  39: [6, 26, 54, 82, 110, 138, 166],
  40: [6, 30, 58, 86, 114, 142, 170],
};

const PAD_BYTES = [0xec, 0x11];

function tlv(tag, value) {
  const text = String(value ?? '');
  return `${tag}${String(text.length).padStart(2, '0')}${text}`;
}

function parseTlv(payload) {
  const entries = [];
  let index = 0;
  while (index < payload.length) {
    if (index + 4 > payload.length) throw new Error('Payload QRIS tidak lengkap.');
    const tag = payload.slice(index, index + 2);
    const length = Number(payload.slice(index + 2, index + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(length) || length < 0) {
      throw new Error('Format payload QRIS tidak valid.');
    }
    const start = index + 4;
    const end = start + length;
    if (end > payload.length) throw new Error('Panjang data QRIS tidak valid.');
    entries.push({ tag, value: payload.slice(start, end) });
    index = end;
  }
  return entries;
}

function crc16Ccitt(value) {
  let crc = 0xffff;
  for (let i = 0; i < value.length; i++) {
    crc ^= value.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function hasValidCrc(payload) {
  const match = String(payload || '').match(/6304([0-9A-Fa-f]{4})$/i);
  return !!match && crc16Ccitt(payload.slice(0, -4)).toUpperCase() === match[1].toUpperCase();
}

function normalizedPayload(value) {
  // Spasi di nama/alamat merchant adalah data QRIS yang sah; hanya buang
  // whitespace pembungkus/baris dari hasil paste.
  const payload = String(value || '').replace(/[\r\n]+/g, '').trim();
  if (!payload) return '';
  if (!/^\d{2}\d{2}/.test(payload)) throw new Error('Payload QRIS harus diawali format TLV, misalnya 0002…');
  return payload;
}

function amountText(amount) {
  const value = Math.round(Number(amount) || 0);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Nominal QRIS tidak valid.');
  // EMVCo menerima nominal numerik; dua angka desimal membuat payload lebih
  // konsisten dengan contoh QRIS dinamis yang dipakai banyak pemindai.
  return value.toFixed(2);
}

function referenceText(reference) {
  const value = String(reference || '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 25);
  return value || `NOTA${Date.now().toString(36).toUpperCase()}`.slice(0, 25);
}

function updateAdditionalData(entries, reference) {
  const index = entries.findIndex((entry) => entry.tag === '62');
  const referenceEntry = { tag: '05', value: referenceText(reference) };
  if (index < 0) {
    const insertAt = entries.findIndex((entry) => entry.tag === '63' || entry.tag === '64');
    entries.splice(insertAt < 0 ? entries.length : insertAt, 0, { tag: '62', value: tlv(referenceEntry.tag, referenceEntry.value) });
    return;
  }
  const nested = parseTlv(entries[index].value).filter((entry) => entry.tag !== '05');
  nested.push(referenceEntry);
  entries[index] = { tag: '62', value: nested.map((entry) => tlv(entry.tag, entry.value)).join('') };
}

/**
 * Buat payload QRIS nominal dari payload static merchant.
 * Tag 54 adalah nominal; tag 01=12 menandai MPM dinamis.
 */
export function buildDynamicQrisPayload(staticPayload, amount, merchantReference = '') {
  const payload = normalizedPayload(staticPayload);
  if (!payload) return '';
  const value = amountText(amount);

  const withoutCrc = payload.replace(/6304[0-9A-Fa-f]{4}$/i, '');
  const entries = parseTlv(withoutCrc);
  const updated = [];
  let hasAmount = false;
  for (const entry of entries) {
    if (entry.tag === '63') continue;
    if (entry.tag === '01') {
      updated.push({ tag: entry.tag, value: '12' });
      continue;
    }
    if (entry.tag === '54') {
      updated.push({ tag: entry.tag, value });
      hasAmount = true;
      continue;
    }
    updated.push(entry);
  }
  if (!hasAmount) {
    const insertAt = updated.findIndex((entry) => entry.tag === '58');
    updated.splice(insertAt < 0 ? updated.length : insertAt, 0, { tag: '54', value });
  }
  updateAdditionalData(updated, merchantReference);
  const body = updated.map((entry) => tlv(entry.tag, entry.value)).join('');
  return `${body}6304${crc16Ccitt(`${body}6304`)}`;
}

function gfMultiply(a, b) {
  if (!a || !b) return 0;
  let result = 0;
  let left = a;
  let right = b;
  while (right) {
    if (right & 1) result ^= left;
    left <<= 1;
    if (left & 0x100) left ^= 0x11d;
    right >>>= 1;
  }
  return result;
}

function reedSolomon(data, count) {
  const generator = [1];
  let root = 1;
  for (let i = 0; i < count; i++) {
    const next = new Array(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j++) {
      next[j] ^= generator[j];
      next[j + 1] ^= gfMultiply(generator[j], root);
    }
    generator.splice(0, generator.length, ...next);
    root = gfMultiply(root, 2);
  }
  const remainder = new Array(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < count; i++) remainder[i] ^= gfMultiply(generator[i + 1], factor);
  }
  return remainder;
}

function bitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let bit = 0; bit < 8; bit++) value = (value << 1) | (bits[i + bit] || 0);
    bytes.push(value);
  }
  return bytes;
}

function bytesForVersion(payload, version) {
  const dataBits = [];
  const pushBits = (value, length) => {
    for (let bit = length - 1; bit >= 0; bit--) dataBits.push((value >>> bit) & 1);
  };
  const bytes = new TextEncoder().encode(payload);
  const countBits = version < 10 ? 8 : 16;
  pushBits(0x4, 4);
  pushBits(bytes.length, countBits);
  for (const byte of bytes) pushBits(byte, 8);

  const capacity = QR_DATA_BLOCKS_M[version].reduce((sum, n) => sum + n, 0);
  if (dataBits.length > capacity * 8) return null;
  for (let i = 0; i < Math.min(4, capacity * 8 - dataBits.length); i++) dataBits.push(0);
  while (dataBits.length % 8) dataBits.push(0);
  const data = bitsToBytes(dataBits);
  let pad = 0;
  while (data.length < capacity) data.push(PAD_BYTES[pad++ % 2]);

  const eccCount = QR_ECC_CODEWORDS[version];
  const blocks = [];
  let offset = 0;
  for (const length of QR_DATA_BLOCKS_M[version]) {
    const block = data.slice(offset, offset + length);
    offset += length;
    blocks.push({ data: block, ecc: reedSolomon(block, eccCount) });
  }
  const codewords = [];
  const maxData = Math.max(...blocks.map((block) => block.data.length));
  const maxEcc = Math.max(...blocks.map((block) => block.ecc.length));
  for (let i = 0; i < maxData; i++) for (const block of blocks) if (i < block.data.length) codewords.push(block.data[i]);
  for (let i = 0; i < maxEcc; i++) for (const block of blocks) if (i < block.ecc.length) codewords.push(block.ecc[i]);
  return codewords;
}

function bchTypeInfo(value) {
  let data = value << 10;
  const generator = 0x537;
  while (dataBitLength(data) - dataBitLength(generator) >= 0) data ^= generator << (dataBitLength(data) - dataBitLength(generator));
  return ((value << 10) | data) ^ 0x5412;
}

function bchTypeNumber(value) {
  let data = value << 12;
  const generator = 0x1f25;
  while (dataBitLength(data) - dataBitLength(generator) >= 0) data ^= generator << (dataBitLength(data) - dataBitLength(generator));
  return (value << 12) | data;
}

function dataBitLength(value) {
  let length = 0;
  while (value) { length++; value >>>= 1; }
  return length;
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return ((((row * col) % 2) + ((row * col) % 3)) % 2) === 0;
    case 7: return ((((row * col) % 3) + ((row + col) % 2)) % 2) === 0;
    default: return false;
  }
}

function newMatrix(version) {
  const size = version * 4 + 17;
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function setupFinder(matrix, row, col) {
  const size = matrix.length;
  for (let r = -1; r <= 7; r++) {
    if (row + r < 0 || row + r >= size) continue;
    for (let c = -1; c <= 7; c++) {
      if (col + c < 0 || col + c >= size) continue;
      matrix[row + r][col + c] = (0 <= r && r <= 6 && (c === 0 || c === 6))
        || (0 <= c && c <= 6 && (r === 0 || r === 6))
        || (2 <= r && r <= 4 && 2 <= c && c <= 4);
    }
  }
}

function setupPatterns(matrix, version) {
  const size = matrix.length;
  setupFinder(matrix, 0, 0);
  setupFinder(matrix, size - 7, 0);
  setupFinder(matrix, 0, size - 7);
  for (const row of ALIGNMENT_POSITIONS[version]) {
    for (const col of ALIGNMENT_POSITIONS[version]) {
      if (matrix[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        matrix[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      }
    }
  }
  for (let i = 8; i < size - 8; i++) {
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[i][8] === null) matrix[i][8] = false;
    if (matrix[8][i] === null) matrix[8][i] = false;
  }
  for (let i = size - 8; i < size; i++) {
    matrix[i][8] = false;
    matrix[8][i] = false;
  }
  matrix[size - 8][8] = true;
}

function setupTypeInfo(matrix, mask) {
  const size = matrix.length;
  const bits = bchTypeInfo(mask << 3);
  for (let i = 0; i < 15; i++) {
    const mod = ((bits >>> i) & 1) === 1;
    if (i < 6) matrix[i][8] = mod;
    else if (i < 8) matrix[i + 1][8] = mod;
    else matrix[size - 15 + i][8] = mod;
    if (i < 8) matrix[8][size - i - 1] = mod;
    else if (i < 9) matrix[8][15 - i] = mod;
    else matrix[8][15 - i - 1] = mod;
  }
  matrix[size - 8][8] = true;
}

function setupVersionInfo(matrix, version) {
  if (version < 7) return;
  const bits = bchTypeNumber(version);
  const size = matrix.length;
  for (let i = 0; i < 18; i++) {
    const mod = ((bits >>> i) & 1) === 1;
    matrix[Math.floor(i / 3)][i % 3 + size - 8 - 3] = mod;
    matrix[i % 3 + size - 8 - 3][Math.floor(i / 3)] = mod;
  }
}

function mapData(matrix, codewords, mask) {
  const size = matrix.length;
  let row = size - 1;
  let inc = -1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        const currentCol = col - c;
        if (matrix[row][currentCol] !== null) continue;
        let dark = false;
        if (byteIndex < codewords.length) dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
        if (maskBit(mask, row, currentCol)) dark = !dark;
        matrix[row][currentCol] = dark;
        bitIndex--;
        if (bitIndex < 0) { byteIndex++; bitIndex = 7; }
      }
      row += inc;
      if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
    }
  }
}

function lostPoint(matrix) {
  const size = matrix.length;
  let score = 0;
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    let same = 0;
    const color = matrix[row][col];
    for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) {
      if (!r && !c) continue;
      const rr = row + r, cc = col + c;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size && matrix[rr][cc] === color) same++;
    }
    if (same > 5) score += 3 + same - 5;
  }
  for (let row = 0; row < size - 1; row++) for (let col = 0; col < size - 1; col++) {
    const a = matrix[row][col], b = matrix[row + 1][col], c = matrix[row][col + 1], d = matrix[row + 1][col + 1];
    if (a === b && a === c && a === d) score += 3;
  }
  for (let row = 0; row < size; row++) for (let col = 0; col < size - 6; col++) {
    if (matrix[row][col] && !matrix[row][col + 1] && matrix[row][col + 2] && matrix[row][col + 3] && matrix[row][col + 4] && !matrix[row][col + 5] && matrix[row][col + 6]) score += 40;
  }
  for (let col = 0; col < size; col++) for (let row = 0; row < size - 6; row++) {
    if (matrix[row][col] && !matrix[row + 1][col] && matrix[row + 2][col] && matrix[row + 3][col] && matrix[row + 4][col] && !matrix[row + 5][col] && matrix[row + 6][col]) score += 40;
  }
  let dark = 0;
  for (const row of matrix) for (const cell of row) if (cell) dark++;
  score += Math.abs(100 * dark / (size * size) - 50) / 5 * 10;
  return score;
}

function encodeQrMatrix(payload) {
  let version = 1;
  while (version <= 40 && !bytesForVersion(payload, version)) version++;
  if (version > 40) throw new Error('Payload QRIS terlalu panjang untuk dibuat sebagai QR Code.');
  const codewords = bytesForVersion(payload, version);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const matrix = newMatrix(version);
    setupPatterns(matrix, version);
    setupVersionInfo(matrix, version);
    setupTypeInfo(matrix, mask);
    mapData(matrix, codewords, mask);
    const score = lostPoint(matrix);
    if (!best || score < best.score) best = { matrix, score };
  }
  return best.matrix;
}

export function qrPayloadToDataUrl(payload, size = 512) {
  if (typeof document === 'undefined') throw new Error('QRIS hanya dapat dibuat di browser.');
  const matrix = encodeQrMatrix(payload);
  const modules = matrix.length;
  const margin = 4;
  const scale = Math.max(1, Math.floor(size / (modules + margin * 2)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (modules + margin * 2) * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
    if (matrix[row][col]) context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
  }
  return canvas.toDataURL('image/png');
}

export function isValidQrisPayload(value) {
  try {
    const normalized = normalizedPayload(value);
    if (!hasValidCrc(normalized)) return false;
    const payload = normalized.replace(/6304[0-9A-Fa-f]{4}$/i, '');
    const entries = parseTlv(payload);
    return entries.some((entry) => entry.tag === '00') && entries.some((entry) => entry.tag === '26' || entry.tag === '27');
  } catch {
    return false;
  }
}

export async function decodeQrPayload(file) {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return '';
  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    const bitmap = await createImageBitmap(file);
    const results = await detector.detect(bitmap);
    bitmap.close?.();
    return results[0]?.rawValue || '';
  } catch {
    return '';
  }
}

export function dynamicQrisImage(settings, amount, merchantReference = '') {
  if (!(Number(amount) > 0)) return '';
  if (settings?.qrisPayload) {
    try {
      return qrPayloadToDataUrl(buildDynamicQrisPayload(settings.qrisPayload, amount, merchantReference));
    } catch {
      // Payload yang belum valid tetap boleh memakai gambar QRIS statis.
    }
  }
  return settings?.qrisImageData || '';
}

