# Monetra — Live Deployment & Cloud Integration Guide

Monetra runs immediately via **AI Studio App Sharing** (`Shared App URL`) and is pre-configured (`netlify.toml` + `netlify/functions/api.ts`) for **Netlify** deployment.

## Option A: Go Live Immediately via Google AI Studio
1. Ensure `GEMINI_API_KEY` is set in **Settings > Secrets**.
2. Click **Share / Deploy** in the AI Studio toolbar to publish the live Shared App URL.

## Option B: Deploy Live on Netlify (with Clerk + Supabase)
Because Netlify Functions are stateless, configure **Supabase PostgreSQL** and **Clerk** so user accounts and financial records persist across all sessions:

### 1. Provision Supabase & Clerk
1. Create a Supabase project and run `supabase/migrations/001_initial_schema.sql` in the **Supabase SQL Editor**.
2. In **Clerk Dashboard**, enable the **Supabase Integration** so JWTs include `"role": "authenticated"` and `sub`.
3. In **Supabase Dashboard > Authentication > Providers > Third-Party Auth**, add **Clerk** with your Clerk Domain.

### 2. Deploy to Netlify
1. Export or push this repository to GitHub/GitLab, then click **Add new site > Import an existing project** in Netlify.
2. Netlify reads `netlify.toml` automatically:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions` (routes `/api/*` to `/.netlify/functions/api/:splat`)
3. In **Netlify > Site configuration > Environment variables**, add:
   - `GEMINI_API_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Optional: `SESSION_SECRET` (if running Preview Auth without Clerk), `MONO_SECRET_KEY`, `MONO_WEBHOOK_SECRET`
4. Click **Deploy site** to publish your live `.netlify.app` URL.
