# Chilli's Adventure Journal — Project Brief

> This document gives AI assistants (Cursor, Claude Code) full context on this project.
> Keep it updated as the project evolves.

---

## What This Is

A Next.js web app that automatically turns Chilli's dog walks into an AI-generated journal, written in Chilli's voice. Walks are pulled from Strava via a Fi smart collar, enriched with historical weather data, and narrated by Claude.

**Live URL:** (Vercel URL — add when deployed)
**GitHub:** (add when created)
**Local dev:** `http://localhost:3000`

---

## The Dog

**Chilli** — husky, lives in Truckee, California, Sierra Nevada mountains.
**Owner:** Sian (called "Mama" by Chilli in all journal entries)

### Chilli's Personality (critical for AI generation)
- High energy but focused — doesn't waste effort, but ALL IN when something matters
- Smart and a little silly, fundamentally refined. Has taste.
- Very go with the flow — EXCEPT for specific strong opinions (see below)
- Inner monologue: intelligent and dry, punctuated by moments of pure unhinged dog brain

### Strong Opinions
- **Squirrels** — arch nemeses. Pure evil. The eternal war.
- **Birds** — deeply suspicious. Probably in league with the squirrels.
- **Snow** — sacred. The best thing in existence. Becomes a different (better) creature in snow.
- **The river** — excellent for a civilised mid-adventure cool-off. Selective about it. Not a labrador.
- **Other dogs** — loves finding dogs to play chase with on trails. Peak social experience.
- **The leash** — fine. Necessary. Beneath her. Tolerated with dignity.
- **Skijoring and canicross** — her calling. Pure purpose. Most herself.
- **Off-leash trails** — freedom. This is what life is for.
- **The Chicken Coop** — do not talk about it. We do not go that way. Ever.

### Activities
- Regular walks/hikes off-leash in the Sierras
- River dips to cool off mid-walk
- Skijoring (attached to Sian on skis)
- Canicross (attached to Sian running)
- Leash walks are tolerated but boring

### Strava Integration
Fi smart collar syncs walks to Strava with title:
`"Sian took Chilli for a walk with her Fi Smart Collar"`
Filter: activity name contains "Chilli" OR "Fi" (case insensitive)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (Postgres) |
| Hosting | Vercel |
| Activity data | Strava API v3 |
| Weather data | Open-Meteo (free, no API key) |
| AI generation | Anthropic Claude (claude-sonnet-4-20250514) |

---

## Project Structure

```
chilli-journal/
├── app/
│   ├── page.tsx                    # Main page (server component, fetches from Supabase)
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles + CSS variables
│   └── api/
│       └── strava/
│           ├── callback/route.ts   # OAuth callback handler
│           ├── connect/route.ts    # Redirects to Strava auth
│           └── webhook/route.ts    # Receives new activity events from Strava
├── components/
│   ├── JournalClient.tsx           # Main client UI (journal + nav + filters)
│   ├── EntryCard.tsx               # Individual journal entry display
│   └── StatsDashboard.tsx          # Stats charts and breakdowns
├── lib/
│   ├── strava.ts                   # Strava API client (OAuth, fetch activities, photos)
│   ├── weather.ts                  # Open-Meteo historical weather client
│   ├── supabase.ts                 # Supabase client + TypeScript types
│   └── generateEntry.ts            # Claude journal entry generator
├── scripts/
│   └── historicalImport.ts         # One-time bulk import script (npm run import)
├── supabase/
│   └── schema.sql                  # Database schema (run once in Supabase SQL editor)
├── .env.local                      # Environment variables (never commit this)
├── .env.example                    # Template for env vars (safe to commit)
└── README.md                       # Setup instructions
```

---

## Database Schema (Supabase)

### `activities` table
Stores raw Strava activity data.
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | Strava activity ID |
| strava_id | bigint | Same as id |
| name | text | Activity title from Strava |
| start_date | timestamptz | When the walk started |
| distance_meters | float | |
| moving_time_seconds | int | |
| total_elevation_gain | float | Meters |
| sport_type | text | Walk, Run, VirtualRide etc |
| start_lat/lng | float | GPS coordinates |
| city, country | text | Location |
| weather_* | float/text | From Open-Meteo |
| photo_urls | text[] | Array of Strava photo URLs |
| map_polyline | text | Encoded route polyline |

