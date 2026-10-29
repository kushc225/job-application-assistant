import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedGoogleProfile } from "./auth-policy.js";

test("allows only verified profiles matching the configured email", () => {
  assert.equal(
    isAllowedGoogleProfile(
      { email: "owner@example.com", email_verified: true },
      "owner@example.com",
    ),
    true,
  );
  assert.equal(
    isAllowedGoogleProfile(
      { email: "someone-else@example.com", email_verified: true },
      "owner@example.com",
    ),
    false,
  );
  assert.equal(
    isAllowedGoogleProfile(
      { email: "owner@example.com", email_verified: false },
      "owner@example.com",
    ),
    false,
  );
  assert.equal(
    isAllowedGoogleProfile(
      { email: "owner@example.com", email_verified: "true" },
      "owner@example.com",
    ),
    false,
  );
});
