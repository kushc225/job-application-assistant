const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const GMAIL_STATE_COOKIE = "__Host-applywise_gmail_oauth_state";
export const GMAIL_STATE_MAX_AGE_SECONDS = 5 * 60;
export const GMAIL_TOKEN_KEY = "gmail:refresh-token:v1";
export const GMAIL_ALLOWED_SENDER = "kushc225@gmail.com";
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
];

export function isGmailConfigurationValid(config) {
  return (
    typeof config?.clientId === "string" &&
    config.clientId.length > 0 &&
    typeof config?.clientSecret === "string" &&
    config.clientSecret.length > 0 &&
    typeof config?.tokenEncryptionKey === "string" &&
    config.tokenEncryptionKey.length >= 32
  );
}

export function createOAuthState(secret, now = Date.now()) {
  const randomState = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeVerifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = Math.floor(now / 1000) + GMAIL_STATE_MAX_AGE_SECONDS;
  const payload = `${randomState}.${expiresAt}.${codeVerifier}`;
  return sign(payload, secret).then((signature) => ({
    state: randomState,
    codeVerifier,
    cookieValue: `${payload}.${encodeBase64Url(signature)}`,
  }));
}

export async function verifyOAuthState(cookieValue, returnedState, secret, now = Date.now()) {
  if (
    typeof cookieValue !== "string" ||
    typeof returnedState !== "string" ||
    cookieValue.length > 512
  ) {
    return false;
  }

  const [randomState, expiresAtText, codeVerifier, signatureText, extra] =
    cookieValue.split(".");
  if (!randomState || !expiresAtText || !codeVerifier || !signatureText || extra !== undefined) {
    return null;
  }
  if (randomState !== returnedState) return null;

  const expiresAt = Number(expiresAtText);
  if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return null;

  try {
    const verified = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(secret),
      decodeBase64Url(signatureText),
      textEncoder.encode(`${randomState}.${expiresAtText}.${codeVerifier}`),
    );
    return verified ? codeVerifier : null;
  } catch {
    return null;
  }
}

export async function encryptRefreshToken(refreshToken, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importAesKey(secret),
    textEncoder.encode(refreshToken),
  );
  return `${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}

export async function decryptRefreshToken(encryptedToken, secret) {
  if (typeof encryptedToken !== "string" || encryptedToken.length > 4096) {
    throw new Error("Stored Gmail token is invalid.");
  }

  const [ivText, ciphertextText, extra] = encryptedToken.split(".");
  if (!ivText || !ciphertextText || extra !== undefined) {
    throw new Error("Stored Gmail token is invalid.");
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivText) },
    await importAesKey(secret),
    decodeBase64Url(ciphertextText),
  );
  return textDecoder.decode(plaintext);
}

export function getGmailConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    tokenEncryptionKey: process.env.GMAIL_TOKEN_ENCRYPTION_KEY,
  };
}

export function getGmailRedirectUri(request) {
  return new URL("/api/gmail/callback", request.url).toString();
}

export async function createGmailAuthorizationUrl(request, state, codeVerifier, clientId) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGmailRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("login_hint", GMAIL_ALLOWED_SENDER);
  url.searchParams.set(
    "code_challenge",
    encodeBase64Url(await crypto.subtle.digest("SHA-256", textEncoder.encode(codeVerifier))),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeAuthorizationCode(code, request, config, codeVerifier) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: getGmailRedirectUri(request),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Google could not complete Gmail authorization.");
  }
  return result;
}

export async function verifyGoogleSender(idToken, clientId) {
  if (typeof idToken !== "string" || !idToken) return false;

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!response.ok) throw new Error("Google identity verification failed.");
  const claims = await response.json();

  return (
    claims.aud === clientId &&
    claims.email?.toLowerCase() === GMAIL_ALLOWED_SENDER &&
    (claims.email_verified === true || claims.email_verified === "true")
  );
}

export async function refreshGmailAccessToken(refreshToken, config) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    return { error: result.error === "invalid_grant" ? "reauthorize" : "unavailable" };
  }
  return { accessToken: result.access_token };
}

export function createRawEmail({ to, subject, body }) {
  const encodedSubject = encodeBase64Url(textEncoder.encode(subject));
  const normalizedBody = body.replace(/\r\n|\r|\n/g, "\r\n");
  const message = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizedBody,
  ].join("\r\n");
  return encodeBase64Url(textEncoder.encode(message));
}

export function isValidEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
      email,
    )
  );
}

async function sign(payload, secret) {
  return crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    textEncoder.encode(payload),
  );
}

function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function importAesKey(secret) {
  const keyMaterial = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["encrypt", "decrypt"]);
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
