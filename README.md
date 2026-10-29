# Applywise

A private, single-user Next.js app that reads a pasted job post, extracts common
details in the browser, and asks Gemini to draft a truthful, role-aware email.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `AUTH_LOCAL_DEV_BYPASS=true` in `.env.local` for local development only.
   Never set it on a deployment.
3. Set `GEMINI_API_KEY` to a Gemini API key. Keep it private; do not use a
   `NEXT_PUBLIC_` prefix or commit `.env.local`.
4. Run `npm run dev` and open <http://localhost:3000>. The explicit bypass
   skips login only on the local development server; do not use it to test
   deployed access.

The local bypass only works in development. Production requests fail closed
unless the username, password, and session-signing secret are configured.

## Cloudflare Workers deployment

This app uses the OpenNext Cloudflare adapter and the Workers Free plan. No
custom domain is needed for the `workers.dev` address. Cloudflare plan limits
apply; monitor your usage and the Worker size/CPU limits.

1. Sign in to Cloudflare and enable a `workers.dev` subdomain in the Workers &
   Pages dashboard if you have not already.
2. Install dependencies with `npm ci`, then run `npx wrangler login`.
3. Set the Worker secrets from the app directory. Wrangler prompts for each
   value. Do not paste secrets into source files, commits, chat, or `wrangler`
   config:

   ```sh
   npx wrangler secret put APP_USERNAME
   npx wrangler secret put APP_PASSWORD
   npx wrangler secret put AUTH_SECRET
   npx wrangler secret put GEMINI_API_KEY
   ```

   Use a username of 3-128 characters, a unique password of at least 14
   characters, and a session-signing secret of at least 32 characters. Generate
   the signing secret locally with `openssl rand -base64 32`.
4. Deploy with `npm run deploy`.
5. Open the Worker URL shown by Wrangler and sign in.

Authentication is handled by the app; no Google OAuth is required. Cloudflare
stores the credentials as Worker secrets. Login issues an eight-hour,
HMAC-signed `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Only the username
and password are checked; they are not returned to the browser or stored in
browser storage. Changing either credential or `AUTH_SECRET` invalidates
existing sessions.

The Worker config limits login attempts to 5 per minute per IP and email draft
generation to 20 per minute per IP. Cloudflare's Rate Limiting API is
approximate and enforced per Cloudflare location, so it is a useful safeguard
but not a globally strict lockout. Do not reuse this password on another
service. Cloudflare may require a plan upgrade if usage exceeds Free-plan
limits; do not enable paid billing if zero cost is a hard requirement.

## GitHub deployment

The repository is at <https://github.com/kushc225/job-application-assistant>.
You can deploy from the terminal with Wrangler, or configure Cloudflare Workers
Builds to use `npm run deploy` on `main`. Add credentials only through
Cloudflare Worker secrets, never as GitHub source files or repository
variables.

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
- Does not send email or attach a resume automatically yet. Gmail draft creation
  and resume attachment still require a separate integration.

## Validation

```bash
npm run lint
npm test
npm run build
npm run preview
```
