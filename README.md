# Applywise

A private, single-user Next.js app that reads a pasted job post, extracts common
details in the browser, and asks Gemini to draft a truthful, role-aware email.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `AUTH_LOCAL_DEV_BYPASS=true` in `.env.local` for local development only.
   Never set it on a deployment.
3. Set `GEMINI_API_KEY` to a Gemini API key. Keep it private; do not use a
   `NEXT_PUBLIC_` prefix or commit `.env.local`.
4. Run `npm run dev` and open <http://localhost:3000>.

The local bypass only works in development. Production requests fail closed
unless Google OAuth and the allowed account are configured.

## Cloudflare Workers deployment

This app uses the OpenNext Cloudflare adapter and the Workers Free plan. No
custom domain is needed for the `workers.dev` address. Cloudflare plan limits
apply; monitor your usage and the Worker size/CPU limits.

1. Sign in to Cloudflare and enable a `workers.dev` subdomain in the Workers &
   Pages dashboard if you have not already.
2. Install dependencies with `npm ci`, then run `npx wrangler login`.
3. Make an initial deployment with `npm run deploy` to reserve the Worker URL.
   The application returns an unavailable response until its sign-in secrets
   are configured; do not share the URL yet.
4. Create a Google OAuth **Web application** client in Google Cloud Console.
   Add this authorized redirect URI, replacing the account subdomain with the
   one Cloudflare assigned:
   `https://job-application-assistant.<your-workers-subdomain>.workers.dev/api/auth/callback/google`
   If the OAuth consent screen is in Testing, add your account as a test user.
5. Set the Worker secrets from the app directory. Wrangler will prompt for each
   value; do not paste secrets into source files, commits, chat, or `wrangler`
   config:

   ```sh
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put NEXTAUTH_SECRET
   npx wrangler secret put APP_ALLOWED_EMAIL
   npx wrangler secret put GEMINI_API_KEY
   ```

   `APP_ALLOWED_EMAIL` must be the exact Google account allowed to sign in.
   Generate `NEXTAUTH_SECRET` locally with `openssl rand -base64 32`.
6. In the Worker’s Settings > Variables and Secrets, set `NEXTAUTH_URL` to its
   full `https://...workers.dev` URL. Keep `AUTH_LOCAL_DEV_BYPASS` unset.
7. Deploy again with `npm run deploy`. To test the Worker runtime locally first, run
   `npm run preview`.

The Google sign-in callback rejects unverified accounts and any email other
than `APP_ALLOWED_EMAIL`. The request proxy validates the signed session on
every protected page and API route. Leave `AUTH_LOCAL_DEV_BYPASS` unset in
Cloudflare. The generated `workers.dev` URL is public, but protected content
requires the configured Google account.

Cloudflare may require an account upgrade if the Worker exceeds the Free
plan’s CPU, bundle-size, or usage limits. Do not enable billing if keeping this
project at zero cost is a hard requirement.

## GitHub deployment

The repository is connected at <https://github.com/kushc225/job-application-assistant>.
You can use Wrangler locally as above, or configure Cloudflare Workers Builds
to deploy `main` using `npm run deploy`. Add credentials only through Cloudflare
Worker secrets/environment-variable settings, never as GitHub source files.

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
npm test
npm run build
npm run preview
```
