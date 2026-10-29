export const SESSION_COOKIE = "__Host-applywise_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const textEncoder = new TextEncoder();

export async function verifyCredentials(username, password, expectedUsername, expectedPassword) {
  const [usernameMatches, passwordMatches] = await Promise.all([
    constantTimeStringEqual(username, expectedUsername),
    constantTimeStringEqual(password, expectedPassword),
  ]);
  return usernameMatches && passwordMatches;
}

export async function createSessionToken(username, password, secret, now = Date.now()) {
  const payload = encodeBase64Url(JSON.stringify({
    sub: username,
    ver: encodeBase64Url(await sign(`${username}\0${password}`, secret)),
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
  }));
  const signature = await sign(payload, secret);
  return `${payload}.${encodeBase64Url(signature)}`;
}

export async function verifySessionToken(
  token,
  secret,
  expectedUsername,
  expectedPassword,
  now = Date.now(),
) {
  if (typeof token !== "string" || token.length > 2048) return false;

  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra !== undefined) return false;

  try {
    const signature = decodeBase64Url(encodedSignature);
    const key = await importSigningKey(secret);
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      textEncoder.encode(payload),
    );
    if (!validSignature) return false;

    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    const expectedVersion = encodeBase64Url(
      await sign(`${expectedUsername}\0${expectedPassword}`, secret),
    );
    return (
      claims?.sub === expectedUsername &&
      claims?.ver === expectedVersion &&
      Number.isInteger(claims.exp) &&
      claims.exp > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export function isValidAuthConfiguration(username, password, secret) {
  return (
    typeof username === "string" &&
    username.length >= 3 &&
    username.length <= 128 &&
    typeof password === "string" &&
    password.length >= 14 &&
    password.length <= 256 &&
    typeof secret === "string" &&
    secret.length >= 32
  );
}

async function constantTimeStringEqual(candidate, expected) {
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected)),
  ]);
  const candidateBytes = new Uint8Array(candidateHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < candidateBytes.length; index += 1) {
    difference |= candidateBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

async function sign(payload, secret) {
  const key = await importSigningKey(secret);
  return crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
}

function importSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value.");
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
