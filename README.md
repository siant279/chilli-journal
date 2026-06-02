# 🐺 Chilli's Adventure Journal

A Next.js app that pulls Chilli's Fi collar walks from Strava, enriches them with historical weather data, and generates AI journal entries written in Chilli's voice.

## Stack
- **Next.js 14** (App Router)
- **Supabase** (Postgres database)
- **Strava API** (activity data + webhook)
- **Open-Meteo** (free historical weather, no API key needed)
- **Anthropic Claude** (journal entry generation)

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd chilli-journal
npm install
```

### 2. Supabase

1. Create a new Supabase project
2. Go to SQL Editor and run the contents of `supabase/schema.sql`
3. Copy your project URL, anon key, and service role key

### 3. Strava API app

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create an app (or use the existing one)
3. Set **Authorization Callback Domain** to `localhost` for dev
4. Note your Client ID and Client Secret

#### Strava Developer Program (account checklist)

This app uses a **direct** OAuth + webhook integration (single athlete). It does not use club, segment explore, or third-party API intermediaries.

**Owner action** — confirm in [API settings](https://www.strava.com/settings/api):

- [ ] Note your **developer tier** (Standard vs Extended Access) and any transition email from Strava
- [ ] **Standard Tier:** active **Strava subscription** required for API access (new developers from 2026-06-01; existing developers from **2026-06-30**). Extended Access Tier is not subject to this subscription requirement
- [ ] Skim the current [API Agreement](https://www.strava.com/legal/api) and API Policy when linked from the dashboard
- [ ] If you need higher test limits on Standard Tier, use dashboard **self-upgrade** (up to 10 athletes; this app only needs one)

Fi collar → Strava sync is unchanged by these program updates. Optional [Strava MCP](https://www.strava.com) is for ad-hoc AI analysis of your own data; it does not replace this journal pipeline.

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

Required values:
- `STRAVA_CLIENT_ID` — your Strava app client ID
- `STRAVA_CLIENT_SECRET` — your Strava app client secret
- `STRAVA_WEBHOOK_VERIFY_TOKEN` — any random string you choose
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase project settings
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings (keep secret!)
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `NEXT_PUBLIC_APP_URL` — `http://localhost:3000` for dev

### 5. Connect Strava

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) and click **Connect Strava**. This saves your OAuth tokens to Supabase.

### 6. Run historical import

Once Strava is connected:

```bash
npm run import
```

This will:
- Fetch ALL your Strava activities
- Filter for Chilli walks (name contains "Chilli" or "Fi", case insensitive)
- Fetch historical weather for each walk's date and location
- Generate an AI journal entry in Chilli's voice for each
- Save everything to Supabase

**Note:** Depending on how many walks Chilli has, this may take a few minutes. It's safe to re-run — already-imported activities are skipped.

---

## Deploying to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add all environment variables from `.env.local`
4. Change `NEXT_PUBLIC_APP_URL` to your Vercel URL
5. Update Strava app's **Authorization Callback Domain** to your Vercel domain

### Register the Strava webhook (after deploying)

Run this once to tell Strava where to send new activity events:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=5931 \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://YOUR_VERCEL_URL/api/strava/webhook \
  -F verify_token=YOUR_WEBHOOK_VERIFY_TOKEN
```

After this, every new Chilli walk will automatically:
1. Be detected by the webhook
2. Have weather data fetched
3. Get an AI journal entry generated
4. Appear in the app within minutes of the walk ending

---

## Journal views

Use **Layout** on the journal tab to switch between two views (saved in `localStorage`):

- **Timeline** (default) — calendar + day timeline on the left, full entry on the right
- **Pages** — six entries per page with prev/next; **Sort by** controls appear only in this view

---

## Design preview (theme comparison)

Compare three visual directions before changing the live journal:

```bash
npm run dev
# http://localhost:3000/design-preview
```

Options: **Sierra Sage** (portfolio-adjacent), **Warm Journal** (modernized parchment), **Trail Soft** (distinct stone/sky palette).

---

## Project structure

```
app/
  page.tsx                    # Main journal page (server component)
  api/strava/
    callback/route.ts         # OAuth callback
    connect/route.ts          # Redirect to Strava auth
    webhook/route.ts          # Receives new activity events
components/
  JournalClient.tsx           # Client-side journal UI
  EntryCard.tsx               # Individual entry display
  StatsDashboard.tsx          # Stats and charts
lib/
  strava.ts                   # Strava API client
  weather.ts                  # Open-Meteo client
  supabase.ts                 # Supabase client + types
  generateEntry.ts            # Claude narrative generator
scripts/
  historicalImport.ts         # One-time bulk import
supabase/
  schema.sql                  # Database schema
```
# chilli-journal
