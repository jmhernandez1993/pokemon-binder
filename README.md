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

## Sync (Supabase)

Project **PokeBinder** (us-west-2). The GitHub repo secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set. The site gets the URL and anon key at build time; only the Actions jobs use the service key.

- Tables: `supabase/schema.sql` (safe to re-run).
- Catalog: loaded once by the "Seed Supabase catalog" workflow (insert-only).
- Sign-in: email + password. The free tier can't customise email templates, so emailed codes aren't possible, and magic links open in Safari instead of the home-screen app. Email confirmation is off. New sign-ups are turned off once the owner's account exists.
- First sign-in copies owned cards into Supabase, using the device's "This device only" records if it has any, otherwise the catalog export. That step is insert-only, so it never overwrites anything already there.

For local development with sync, `.env.local` (gitignored) holds the URL and anon key.

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
