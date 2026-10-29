"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark">a</span>
          <span>applywise</span>
        </div>
        <div className="eyebrow login-eyebrow"><span /> PRIVATE WORKSPACE</div>
        <h1>Welcome back.</h1>
        <p>Sign in with the Google account authorized for this private app.</p>
        <button
          className="google-button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          type="button"
        >
          <GoogleMark />
          Continue with Google
        </button>
        <p className="login-footnote">
          Access is restricted to the configured account. Other accounts will
          be denied.
        </p>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 48 48" width="18">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94a11.05 11.05 0 0 1-4.8 7.24l7.73 5.99c4.51-4.17 7.11-10.32 7.11-17.7Z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.75l-7.73-5.99c-2.14 1.44-4.89 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}
