import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import contractRaw from "./bookingKeyContract.json?raw";
import {
  BOOKING_KEY_LABEL, BookingKeyError, KEY_ALGORITHM, MAX_PLAINTEXT_BYTES, encryptCredentials, keyIdOf,
} from "./accountCrypto";
import { PINNED_BOOKING_KEY_ID } from "./bookingKey";
import type { BookingKeyDto } from "../../api";

// 测试钥现生成、不落盘；邮箱与密码是拼出来的假值（.invalid 域名），公开仓库里不放任何真实值。
const contract = JSON.parse(contractRaw) as {
  algorithm: string; label: string; maxPlaintextBytes: number; modulusLength: number;
  sample: { spki: string; keyId: string };
};
const EMAIL = "tester@example.invalid";
const PASSWORD = ["pw", "-", "fake", "-", "1"].join("");

let keyPair: CryptoKeyPair;
let testKey: BookingKeyDto;

const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: contract.modulusLength, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;
  const spki = bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey)));
  testKey = { keyId: await keyIdOf(spki), algorithm: KEY_ALGORITHM, spki };
}, 30000);

afterEach(() => vi.restoreAllMocks());

describe("浏览器端加密订场账号", () => {
  it("加密后用测试私钥解密，得到恰为 {v:1,email,password} 的 JSON", async () => {
    const { keyId, ciphertext } = await encryptCredentials(testKey, `  ${EMAIL} `, PASSWORD, testKey.keyId);
    expect(keyId).toBe(testKey.keyId);
    const plain = await crypto.subtle.decrypt(
      { name: "RSA-OAEP", label: new TextEncoder().encode(BOOKING_KEY_LABEL) },
      keyPair.privateKey,
      base64ToBytes(ciphertext),
    );
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ v: 1, email: EMAIL, password: PASSWORD });
  });

  it("参数与 scraper 的契约文件一致，样例公钥算出的 keyId 与契约相同", async () => {
    expect(BOOKING_KEY_LABEL).toBe(contract.label);
    expect(MAX_PLAINTEXT_BYTES).toBe(contract.maxPlaintextBytes);
    expect(KEY_ALGORITHM).toBe(contract.algorithm);
    expect(await keyIdOf(contract.sample.spki)).toBe(contract.sample.keyId);
  });

  it("本地拒绝的几种情况各有 code，并且一次都没调用 encrypt", async () => {
    const encrypt = vi.spyOn(crypto.subtle, "encrypt");
    const code = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        return error instanceof BookingKeyError ? error.code : "OTHER";
      }
      return "NO_ERROR";
    };
    expect(await code(() => encryptCredentials(testKey, EMAIL, PASSWORD, ""))).toBe("KEY_NOT_PINNED");
    expect(await code(() => encryptCredentials({ ...testKey, keyId: "0000000000000000" }, EMAIL, PASSWORD, testKey.keyId)))
      .toBe("KEY_ID_MISMATCH");
    // 回包里的 keyId 说对了，但 spki 是另一把钥匙（后端换公钥）：按 spki 算出的指纹对不上
    expect(await code(() => encryptCredentials({ ...testKey, spki: contract.sample.spki }, EMAIL, PASSWORD, testKey.keyId)))
      .toBe("KEY_ID_MISMATCH");
    expect(await code(() => encryptCredentials({ ...testKey, spki: "!!不是base64!!" }, EMAIL, PASSWORD, testKey.keyId)))
      .toBe("KEY_ID_MISMATCH");
    expect(await code(() => encryptCredentials({ ...testKey, algorithm: "RSA-OAEP" }, EMAIL, PASSWORD, testKey.keyId)))
      .toBe("ALGORITHM_MISMATCH");
    expect(await code(() => encryptCredentials(testKey, EMAIL, "x".repeat(MAX_PLAINTEXT_BYTES), testKey.keyId)))
      .toBe("TOO_LONG");
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("超长按 UTF-8 字节数算，不是字符数", async () => {
    // 100 个汉字 = 300 字节，加上 JSON 外壳必然超过上限，但字符数只有 100
    const password = "密".repeat(100);
    await expect(encryptCredentials(testKey, EMAIL, password, testKey.keyId)).rejects.toMatchObject({ code: "TOO_LONG" });
  });

  it("两次加密同一明文得到不同密文（OAEP 随机）", async () => {
    const first = await encryptCredentials(testKey, EMAIL, PASSWORD, testKey.keyId);
    const second = await encryptCredentials(testKey, EMAIL, PASSWORD, testKey.keyId);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("写死的生产 keyId 是 16 位小写十六进制", () => {
    expect(PINNED_BOOKING_KEY_ID).toMatch(/^[0-9a-f]{16}$/);
  });
});
