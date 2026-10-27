# Gen 1 Binder

Phone-first PWA for the one-full-art-per-Pokémon Gen 1 binder. Seed catalog: `src/data/catalog.json`.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
```

Without Supabase keys the app runs in **"This device only"** mode: owned cards and paid amounts are saved in the browser, starting from the catalog export (32/82).

## Hosting

GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`.

## Turn on sync (Supabase)

1. Create a free project at supabase.com.
2. SQL editor → paste and run `supabase/schema.sql`.
3. In the GitHub repo → Settings → Secrets and variables → Actions, add:
   - `SUPABASE_URL`: Project Settings → API → Project URL
   - `SUPABASE_ANON_KEY`: the `anon` / publishable key (it goes into the site; that's expected)
   - `SUPABASE_SERVICE_ROLE_KEY`: the `service_role` / secret key (used only by the Actions jobs, never in the site)
4. Actions → "Seed Supabase catalog" → Run workflow. Then Actions → "Deploy to GitHub Pages" → Run workflow.
5. Supabase → Authentication:
   - URL Configuration: set Site URL to the GitHub Pages address.
   - Email templates → "Magic Link": add `{{ .Token }}` so the email includes a 6-digit code.
     (iPhone home-screen apps can't receive magic links, but the code works.)
6. Sign in once on each device. Then turn off "Allow new users to sign up" (Authentication → Providers → Email).

On first sign-in the app copies your owned cards into Supabase. It uses that device's "This device only" records if it has any, otherwise the catalog export. That step is insert-only, so it never overwrites anything already there.

For local development with sync, copy `.env.example` to `.env.local` and add the URL and anon key.

## Prices

`.github/workflows/refresh-prices.yml` runs every Monday (or from the Actions tab). It reads the Limitless list view and updates English `price_usd`/`price_date` in Supabase, plus a `price_history` row per card. Before Supabase is set up, it's a dry run that only reports changes. Run it locally with `npm run prices -- --dry-run`. Japanese prices are not refreshed.

GitHub pauses scheduled workflows after 60 days with no commits. If that happens, re-enable the workflow from the Actions tab.

## Where data lives

| Data | Table | Written by |
|---|---|---|
| Catalog, prices | `cards`, `price_history` | `npm run seed`, the price-refresh job (service key) |
| Owned, paid, binder pick | `ownership`, `binder_picks` | the app only, as you (row-level security) |

A price refresh can't overwrite your owned or paid fields, because they're in tables it never writes to.

## Scripts

- `npm run images`: downloads card images once (TCGplayer CDN, checked against Limitless; Limitless image as fallback) into `public/cards/{sm,lg}/*.webp`. Skips existing files; `--force` redoes them all.
- `npm run icons`: regenerates app icons.
- `npm run seed`: seeds `cards` in Supabase (same as the "Seed Supabase catalog" workflow).
- `npm run prices`: price refresh (see above).
