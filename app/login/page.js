"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Could not sign in.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Sign-in is unavailable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark">a</span>
          <span>applywise</span>
        </div>
        <div className="eyebrow login-eyebrow"><span /> PRIVATE WORKSPACE</div>
        <h1>Welcome back.</h1>
        <p>Sign in with the private credentials configured for this workspace.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="field-label">USERNAME</span>
            <input
              autoComplete="username"
              maxLength={128}
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label className="form-field">
            <span className="field-label">PASSWORD</span>
            <input
              autoComplete="current-password"
              maxLength={256}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="google-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="login-footnote">
          Credentials are checked on the server and never saved in this browser.
        </p>
      </section>
    </main>
  );
}