### `journal_entries` table
AI-generated narratives, linked to activities.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| activity_id | bigint FK | References activities.id |
| title | text | 5 words max, Chilli's POV |
| entry | text | 2-3 paragraphs in Chilli's voice |
| tags | text[] | 3-5 short tags |
| mood | text | EPIC/EXCELLENT/SOLID/SUSPICIOUS/CHAOTIC |
| human_note | text | Optional note from Sian |

### `strava_tokens` table
Single row storing OAuth tokens.

### `entries_with_stats` view
Joins journal_entries + activities — used by the main page query.

---

## Environment Variables

```bash
# Strava
STRAVA_CLIENT_ID=5931
STRAVA_CLIENT_SECRET=<current secret from strava.com/settings/api>
STRAVA_WEBHOOK_VERIFY_TOKEN=chilli_webhook_secret_change_me

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000  # change to Vercel URL when deployed
```

---

## Key Workflows

### Local development
```bash
npm run dev       # Start dev server at localhost:3000
npm run import    # Run historical import script
```

### Historical import
`scripts/historicalImport.ts` — run once to backfill all of Chilli's walks.
- Fetches activities from Strava list endpoint (efficient — no per-activity requests)
- Only fetches photos individually if `total_photo_count > 0`
- Gets historical weather from Open-Meteo for each walk date + coordinates
- Generates AI journal entry via Claude for each walk
- Skips already-imported activities (safe to re-run)
- Strava rate limits: 100 req/15min, 1000 req/day. Reset at midnight UTC (4-5pm Pacific)

### Auto-detection of new walks (webhook)
Once deployed to Vercel:
1. Register webhook with Strava (one curl command — see README)
2. New Chilli walk syncs to Strava → Strava POSTs to `/api/strava/webhook`
3. App fetches full activity, weather, generates journal entry automatically
4. Entry appears in the journal within minutes of the walk ending

### Deploying to Vercel
1. Push to GitHub
2. Import project in Vercel dashboard
3. Add all env vars
4. Update `NEXT_PUBLIC_APP_URL` to Vercel URL
5. Update Strava app callback domain to Vercel domain
6. Register Strava webhook (curl command in README)

---

## Current Status

- [x] Project scaffolded
- [x] Supabase schema created
- [x] Strava OAuth working (connected locally)
- [x] Historical import script working
- [x] Historical import in progress (running in batches due to Strava rate limits)
- [ ] Historical import complete
- [ ] Local journal UI verified
- [ ] Pushed to GitHub
- [ ] Deployed to Vercel
- [ ] Strava webhook registered
- [ ] Auto-generation of new entries working

---

## Known Issues / Notes

- Strava daily API limit is 1000 requests/day — resets midnight UTC (4-5pm Pacific)
- Import script is efficient: uses list data directly, only fetches photos when present
- Strava client secret was exposed in chat — **regenerate at strava.com/settings/api**
- `.env.local` must never be committed to GitHub — it's in `.gitignore`

---

## Sian's Background (context for AI assistants)

- Senior ops/CX leader, 9+ years director level
- Technical background: Cambridge Natural Sciences + MS Computer Science + software engineer
- Prior Field Applications Engineer roles (DisplayLink, Adder)
- Also has a lactate testing web app (Julie Young Training) — Flask, deployed on Vercel
- Using this project to build AI/engineering portfolio
- Based in Truckee, CA
- Also has an email screening agent project (Morning Mail Agent) built as a Claude artifact

---

## Style / Design Language

CSS variables defined in `globals.css`:
- `--ink`: #160800 (dark brown-black, used for header)
- `--parchment`: #f7f2e8 (warm off-white background)
- `--cream`: #fffdf7 (card backgrounds)
- `--border`: #e0d4be (warm grey borders)
- `--muted`: #9a7a5a (secondary text)
- `--accent`: #5b21b6 (purple, used for active states)

Fonts: Playfair Display (headings), Lora (body), Courier Prime (labels/mono)
Mood colours: EPIC=#7c3aed, EXCELLENT=#d97706, SOLID=#10b981, SUSPICIOUS=#ef4444, CHAOTIC=#06b6d4
