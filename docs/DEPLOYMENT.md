# Deploying EAS Online (new install or upgrade): one procedure

Order matters because each step depends on the one before it. Do them in this order, every release.

1. **Database migrations** (`docs/MIGRATIONS.md`). `supabase link --project-ref <ref>` once, then `supabase db push`. It applies only files the project has not recorded. Take a backup first on a project with live matches (Dashboard → Database → Backups). New project: it runs 01→09. Existing project: only the missing files run; nothing is dropped and no game, player or active match is touched.
2. **Edge Function secrets and deploy.**
   ```bash
   supabase secrets set ALLOWED_ORIGIN=https://YOUR-SITE.vercel.app   # REQUIRED. exact origin(s), comma-separated, no trailing path
   supabase secrets set RATE_LIMIT_SALT=$(openssl rand -hex 24)        # optional but recommended; falls back to the service key
   supabase functions deploy eas-game
   ```
   Since v5.11.1 the function **refuses to start** without `ALLOWED_ORIGIN`, and refuses `*`. For local development only: `EAS_DEV_CORS=1`. `TRUSTED_IP_HEADER` (default `cf-connecting-ip`) names the header the platform sets for the caller's address; see the limitation in `ONLINE_ARCHITECTURE.md`. Deploy **after** step 1: the function calls the functions created by migration 09.
3. **Static site** (Vercel). Environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public key only; the build refuses a service-role key). Build command `node tools/write-env.mjs && node tools/stamp-sw.mjs && node tools/build-dist.mjs`, output `dist`. Run `node tools/sync-edge-shared.mjs --check` before committing: shared game rules must match the copy the function ships.
4. **PWA update.** `tools/stamp-sw.mjs` stamps the service-worker cache version from the content, so every deployment with changed files is an update. Open clients see the update bar, and *Reload* saves a running local match first and offers to continue it afterwards. A running **online** match is held by the server and is picked up again by `reconnect`.
5. **Verify.** `https://<site>/pwa-check.html` (every line ✔), then two devices: create, join, start, play a move, refresh one side mid-game. From a browser on any other origin, a call to the function must fail CORS.

Order rule of thumb: **database → function → site**. A new function against an old database fails; an old function against a new database works (migrations are additive).
