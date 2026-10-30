import assert from "node:assert/strict";
import test from "node:test";
import {
  createOAuthState,
  createGmailAuthorizationUrl,
  createRawEmail,
  decryptRefreshToken,
  encryptRefreshToken,
  GMAIL_STATE_MAX_AGE_SECONDS,
  isGmailConfigurationValid,
  isValidEmail,
  verifyOAuthState,
} from "./gmail.js";

const fixedNow = Date.UTC(2026, 9, 29);
const secret = "local-test-encryption-secret-that-is-long-enough";

test("validates Gmail client configuration and encryption-key length", () => {
  const config = {
    clientId: "client-id",
    clientSecret: "client-secret",
    tokenEncryptionKey: secret,
  };
  assert.equal(isGmailConfigurationValid(config), true);
  assert.equal(isGmailConfigurationValid({ ...config, tokenEncryptionKey: "short" }), false);
  assert.equal(isGmailConfigurationValid({ ...config, clientId: "" }), false);
});

test("signs short-lived OAuth state and rejects tampering or expiry", async () => {
  const { state, cookieValue } = await createOAuthState(secret, fixedNow);

  assert.equal(typeof await verifyOAuthState(cookieValue, state, secret, fixedNow), "string");
  assert.equal(await verifyOAuthState(cookieValue, "different-state", secret, fixedNow), null);
  assert.equal(await verifyOAuthState(cookieValue, state, "different-secret", fixedNow), null);
  assert.equal(
    await verifyOAuthState(
      cookieValue,
      state,
      secret,
      fixedNow + GMAIL_STATE_MAX_AGE_SECONDS * 1000,
    ),
    null,
  );
  assert.equal(await verifyOAuthState("malformed", state, secret, fixedNow), null);
});

test("requests only Gmail send access with PKCE and the fixed callback URL", async () => {
  const authorizationUrl = await createGmailAuthorizationUrl(
    new Request("https://app.example.test/"),
    "oauth-state",
    "code-verifier",
    "google-client-id",
  );
  assert.equal(authorizationUrl.searchParams.get("client_id"), "google-client-id");
  assert.equal(
    authorizationUrl.searchParams.get("redirect_uri"),
    "https://app.example.test/api/gmail/callback",
  );
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizationUrl.searchParams.get("access_type"), "offline");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.match(authorizationUrl.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]+$/);
  assert.match(
    authorizationUrl.searchParams.get("scope"),
    /https:\/\/www\.googleapis\.com\/auth\/gmail\.send/,
  );
  assert.doesNotMatch(
    authorizationUrl.searchParams.get("scope"),
    /gmail\.(readonly|modify|readwrite)/,
  );
});

test("encrypts refresh tokens and detects modification", async () => {
  const encrypted = await encryptRefreshToken("google-refresh-token", secret);
  assert.equal(await decryptRefreshToken(encrypted, secret), "google-refresh-token");
  await assert.rejects(() => decryptRefreshToken(encrypted, "another-secret-value"));
  const [iv, ciphertext] = encrypted.split(".");
  const replacement = ciphertext.endsWith("A") ? "B" : "A";
  const tampered = `${iv}.${ciphertext.slice(0, -1)}${replacement}`;
  await assert.rejects(() => decryptRefreshToken(tampered, secret));
});

test("builds safe UTF-8 Gmail MIME messages", () => {
  const raw = createRawEmail({
    to: "jobs@example.com",
    subject: "MERN role — application",
    body: "Hello,\n\nI’m interested.",
  });
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  assert.equal(isValidEmail("jobs@example.com"), true);
  assert.equal(isValidEmail("jobs@example.com\r\nBcc: other@example.com"), false);
  assert.equal(isValidEmail("not-an-email"), false);
});

test("builds a multipart Gmail message with a PDF attachment", () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
  const raw = createRawEmail({
    to: "jobs@example.com",
    subject: "Application — MERN Engineer",
    body: "Hello,\n\nPlease find my resume attached.",
    attachment: {
      filename: "Kush_Resume_2026.pdf",
      contentType: "application/pdf",
      data: pdfBytes,
    },
  });
  const decoded = atob(raw.replaceAll("-", "+").replaceAll("_", "/"));

  assert.match(decoded, /Content-Type: multipart\/mixed; boundary="applywise-/);
  assert.match(decoded, /Content-Type: application\/pdf; name="Kush_Resume_2026\.pdf"/);
  assert.match(decoded, /Content-Disposition: attachment; filename="Kush_Resume_2026\.pdf"/);
  assert.match(decoded, /JVBERgD\//);
  assert.match(decoded, /Please find my resume attached\./);
});
