/**
 * SHA-512 and SHA-384, synchronous. Office's password key derivation chains
 * 100,000 hashes; awaiting crypto.subtle.digest for each takes seconds, while
 * hashing in-thread takes a fraction of one.
 *
 * 64-bit words are kept as (high, low) pairs of signed 32-bit integers, which
 * V8 keeps unboxed; low halves become unsigned only to be summed for a carry.
 */

const MASK_64 = (1n << 64n) - 1n;

function integerRoot(value: bigint, degree: bigint): bigint {
  let root = 1n << (BigInt(value.toString(2).length) / degree + 1n);
  for (;;) {
    const next = ((degree - 1n) * root + value / root ** (degree - 1n)) / degree;
    if (next >= root) return root;
    root = next;
  }
}

function firstPrimes(count: number): number[] {
  const primes: number[] = [];
  for (let candidate = 2; primes.length < count; candidate++) {
    if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate);
  }
  return primes;
}

/** The first 64 bits of the fractional part of the prime's square or cube root (FIPS 180-4). */
const fractionBits = (prime: number, degree: bigint) =>
  integerRoot(BigInt(prime) << (64n * degree), degree) & MASK_64;

// eslint-disable-next-line arch/no-ad-hoc-money-parse -- hash constants, not amounts
const toInt32 = (value: bigint) => Number(BigInt.asIntN(32, value));

const toWordPairs = (values: bigint[]) =>
  Int32Array.from(values.flatMap((value) => [toInt32(value >> 32n), toInt32(value)]));

const PRIMES = firstPrimes(80);
const ROUND_CONSTANTS = toWordPairs(PRIMES.map((prime) => fractionBits(prime, 3n)));
const INITIAL_STATE = {
  "SHA-512": toWordPairs(PRIMES.slice(0, 8).map((prime) => fractionBits(prime, 2n))),
  "SHA-384": toWordPairs(PRIMES.slice(8, 16).map((prime) => fractionBits(prime, 2n))),
};

export type Sha512Variant = keyof typeof INITIAL_STATE;

const DIGEST_BYTES: Record<Sha512Variant, number> = { "SHA-512": 64, "SHA-384": 48 };

// Rotate right by 0 < bits < 64, bits ≠ 32: the high and low halves of the result.
const rotateHigh = (high: number, low: number, bits: number) =>
  bits < 32
    ? (high >>> bits) | (low << (32 - bits))
    : (low >>> (bits - 32)) | (high << (64 - bits));
const rotateLow = (high: number, low: number, bits: number) =>
  bits < 32
    ? (low >>> bits) | (high << (32 - bits))
    : (high >>> (bits - 32)) | (low << (64 - bits));

/** The carry out of a sum of unsigned low halves. */
const carry = (lowSum: number) => (lowSum / 2 ** 32) | 0;

