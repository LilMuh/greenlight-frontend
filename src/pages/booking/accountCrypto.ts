// 浏览器端加密订场账号的密码（D-05）：明文只在这个模块与 WebCrypto 之间出现，
// 后端只会收到 {keyId, loginEmail, ciphertext}，永远看不到密码。
// 加密参数与 scraper/src/auth/accountVault.ts 必须一致，由 bookingKeyContract.json（scraper 契约文件的逐字副本）守着。
import type { BookingKeyDto } from "../../api";
import { PINNED_BOOKING_KEY_ID } from "./bookingKey";

export const BOOKING_KEY_LABEL = "greenlight-booking-v1";
/** RSA-3072 + OAEP/SHA-256 的明文上限是 318 字节；留余量取 300。邮箱 + 密码远小于此，所以不做混合加密。 */
export const MAX_PLAINTEXT_BYTES = 300;
export const KEY_ALGORITHM = "RSA-OAEP-256";

export type BookingKeyErrorCode = "KEY_NOT_PINNED" | "KEY_ID_MISMATCH" | "ALGORITHM_MISMATCH" | "TOO_LONG";

/** 加密前的本地拒绝：没有发出任何请求，也没有调用 WebCrypto 的 encrypt。message 不含任何明文。 */
export class BookingKeyError extends Error {
  readonly code: BookingKeyErrorCode;

  constructor(code: BookingKeyErrorCode) {
    super(code);
    this.name = "BookingKeyError";
    this.code = code;
  }
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * 公钥指纹：先把标准 base64 的 SPKI 解码成 DER 字节，再对字节取 SHA-256，前 16 位小写十六进制。
 * 注意不能对 base64 字符串本身取哈希，那样得到的是另一个值；与 scraper 的 keyIdOf（对 DER 取哈希）一致。
 */
export async function keyIdOf(spkiBase64: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", fromBase64(spkiBase64));
  return toHex(new Uint8Array(digest)).slice(0, 16);
}

/**
 * 用 scraper 公钥加密 {v:1,email,password}（D-05）。
 * 先全部校验再碰 WebCrypto：pinnedKeyId 为空、算法不对、keyId 或按 spki 算出的指纹与 pinnedKeyId 不符（D-15）、
 * 明文超过上限，都抛 BookingKeyError，不加密。
 * 不返回、不保留明文；不打印任何东西。
 */
export async function encryptCredentials(
  key: BookingKeyDto,
  email: string,
  password: string,
  pinnedKeyId: string = PINNED_BOOKING_KEY_ID,
): Promise<{ keyId: string; ciphertext: string }> {
  if (!pinnedKeyId) throw new BookingKeyError("KEY_NOT_PINNED");
  if (key.algorithm !== KEY_ALGORITHM) throw new BookingKeyError("ALGORITHM_MISMATCH");
  if (key.keyId !== pinnedKeyId) throw new BookingKeyError("KEY_ID_MISMATCH");
  let computed: string;
  try {
    computed = await keyIdOf(key.spki);
  } catch {
    // spki 不是合法 base64：当作指纹对不上，不暴露细节
    throw new BookingKeyError("KEY_ID_MISMATCH");
  }
  if (computed !== pinnedKeyId) throw new BookingKeyError("KEY_ID_MISMATCH");

  const plaintext = new TextEncoder().encode(JSON.stringify({ v: 1, email: email.trim(), password }));
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new BookingKeyError("TOO_LONG");

  const publicKey = await crypto.subtle.importKey(
    "spki",
    fromBase64(key.spki),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP", label: new TextEncoder().encode(BOOKING_KEY_LABEL) },
    publicKey,
    plaintext,
  );
  return { keyId: pinnedKeyId, ciphertext: toBase64(new Uint8Array(encrypted)) };
}
