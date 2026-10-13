/**
 * Decrypts an Office file protected with a password: an OLE compound file
 * holding the real package under ECMA-376 agile encryption (MS-OFFCRYPTO
 * 2.3.4.10 to 2.3.4.15). Only AES with SHA-384 or SHA-512, the ciphers Excel
 * and UnionBank use.
 */
import CFB from "cfb";
import { sha512, type Sha512Variant } from "./sha512";
import { StatementParseError } from "./statement";

const BLOCK_KEYS = {
  verifierInput: [0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79],
  verifierHash: [0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e],
  secretKey: [0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6],
};
const SEGMENT_BYTES = 4096;
const AES_BLOCK_BYTES = 16;
const HASHES: Record<string, Sha512Variant> = { SHA512: "SHA-512", SHA384: "SHA-384" };

interface CipherParams {
  salt: Uint8Array<ArrayBuffer>;
  hash: Sha512Variant;
  keyBytes: number;
  hashBytes: number;
}

interface PasswordKeyEncryptor extends CipherParams {
  spinCount: number;
  encryptedVerifierHashInput: Uint8Array<ArrayBuffer>;
  encryptedVerifierHashValue: Uint8Array<ArrayBuffer>;
  encryptedKeyValue: Uint8Array<ArrayBuffer>;
}

const unsupported = (reason: string) =>
  new StatementParseError("failed", { cause: new Error(`Office encryption: ${reason}`) });

function concat(...parts: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

const uint32LE = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** Truncates, or pads with 0x36, to the length the cipher needs (2.3.4.12). */
function fitTo(bytes: Uint8Array, length: number): Uint8Array<ArrayBuffer> {
  const fitted = new Uint8Array(length).fill(0x36);
  fitted.set(bytes.subarray(0, length));
  return fitted;
}

function attributesOf(xml: string, tag: string): Record<string, string> | null {
  const element = new RegExp(`<(?:\\w+:)?${tag}\\s([^>]*)>`).exec(xml)?.[1];
  if (element === undefined) return null;
  return Object.fromEntries(
    [...element.matchAll(/(\w+)="([^"]*)"/g)].map(([, name = "", value = ""]) => [name, value])
  );
}

function cipherParams(attributes: Record<string, string>): CipherParams {
  const hash = HASHES[attributes.hashAlgorithm ?? ""];
  if (attributes.cipherAlgorithm !== "AES" || attributes.cipherChaining !== "ChainingModeCBC") {
    throw unsupported(`cipher ${attributes.cipherAlgorithm} ${attributes.cipherChaining}`);
  }
  if (!hash) throw unsupported(`hash ${attributes.hashAlgorithm}`);
  return {
    salt: fromBase64(attributes.saltValue ?? ""),
    hash,
    keyBytes: parseInt(attributes.keyBits ?? "", 10) / 8,
    hashBytes: parseInt(attributes.hashSize ?? "", 10),
  };
}

function readEncryptionInfo(info: Uint8Array) {
  const [major, , minor] = info;
  if (major !== 4 || minor !== 4) throw unsupported(`version ${major}.${minor}`);
  const xml = new TextDecoder().decode(info.subarray(8));
  const keyData = attributesOf(xml, "keyData");
  const encryptedKey = attributesOf(xml, "encryptedKey");
  if (!keyData || !encryptedKey) throw unsupported("no password key encryptor");
  const passwordKey: PasswordKeyEncryptor = {
    ...cipherParams(encryptedKey),
    spinCount: parseInt(encryptedKey.spinCount ?? "", 10),
    encryptedVerifierHashInput: fromBase64(encryptedKey.encryptedVerifierHashInput ?? ""),
    encryptedVerifierHashValue: fromBase64(encryptedKey.encryptedVerifierHashValue ?? ""),
    encryptedKeyValue: fromBase64(encryptedKey.encryptedKeyValue ?? ""),
  };
  return { keyData: cipherParams(keyData), passwordKey };
}

const importAesKey = (keyBytes: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["encrypt", "decrypt"]);

/**
 * AES-CBC without padding. WebCrypto insists on PKCS#7 padding, so one block
 * that decrypts to a full padding block is appended: AES(last block ⊕ 0x10…),
 * which is what encrypting nothing with the last block as IV gives.
 */
async function decryptAesCbc(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  if (ciphertext.length === 0 || ciphertext.length % AES_BLOCK_BYTES !== 0) {
    throw unsupported("ciphertext isn't whole blocks");
  }
  const padding = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: ciphertext.slice(-AES_BLOCK_BYTES) },
    key,
    new Uint8Array(0)
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    concat(ciphertext, new Uint8Array(padding))
  );
  return new Uint8Array(plaintext);
}

