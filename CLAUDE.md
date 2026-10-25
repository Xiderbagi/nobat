# Nobat: notes for Claude

Nobat is a booking and queue app for clinics, salons, barbers and spas in the Kurdistan Region of Iraq.
Patients book online and follow their turn; staff run the day from a reception screen. The owner sells it to clinics.

## Who you are working with

- The owner is not a programmer. Explain in plain words, give click-by-click steps, avoid jargon.
- The owner tests on an iPhone. Phones can keep old copies; tell them to close and reopen the site after an update.
- Show design choices as pictures (screenshots or option sheets) before putting them live.
- Customer messages go by SMS only (the owner said no WhatsApp).

## How it runs

- Node 22.13+, Express 4, built-in `node:sqlite`. No build step. Start: `npm start`. Tests: `NODE_ENV=test npm test`.
- Live on Render (Docker, `render.yaml`), database and uploads on a disk at `/data`.
- **Every push to `main` goes live automatically within about 5 minutes.** Put experiments and design previews on another branch (for example `design-preview`) and merge to `main` only after the owner approves.
- The owner's admin login comes from the Render environment variables `ADMIN_EMAIL` and `ADMIN_PASSWORD` (set again at every start). Typing commands in Render's Shell on an iPhone failed because of smart quotes and dashes.
- Commit as `git -c user.name="Nobat" -c user.email="axiderbagi@glowbalgroup.com" commit ...`.

## Rules in the code

- Database changes: append a new entry to `MIGRATIONS` in `src/db.js`. Never edit an existing entry (live databases already ran it).
- The Content Security Policy blocks inline styles and scripts: no `style=""` or inline `<script>`. Use classes, and pass data in `<script id="data" type="application/json">`.
- Three languages everywhere a customer looks: Kurdish (ckb, default), Arabic (ar), English (en). Customer text is in `src/i18n.js`; staff text is in `src/staff-i18n.js`, where `key_salon` replaces `key` for salons. Kurdish and Arabic need a native-speaker check.
- Styles and scripts are linked with a content fingerprint (`ASSET_V` in `src/views.js`), so phones load updates at once. Icon links use `?v=N`; raise N when the icons change.
- Run the tests and look at the pages in a browser (Playwright, phone width 390px too) before pushing.

## Map of the code

- `src/server.js`: routes and APIs. `src/views.js`: all HTML pages. `src/admin.js`: the owner's admin screen at `/admin`.
- `src/queue.js`: booking rules. `src/policy.js`: cancelling (24 h), lateness hold (15 min) and no-show limits (3), set per clinic.
- `src/directory.js` and `src/categories.js`: search, categories, map. `src/uploads.js`: photos. `src/notify.js`: SMS.
- `public/`: browser scripts and `app.css`. `public/icons/`: the app icon (English N, wood line, Kurdish ن, on navy).
- Look: navy `#1b2a4a`, white and wood `#c69563` on the main pages. The salon and spa pages (`body.beauty`) use calm cream, sage and clay.

## Pages

- `/`: only three tall pictures (Clinics and doctors, Salons and barbers, Spa and wellness) plus Cancellation policy and Support desk links.
- `/clinics` and `/beauty`: search pages. `/c/:slug`: a clinic's page. `/t/:token`: a customer's ticket.
- `/app`: staff screens. `/admin`: the owner (clinics, payments, website photos, no-shows and bans, support inbox).

## Still to do

- Connect an SMS company (see the README).
- Native-speaker check of the Kurdish and Arabic text.
- Daily backups of `/data` (`npm run backup`), including the `uploads` folder.
