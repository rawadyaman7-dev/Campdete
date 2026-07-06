# Scout Camp Egg Hunt

A mobile-first live game for scout camp: teams complete challenges to unlock hidden
"egg" locations, race to physically find them, and an admin approves submissions
and confirms collections. Live team GPS positions and unlocked eggs show on a
shared map.

Built with Next.js (App Router, API routes), Postgres (via Prisma 7), and
Cloudflare R2 for photo storage. Installable as a PWA.

## 1. One-time setup: hosted Postgres + Cloudflare R2

You need two free cloud services before this will run anywhere but your laptop.

### 1a. Postgres on Render

1. Create a free account at [render.com](https://render.com).
2. **New +** → **PostgreSQL**. Pick any name/region, free plan is fine.
3. Once it's created, open it and copy the **Internal Database URL** (for the
   web service, once both are on Render) and the **External Database URL**
   (for connecting from your laptop while testing locally).

### 1b. Cloudflare R2 bucket

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com) if you don't have one.
2. Go to **R2 Object Storage** → **Create bucket**. Name it e.g. `egg-hunt-photos`.
3. In the bucket's **Settings**, enable **Public access** (or connect a custom
   domain) and note the public base URL it gives you — this is `R2_PUBLIC_URL`.
4. Go to **R2** → **Manage API tokens** → **Create API token** with read/write
   access to your bucket. Note the **Access Key ID** and **Secret Access Key**.
5. Your **Account ID** is shown on the right side of the Cloudflare dashboard
   overview page — this is `R2_ACCOUNT_ID`.

### 1c. Fill in environment variables

Copy `.env` (already present with placeholders) and fill in:

```
DATABASE_URL=              # Render Postgres "External Database URL" for local dev
SESSION_SECRET=            # any long random string
ADMIN_PASSWORD=            # the password you (the organizer) will log in with
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=              # e.g. https://pub-xxxxxxxx.r2.dev
```

## 2. Running locally

```bash
npm install                 # also runs `prisma generate` automatically
npm run db:migrate          # applies prisma/migrations to your database
npm run db:seed             # creates the 6 teams + starter challenges
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Team login uses the names
and PINs from `prisma/seed.ts` (edit that file and re-run `npm run db:seed`
to change teams/challenges before camp — it's safe to re-run, it upserts).

Admin login is at `/admin/login` using `ADMIN_PASSWORD` from your `.env`.

> Geolocation only works over `https://` or `localhost`, so local testing of
> the map/location features works fine in a browser on your own machine, but
> to test from a phone you'll need it deployed (step 3) or tunneled with
> something like `ngrok`.

## 3. Deploying to Render so it's live at a public URL

1. Push this project to a GitHub repo.
2. In Render: **New +** → **Web Service** → connect your repo.
3. Settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: Free is fine for a weekend camp game.
4. Add all the environment variables from your `.env` file to the Render
   service's **Environment** tab. For `DATABASE_URL`, use the Postgres
   instance's **Internal Database URL** (faster, same Render network).
5. Deploy. Once live, run the migration and seed once against production —
   easiest way is to temporarily set your local `DATABASE_URL` to the
   Postgres **External Database URL** and run:
   ```bash
   npm run db:deploy   # applies migrations (safe, non-interactive)
   npm run db:seed      # creates teams + challenges
   ```
6. Your app is now at `https://<your-service-name>.onrender.com`. Share that
   URL with all 6 teams — they open it on their phones and tap "Add to Home
   Screen" to install it as an app (PWA).

> Free Render web services spin down after inactivity and take ~30-60s to
> wake on the next request. If that matters for camp day, upgrade to a paid
> instance for the event, or open the URL yourself a minute before teams
> start playing to wake it up.

## 4. Before camp: configure teams, challenges, and the map

All of this is editable without touching code:

- **Teams & challenges**: edit the arrays at the top of `prisma/seed.ts`
  (team names, 4-digit PINs, colors; challenge titles, descriptions, points,
  and egg lat/lng), then run `npm run db:seed` again (safe to re-run).
- **Egg hint photos**: log in as admin → **Challenges** → **Edit** on a
  challenge → upload a hint photo of the hiding spot.
- **Map mode**: log in as admin → **Settings**:
  - `LIVE_TILES` uses OpenStreetMap and needs internet on the phones (fine for
    most towns/campsites with mobile signal).
  - `STATIC_IMAGE` uses an uploaded map image of your site instead, calibrated
    to GPS by entering the lat/lng of the image's four corners. Use this if
    you expect little/no mobile data at the site — the phones still need GPS
    (works without a data connection) but not internet for map tiles. Note
    the app still needs *some* connectivity to sync locations/challenges
    between phones; it isn't fully offline-capable.

## How the game works

- Each team logs in with their team name + 4-digit PIN.
- Teams submit a photo as proof for a challenge → status becomes "pending."
- Admin approves or rejects from the **Review** queue. Approving reveals that
  challenge's egg location + hint photo to that team only.
- Any team that's unlocked an egg can race to its location. Multiple teams
  can be racing for the same egg at once.
- At the site, a team taps **Found it!** — the app checks their GPS is within
  ~30m of the egg (a warning is shown if not, but the claim is still sent for
  the admin to judge, since GPS can be inaccurate outdoors).
- Admin confirms or denies the claim from **Egg Claims**. Confirming awards
  the points, marks the egg collected everywhere (it disappears from other
  teams' maps), and logs the time.
- **Leaderboard** shows running totals and a full history log.

## Offline handling

Phones will have patchy mobile data at the campsite. Location pings, photo
submissions, and "Found it!" claims all go through a retry queue backed by
IndexedDB: if a request fails (offline or a server hiccup), it's queued and
automatically retried in the background (checked every ~20s and whenever the
phone regains connectivity) instead of silently failing.

## Tech stack

- Next.js 16 (App Router, Route Handlers as the API)
- Postgres via Prisma 7 (`@prisma/adapter-pg` driver adapter)
- Cloudflare R2 (S3-compatible) for proof photos, hint photos, and the
  optional static map image
- Leaflet for the map, with `LIVE_TILES` (OpenStreetMap) and `STATIC_IMAGE`
  (uploaded image + GPS-calibrated bounds) modes behind a config toggle
- PIN/password login with signed session tokens stored in `localStorage`
  (no OAuth, intentionally simple for a private camp game)
- `@ducanh2912/next-pwa` for the installable PWA + service worker