function compress(state: Int32Array, words: Int32Array, block: DataView, offset: number) {
  for (let index = 0; index < 32; index++) {
    words[index] = block.getInt32(offset + index * 4);
  }
  for (let index = 32; index < 160; index += 2) {
    const fifteenHigh = words[index - 30] ?? 0;
    const fifteenLow = words[index - 29] ?? 0;
    const twoHigh = words[index - 4] ?? 0;
    const twoLow = words[index - 3] ?? 0;
    const sigma0High =
      rotateHigh(fifteenHigh, fifteenLow, 1) ^
      rotateHigh(fifteenHigh, fifteenLow, 8) ^
      (fifteenHigh >>> 7);
    const sigma0Low =
      rotateLow(fifteenHigh, fifteenLow, 1) ^
      rotateLow(fifteenHigh, fifteenLow, 8) ^
      ((fifteenLow >>> 7) | (fifteenHigh << 25));
    const sigma1High =
      rotateHigh(twoHigh, twoLow, 19) ^ rotateHigh(twoHigh, twoLow, 61) ^ (twoHigh >>> 6);
    const sigma1Low =
      rotateLow(twoHigh, twoLow, 19) ^
      rotateLow(twoHigh, twoLow, 61) ^
      ((twoLow >>> 6) | (twoHigh << 26));
    const low =
      (sigma0Low >>> 0) +
      (sigma1Low >>> 0) +
      ((words[index - 13] ?? 0) >>> 0) +
      ((words[index - 31] ?? 0) >>> 0);
    words[index] =
      sigma0High + sigma1High + (words[index - 14] ?? 0) + (words[index - 32] ?? 0) + carry(low);
    words[index + 1] = low;
  }

  let aHigh = state[0] ?? 0;
  let aLow = state[1] ?? 0;
  let bHigh = state[2] ?? 0;
  let bLow = state[3] ?? 0;
  let cHigh = state[4] ?? 0;
  let cLow = state[5] ?? 0;
  let dHigh = state[6] ?? 0;
  let dLow = state[7] ?? 0;
  let eHigh = state[8] ?? 0;
  let eLow = state[9] ?? 0;
  let fHigh = state[10] ?? 0;
  let fLow = state[11] ?? 0;
  let gHigh = state[12] ?? 0;
  let gLow = state[13] ?? 0;
  let hHigh = state[14] ?? 0;
  let hLow = state[15] ?? 0;
  for (let index = 0; index < 160; index += 2) {
    const sum1High =
      rotateHigh(eHigh, eLow, 14) ^ rotateHigh(eHigh, eLow, 18) ^ rotateHigh(eHigh, eLow, 41);
    const sum1Low =
      rotateLow(eHigh, eLow, 14) ^ rotateLow(eHigh, eLow, 18) ^ rotateLow(eHigh, eLow, 41);
    const chooseHigh = (eHigh & fHigh) ^ (~eHigh & gHigh);
    const chooseLow = (eLow & fLow) ^ (~eLow & gLow);
    const temp1Low =
      (hLow >>> 0) +
      (sum1Low >>> 0) +
      (chooseLow >>> 0) +
      ((ROUND_CONSTANTS[index + 1] ?? 0) >>> 0) +
      ((words[index + 1] ?? 0) >>> 0);
    const temp1High =
      (hHigh +
        sum1High +
        chooseHigh +
        (ROUND_CONSTANTS[index] ?? 0) +
        (words[index] ?? 0) +
        carry(temp1Low)) |
      0;

    const sum0High =
      rotateHigh(aHigh, aLow, 28) ^ rotateHigh(aHigh, aLow, 34) ^ rotateHigh(aHigh, aLow, 39);
    const sum0Low =
      rotateLow(aHigh, aLow, 28) ^ rotateLow(aHigh, aLow, 34) ^ rotateLow(aHigh, aLow, 39);
    const majorityHigh = (aHigh & bHigh) ^ (aHigh & cHigh) ^ (bHigh & cHigh);
    const majorityLow = (aLow & bLow) ^ (aLow & cLow) ^ (bLow & cLow);
    const temp2Low = (sum0Low >>> 0) + (majorityLow >>> 0);
    const temp2High = (sum0High + majorityHigh + carry(temp2Low)) | 0;

    hHigh = gHigh;
    hLow = gLow;
    gHigh = fHigh;
    gLow = fLow;
    fHigh = eHigh;
    fLow = eLow;
    const newELow = (dLow >>> 0) + (temp1Low >>> 0);
    eHigh = (dHigh + temp1High + carry(newELow)) | 0;
    eLow = newELow | 0;
    dHigh = cHigh;
    dLow = cLow;
    cHigh = bHigh;
    cLow = bLow;
    bHigh = aHigh;
    bLow = aLow;
    const newALow = (temp1Low >>> 0) + (temp2Low >>> 0);
    aHigh = (temp1High + temp2High + carry(newALow)) | 0;
    aLow = newALow | 0;
  }

  const working = [aHigh, aLow, bHigh, bLow, cHigh, cLow, dHigh, dLow];
  working.push(eHigh, eLow, fHigh, fLow, gHigh, gLow, hHigh, hLow);
  for (let index = 0; index < 16; index += 2) {
    const low = ((state[index + 1] ?? 0) >>> 0) + ((working[index + 1] ?? 0) >>> 0);
    state[index] = (state[index] ?? 0) + (working[index] ?? 0) + carry(low);
    state[index + 1] = low;
  }
}

export function sha512(data: Uint8Array, variant: Sha512Variant = "SHA-512"): Uint8Array {
  const paddedLength = Math.ceil((data.length + 17) / 128) * 128;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = data.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const state = INITIAL_STATE[variant].slice();
  const words = new Int32Array(160);
  for (let offset = 0; offset < paddedLength; offset += 128) {
    compress(state, words, view, offset);
  }

  const digest = new Uint8Array(64);
  const digestView = new DataView(digest.buffer);
  state.forEach((word, index) => digestView.setInt32(index * 4, word));
  return digest.subarray(0, DIGEST_BYTES[variant]);
}
