import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  isValidAuthConfiguration,
  SESSION_MAX_AGE_SECONDS,
  verifyCredentials,
  verifySessionToken,
} from "./session.js";

const fixedNow = Date.UTC(2026, 9, 29);
const username = "private-user";
const password = "a-long-test-password";
const secret = "local-test-signing-secret-that-is-long-enough";

test("accepts only matching credentials", async () => {
  assert.equal(await verifyCredentials(username, password, username, password), true);
  assert.equal(await verifyCredentials(username, "wrong-password", username, password), false);
  assert.equal(await verifyCredentials("other-user", password, username, password), false);
});

test("signs a session for the configured username and expiry", async () => {
  const token = await createSessionToken(username, password, secret, fixedNow);

  assert.equal(await verifySessionToken(token, secret, username, password, fixedNow), true);
  assert.equal(await verifySessionToken(token, secret, "other-user", password, fixedNow), false);
  assert.equal(await verifySessionToken(token, secret, username, "another-password", fixedNow), false);
  assert.equal(await verifySessionToken(token, "another-signing-secret", username, password, fixedNow), false);
  assert.equal(
    await verifySessionToken(
      token,
      secret,
      username,
      password,
      fixedNow + SESSION_MAX_AGE_SECONDS * 1000,
    ),
    false,
  );
});

test("rejects malformed or tampered session tokens", async () => {
  const token = await createSessionToken(username, password, secret, fixedNow);
  const [payload, signature] = token.split(".");
  const tampered = `${payload.slice(0, -1)}A.${signature}`;

  assert.equal(await verifySessionToken("not-a-token", secret, username, password, fixedNow), false);
  assert.equal(await verifySessionToken(tampered, secret, username, password, fixedNow), false);
});

test("requires strong configured credentials and signing key", () => {
  assert.equal(isValidAuthConfiguration(username, password, secret), true);
  assert.equal(isValidAuthConfiguration("ab", password, secret), false);
  assert.equal(isValidAuthConfiguration(username, "short", secret), false);
  assert.equal(isValidAuthConfiguration(username, password, "short"), false);
});
