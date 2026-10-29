# Applywise

A private, single-user Next.js app that reads a pasted job post, extracts common
details in the browser, and asks Gemini to draft a truthful, role-aware email.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `CF_ACCESS_LOCAL_DEV_BYPASS=true` in `.env.local` for local development
   only. Never set it on a deployment.
3. Set `GEMINI_API_KEY` to a Gemini API key. Keep it private; do not use a
   `NEXT_PUBLIC_` prefix or commit `.env.local`.
4. Run `npm run dev` and open <http://localhost:3000>.

Without Cloudflare Access configuration, requests fail closed unless the
explicit local-only development bypass is enabled. In production the bypass
does not apply.

## Private production access

This app is intended to be protected by Cloudflare Access. Create an Access
application with a policy that allows only your account, then configure:

- `CF_ACCESS_TEAM_DOMAIN`: the Access team domain, such as
  `your-team.cloudflareaccess.com`
- `CF_ACCESS_AUD`: the application audience tag from the Access application
- `CF_ACCESS_ALLOWED_EMAIL`: your exact Google account email

The app verifies the Cloudflare Access JWT signature, issuer, audience, and
email server-side on every page and API request. Keep the Worker’s origin
unreachable except through Cloudflare and do not publish an unprotected preview
deployment. Configure these values as platform secrets/environment variables,
not in source control.

## Gemini and privacy

The Gemini API key is used only by the server route. The user’s name and email,
the detected application email, and the resume are not sent to Gemini. The job
post has email addresses, URLs, and phone numbers redacted before the model call;
the user-provided skills and proof points are sent as prompt context. The app
does not store job posts or generated emails on the server. Profile name, email,
and proof points are saved in the current browser’s local storage.

Google’s unpaid-service terms may allow submitted content to be used to improve
Google products. Do not put sensitive or confidential details in the proof
points. Names in the post are not reliably redacted, so remove names and other
personal or sensitive details before generating. Review generated content for
accuracy.

## Current scope

- Extracts common role, company, location, experience, and email fields from
  pasted job posts; fields remain editable.
- Generates an editable email body through Gemini using only supplied profile
  facts and a redacted job post.
- Copies the email draft to the clipboard.
- Does not send email or attach a resume automatically yet. Gmail OAuth and
  draft creation require separate Google OAuth credentials and will be added
  as a follow-up integration.

## Validation

```bash
npm run lint
npm run build
```
