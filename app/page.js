"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { parseJobPost } from "@/lib/job-post";

const PROFILE_KEY = "job-assistant-profile-v1";
const PROFILE_UPDATED_EVENT = "applywise-profile-updated";
const EMPTY_PROFILE = { name: "", email: "", highlights: "" };
const GMAIL_MESSAGES = {
  connected: "Gmail connected. Review your draft before sending.",
  cancelled: "Gmail connection was cancelled.",
  "wrong-account": "Connect the expected Google account: kushc225@gmail.com.",
  "wrong-account-revoke-failed": "Wrong account selected. Revoke Applywise access in Google Account security, then reconnect with kushc225@gmail.com.",
  error: "Gmail could not be connected. Check the setup and try again.",
};

function subscribeToProfile(onChange) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PROFILE_UPDATED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PROFILE_UPDATED_EVENT, onChange);
  };
}

function getStoredProfile() {
  try {
    return window.localStorage.getItem(PROFILE_KEY) || "{}";
  } catch {
    return "{}";
  }
}

function getServerProfile() {
  return "{}";
}

function subscribeToLocation(onChange) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getLocationSearch() {
  return window.location.search;
}

function getServerLocationSearch() {
  return "";
}

export default function Home() {
  const router = useRouter();
  const [jobPost, setJobPost] = useState("");
  const savedProfile = useSyncExternalStore(
    subscribeToProfile,
    getStoredProfile,
    getServerProfile,
  );
  const locationSearch = useSyncExternalStore(
    subscribeToLocation,
    getLocationSearch,
    getServerLocationSearch,
  );
  const gmailResult = new URLSearchParams(locationSearch).get("gmail");
  const gmailNotice = GMAIL_MESSAGES[gmailResult];
  const profile = useMemo(() => {
    try {
      return { ...EMPTY_PROFILE, ...JSON.parse(savedProfile) };
    } catch {
      return EMPTY_PROFILE;
    }
  }, [savedProfile]);
  const [recipient, setRecipient] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [subjectOverride, setSubjectOverride] = useState("");
  const [status, setStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/gmail/status", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not check Gmail status.");
        if (active) {
          setGmailConfigured(result.configured);
          setGmailConnected(result.connected);
        }
      })
      .catch((error) => {
        if (active) setStatus(error.message);
      });

    return () => {
      active = false;
    };
  }, []);

  const job = useMemo(() => parseJobPost(jobPost), [jobPost]);
  const suggestedSubject = job.role
    ? `Application for ${job.role}${job.company ? ` at ${job.company}` : ""}`
    : "Job application";
  const subject = subjectOverride || suggestedSubject;

  function updateProfile(field, value) {
    const updatedProfile = { ...profile, [field]: value };
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(updatedProfile));
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      setStatus("");
    } catch {
      setStatus("Your profile could not be saved in this browser.");
    }
  }

  function handleJobPostChange(value) {
    setJobPost(value);
    const parsed = parseJobPost(value);
    setRecipient(parsed.email);
    setEmailBody("");
    setSubjectOverride("");
    setStatus("");
  }

  async function generateEmail(event) {
    event.preventDefault();
    setStatus("");

    if (!jobPost.trim()) {
      setStatus("Paste the full job post first.");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription: jobPost,
          role: job.role,
          company: job.company,
          profileHighlights: profile.highlights,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not generate the email.");
      }

      setEmailBody(result.body);
      setStatus(
        result.usedFallback
          ? "Gemini’s primary model was busy, so the draft was generated with a fallback model. Review and edit it before using it."
          : "Draft generated. Review and edit it before using it.",
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyDraft() {
    const signature = [profile.name, profile.email].filter(Boolean).join("\n");
    const signoff = signature ? `\n\nBest,\n${signature}` : "";
    const fullDraft = `To: ${recipient || "add recipient"}\nSubject: ${subject}\n\n${emailBody}${signoff}`;
    try {
      await navigator.clipboard.writeText(fullDraft);
      setStatus("Draft copied. Paste it into Gmail and attach your resume.");
    } catch {
      setStatus("Could not access the clipboard. Select and copy the draft manually.");
    }
  }

  async function sendEmail() {
    if (!recipient || !subject.trim() || !emailBody.trim()) {
      setStatus("Add an application email and check the subject and message first.");
      return;
    }
    if (!window.confirm(
      `Send this email from kushc225@gmail.com to ${recipient}?\n\nSubject: ${subject}`,
    )) {
      return;
    }

    setIsSending(true);
    setStatus("");
    const signature = [profile.name, profile.email].filter(Boolean).join("\n");
    const signoff = signature ? `\n\nBest,\n${signature}` : "";
    try {
      const response = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipient, subject, body: `${emailBody}${signoff}` }),
      });
      const result = await response.json();
      if (response.status === 401) setGmailConnected(false);
      if (!response.ok) throw new Error(result.error || "Could not send the email.");
      setStatus("Email sent. Check your Gmail Sent folder.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSending(false);
    }
  }

  async function disconnectGmail() {
    if (!window.confirm("Disconnect Gmail and revoke this app’s Gmail access?")) return;
    setIsDisconnecting(true);
    try {
      const response = await fetch("/api/gmail/disconnect", {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not disconnect Gmail.");
      setGmailConnected(false);
      setStatus("Gmail disconnected and access revoked.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleSignOut() {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!response.ok) {
      setStatus("Could not sign out. Please try again.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Applywise home">
          <span className="brand-mark">a</span>
          <span>applywise</span>
        </Link>
        <button
          className="private-badge signout-button"
          onClick={handleSignOut}
          type="button"
        >
          <span className="status-dot" />
          Sign out
        </button>
      </header>

      <section className="intro">
        <div className="eyebrow"><span /> YOUR JOB SEARCH, LESS REPETITIVE</div>
        <h1>Make a thoughtful first impression.</h1>
        <p>
          Paste a LinkedIn post. Get a role-aware application email grounded in
          your real experience.
        </p>
      </section>

      <div className="workspace">
        <form className="panel job-panel" onSubmit={generateEmail}>
          <div className="panel-heading">
            <div className="step">01</div>
            <div>
              <h2>Job post</h2>
              <p>Paste the post as-is. We’ll pick out the useful details.</p>
            </div>
          </div>

          <label className="field-label" htmlFor="job-post">LINKEDIN POST</label>
          <textarea
            id="job-post"
            className="job-input"
            maxLength={20000}
            onChange={(event) => handleJobPostChange(event.target.value)}
            placeholder={"Paste the full job post here…\n\nExample: role, company, location, requirements, and application email."}
            required
            value={jobPost}
          />
          <div className="input-footer">
            <span>Contact details are detected in your browser.</span>
            <span>{jobPost.length.toLocaleString()} / 20,000</span>
          </div>

          {jobPost && (
            <div className="extracted-card" aria-live="polite">
              <div className="extracted-heading">
                <span className="check-mark">✓</span>
                <span>POST DETAILS</span>
                <span className="local-tag">LOCAL</span>
              </div>
              <div className="detail-grid">
                <Detail label="Role" value={job.role} />
                <Detail label="Company" value={job.company} />
                <Detail label="Location" value={job.location} />
                <Detail label="Experience" value={job.experience} />
                <div className="detail-item detail-wide">
                  <span className="detail-label">Apply email</span>
                  <input
                    aria-label="Application email"
                    className="inline-input"
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="Not found — enter it here"
                    type="email"
                    value={recipient}
                  />
                </div>
              </div>
              {!job.role && (
                <p className="helper-text">
                  Role not detected automatically. Include it in the post text
                  for a more relevant draft.
                </p>
              )}
            </div>
          )}

          <div className="profile-section">
            <div className="profile-heading">
              <div className="step step-muted">02</div>
              <div>
                <h2>Your experience</h2>
                <p>Set it once; it stays in this browser.</p>
              </div>
            </div>
            <div className="profile-grid">
              <label className="form-field">
                <span className="field-label">YOUR NAME <span className="local-tag">LOCAL</span></span>
                <input
                  autoComplete="name"
                  onChange={(event) => updateProfile("name", event.target.value)}
                  placeholder="Name for your sign-off"
                  value={profile.name}
                />
              </label>
              <label className="form-field">
                <span className="field-label">YOUR EMAIL <span className="local-tag">LOCAL</span></span>
                <input
                  autoComplete="email"
                  onChange={(event) => updateProfile("email", event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={profile.email}
                />
              </label>
              <label className="form-field profile-wide">
                <span className="field-label">
                  SKILLS & PROOF POINTS <span className="sent-tag">SENT TO GEMINI</span>
                </span>
                <textarea
                  className="highlights-input"
                  maxLength={4000}
                  onChange={(event) => updateProfile("highlights", event.target.value)}
                  placeholder="Add real skills, projects, and outcomes you want considered. Don’t include private or sensitive details."
                  value={profile.highlights}
                />
                <span className="helper-text">
                  Only this experience text—not your name, email, resume, or
                  application contact—is sent to Gemini with a redacted job post.
                  Names in pasted post text are not reliably removed; delete
                  personal or sensitive details before generating.
                </span>
              </label>
            </div>
          </div>

          <button className="generate-button" disabled={isGenerating} type="submit">
            {isGenerating ? (
              <>
                <span className="spinner" /> Writing your draft…
              </>
            ) : (
              <>
                Write my email <span aria-hidden="true">↗</span>
              </>
            )}
          </button>
          <p className="privacy-note">
            The Gemini free tier may use submitted content to improve Google
            products. Avoid sensitive information. You review every draft before
            sending.
          </p>
        </form>

        <section className="panel draft-panel" aria-live="polite">
          <div className="panel-heading draft-heading">
            <div className="step">03</div>
            <div>
              <h2>Your email draft</h2>
              <p>Nothing is sent automatically.</p>
            </div>
            <span className="draft-status">{emailBody ? "READY TO REVIEW" : "WAITING"}</span>
          </div>

          <div className="gmail-connection">
            <div>
              <span className="field-label">GMAIL SENDER</span>
              <p className="gmail-account">
                {gmailConnected ? "Connected: kushc225@gmail.com" : "Not connected"}
              </p>
            </div>
            {gmailConnected ? (
              <button
                className="disconnect-button"
                disabled={isDisconnecting}
                onClick={disconnectGmail}
                type="button"
              >
                {isDisconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : gmailConfigured ? (
              <a className="gmail-connect-button" href="/api/gmail/connect">
                Connect Gmail
              </a>
            ) : (
              <span className="gmail-setup-note">Gmail setup required</span>
            )}
          </div>

          {emailBody ? (
            <>
              <label className="field-label" htmlFor="email-subject">SUBJECT</label>
              <input
                className="subject-input"
                id="email-subject"
                onChange={(event) => setSubjectOverride(event.target.value)}
                value={subject}
              />
              <label className="field-label body-label" htmlFor="email-body">MESSAGE</label>
              <textarea
                className="email-output"
                id="email-body"
                onChange={(event) => setEmailBody(event.target.value)}
                value={emailBody}
              />
              {profile.name && <div className="signoff-preview">Best,<br />{profile.name}</div>}
              <button className="copy-button" onClick={copyDraft} type="button">
                Copy email for Gmail <span aria-hidden="true">↗</span>
              </button>
              <button
                className="send-button"
                disabled={!gmailConnected || isSending}
                onClick={sendEmail}
                type="button"
              >
                {isSending ? "Sending email…" : "Review and send from Gmail"}
              </button>
              <p className="manual-note">
                Sending requires your Gmail connection and your confirmation.
                Resume attachments are not included yet; attach your PDF manually
                when using Gmail.
              </p>
            </>
          ) : (
            <div className="empty-draft">
              <div className="envelope-art" aria-hidden="true">
                <span className="envelope-line" />
                <span className="envelope-flap" />
                <span className="sparkle sparkle-one">✦</span>
                <span className="sparkle sparkle-two">✧</span>
              </div>
              <h3>A better application starts here.</h3>
              <p>
                Your role-specific message will appear here. It’ll use only the
                experience you provide—never invented credentials.
              </p>
              <div className="empty-hint"><span>✦</span> Human-reviewed, always</div>
            </div>
          )}

          {status && (
            <p className="status-message" role="status">{status}</p>
          )}
          {!status && gmailNotice && (
            <p className="status-message" role="status">{gmailNotice}</p>
          )}
        </section>
      </div>

      <footer className="app-footer">
        <span>Built for a more personal job search.</span>
        <span>Private by design <span className="footer-dot">·</span> Send only after you review</span>
      </footer>
    </main>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className={value ? "detail-value" : "detail-empty"}>
        {value || "Not detected"}
      </span>
    </div>
  );
}