/** The key that encrypts the package, or null when the password is wrong. */
async function unlockSecretKey(
  passwordKey: PasswordKeyEncryptor,
  password: string
): Promise<Uint8Array<ArrayBuffer> | null> {
  const { salt, hash, keyBytes, hashBytes, spinCount } = passwordKey;
  const passwordBytes = new Uint8Array(password.length * 2);
  const passwordView = new DataView(passwordBytes.buffer);
  for (let index = 0; index < password.length; index++) {
    passwordView.setUint16(index * 2, password.charCodeAt(index), true);
  }

  let passwordHash = sha512(concat(salt, passwordBytes), hash);
  for (let iteration = 0; iteration < spinCount; iteration++) {
    passwordHash = sha512(concat(uint32LE(iteration), passwordHash), hash);
  }
  const keyFor = (blockKey: number[]) =>
    importAesKey(fitTo(sha512(concat(passwordHash, blockKey), hash), keyBytes));

  const verifierInput = await decryptAesCbc(
    await keyFor(BLOCK_KEYS.verifierInput),
    salt,
    passwordKey.encryptedVerifierHashInput
  );
  const verifierHash = await decryptAesCbc(
    await keyFor(BLOCK_KEYS.verifierHash),
    salt,
    passwordKey.encryptedVerifierHashValue
  );
  const expected = sha512(verifierInput.subarray(0, salt.length), hash);
  const matches = expected.every((byte, index) => byte === verifierHash[index]);
  if (!matches || expected.length !== hashBytes) return null;

  const secretKey = await decryptAesCbc(
    await keyFor(BLOCK_KEYS.secretKey),
    salt,
    passwordKey.encryptedKeyValue
  );
  return secretKey.slice(0, keyBytes);
}

async function decryptPackage(
  encryptedPackage: Uint8Array,
  keyData: CipherParams,
  secretKey: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const view = new DataView(
    encryptedPackage.buffer,
    encryptedPackage.byteOffset,
    encryptedPackage.byteLength
  );
  const packageBytes = view.getUint32(0, true) + view.getUint32(4, true) * 2 ** 32;
  const key = await importAesKey(secretKey);
  const segments: Promise<Uint8Array<ArrayBuffer>>[] = [];
  for (let offset = 8; offset < encryptedPackage.length; offset += SEGMENT_BYTES) {
    const index = (offset - 8) / SEGMENT_BYTES;
    const iv = fitTo(sha512(concat(keyData.salt, uint32LE(index)), keyData.hash), AES_BLOCK_BYTES);
    segments.push(decryptAesCbc(key, iv, encryptedPackage.slice(offset, offset + SEGMENT_BYTES)));
  }
  return concat(...(await Promise.all(segments))).slice(0, packageBytes);
}

const COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** The decrypted package (for a workbook, the .xlsx zip). */
export async function decryptOfficeFile(
  data: ArrayBuffer,
  password: string
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(data);
  if (!COMPOUND_FILE_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new StatementParseError("unrecognised-layout");
  }
  let container: CFB.CFB$Container;
  try {
    container = CFB.read(bytes, { type: "array" });
  } catch {
    throw new StatementParseError("unrecognised-layout");
  }
  const info = CFB.find(container, "EncryptionInfo")?.content;
  const encryptedPackage = CFB.find(container, "EncryptedPackage")?.content;
  if (!info || !encryptedPackage) throw new StatementParseError("unrecognised-layout");
  if (password === "") throw new StatementParseError("password-required");

  const { keyData, passwordKey } = readEncryptionInfo(Uint8Array.from(info));
  const secretKey = await unlockSecretKey(passwordKey, password);
  if (!secretKey) throw new StatementParseError("wrong-password");
  return decryptPackage(Uint8Array.from(encryptedPackage), keyData, secretKey);
}
