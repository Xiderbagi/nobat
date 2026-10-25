# Nobat

Online booking, a live queue and WhatsApp/SMS reminders for **clinics** and **beauty salons/barbers** in the Kurdistan Region.

Customers book from a link or a QR code, with no app to install. Staff run the day from a browser on a tablet, phone or computer.

## What it does

### Clinics
- **Patients** (Sorani Kurdish, Arabic, English) choose a doctor and take a queue number or a fixed time, for today or the next 7 days. They confirm with a 4-digit SMS code, then follow a live page: their number, who is in the room, how many people are ahead and the expected wait.
- **Messages to patients:** booking confirmed, a reminder the evening before, "2 patients before you, come now", "it's your turn", and a follow-up reminder when the doctor sets one.
- **Reception:** today's queue per doctor, one button to call the next patient (it sends the messages automatically), arrived/no-show, walk-ins.
- **Patient files:** visit history, year of birth, allergies, notes per visit and the next follow-up date. **Visit notes and allergies are only shown to the owner and doctors**, not to reception.

### Salons and barbers
- **Customers** choose services (price and minutes add up), a staff member or "anyone free", a day and a start time. Visits never overlap, and each one must end before closing time.
- The owner sets **which services each staff member does**, so "anyone free" never gives a hair color to the nail technician.
- **Messages:** booking confirmed, a reminder the evening before, and a **"book again"** message some weeks after a visit (set per service, for example 6 weeks after a haircut). It isn't sent if the customer has already booked again.
- **Front desk:** all of today's bookings across staff, with arrived, start, done and no-show. It can also add bookings that came in by phone, Instagram or walk-in.

### For both
- **Staff screens in Kurdish, Arabic or English.** Each person picks their language at the top of the screen.
- **A printable QR poster** (A4/A5) in three languages, for the waiting room, reception and the door. Find it under **Today → QR poster**.
- **Roles:** owner (everything, including settings), reception, and doctor/staff member.
- **Messages log:** every message sent, with its status.

## Try it on your computer

You need [Node.js](https://nodejs.org) 22.13 or newer.

```bash
npm install
npm run seed                      # demo clinic: demo@nobat.app / demo12345
npm run seed -- --kind salon --name "Demo Salon" --email salon@nobat.app --password demo12345
npm start                         # open http://localhost:3000/login
```

- Patients book at `http://localhost:3000/c/demo-clinic`, and salon customers at `http://localhost:3000/c/demo-salon`.
- `npm test` runs the automated tests.

Until WhatsApp or SMS is set up, nothing is actually sent. Messages are printed in the terminal and listed under **Messages**. In this test mode, the booking page also shows the SMS code on screen.

## Add a real clinic or salon

```bash
npm run seed -- --name "Shifa Clinic" --city Erbil --owner "Dr. Hemin" --email owner@shifa.iq --password "a-long-password" --lang ckb --no-demo-doctor
npm run seed -- --kind salon --name "Lana Beauty" --city Erbil --owner "Lana" --email lana@example.com --password "a-long-password" --lang ckb --no-demo-doctor
```

Forgot a password? `npm run set-password -- --email owner@shifa.iq --password "a-new-password"`

The owner signs in and, under **Settings**, adds the doctors or staff, their working hours (and, for salons, the services), plus accounts for reception and doctors. `--lang` sets the owner's screen language: `ckb` (Kurdish), `ar` (Arabic) or `en` (English).

## Put it online (step by step, with Render)

Render is a hosting service that runs the app for you. The basic plan with a disk costs about $7–10 a month.

1. Create an account at [render.com](https://render.com) and connect your GitHub account.
2. Click **New → Blueprint** and choose this repository. Render reads `render.yaml` and sets everything up, including a 1 GB disk for the data, in the Frankfurt region (closest to Iraq).
3. When it asks for **BASE_URL**, enter the address Render gives you, for example `https://nobat.onrender.com`. Use your own domain later if you buy one.
4. Click **Apply** and wait for the first deploy, about 5 minutes.
5. Open the service, go to **Shell**, and create your first clinic with `npm run seed -- ...` as shown above.
6. Open `https://<your-address>/login` and sign in.

**Backups:** in the Render Shell, or with a Render Cron Job, run `npm run backup` every day. It saves a copy to `/data/backups` and keeps the last 14. Copy backups somewhere else too, once a week.

**Other hosts:** the `Dockerfile` works on any Docker host (Fly.io, Railway, DigitalOcean, or your own server). Mount a persistent disk at `/data` and set the variables below.

| Variable | What it is |
| --- | --- |
| `NODE_ENV` | `production`. Hides the test SMS code |
| `BASE_URL` | The public address, for example `https://nobat.app`. Used in links inside messages and on posters |
| `PORT` | Port to listen on (default 3000) |
| `DB_FILE` | The database file (default `data/nobat.db`, `/data/nobat.db` in Docker) |
| `BACKUP_DIR` | Where `npm run backup` saves copies (default: next to the database) |

## Turn on WhatsApp and SMS

**WhatsApp** (WhatsApp Business Platform, through Meta):
1. Create a Meta Business account and get it verified. This takes 1–3 weeks, so start early.
2. Add a WhatsApp phone number and create one message template with a single body variable, `{{1}}`. Wait for Meta to approve it.
3. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` (the template name) and `WHATSAPP_TEMPLATE_LANG` (for example `en`).

**SMS** (needed for the login codes):
1. Sign up with an SMS provider that delivers to Iraqi networks (Asiacell, Korek, Zain).
2. Set `SMS_URL`, `SMS_TOKEN` and `SMS_SENDER`. If your provider's API looks different, change `sendSms` in `src/notify.js` (about 10 lines).

Meta and SMS providers charge per message, so check their prices before launch.

## How the code is organised

| Path | What's in it |
| --- | --- |
| `src/server.js` | Web server, pages, API routes, scheduled messages (reminders, follow-ups, "book again") |
| `src/queue.js` | Booking rules: clinic queues and time slots, salon services and overlap checks |
| `src/notify.js` | Sends WhatsApp/SMS and records every message |
| `src/i18n.js` | Patient/customer text in Kurdish, Arabic and English |
| `src/staff-i18n.js` | Staff screen text in Kurdish, Arabic and English |
| `src/db.js` | Database tables (SQLite, built into Node.js) and upgrades between versions |
| `src/auth.js` | Staff sign-in and sessions |
| `src/views.js` | HTML for each page, including the QR poster |
| `public/` | Browser scripts and styles |
| `scripts/seed.js` | Creates a clinic or salon and its owner account |
| `scripts/backup.js` | Daily database backup |
| `test/` | Automated tests |
| `docs/screens/` | Screenshots of every screen |

## Before real customers use it

- [ ] Have a native speaker check all Kurdish (Sorani) and Arabic text in `src/i18n.js` and `src/staff-i18n.js`, and add Badini if needed
- [ ] Test the full flow with 2–3 friendly clinics and salons for a few weeks
- [ ] Have a lawyer write a privacy policy (patient files hold medical information) and terms for businesses
- [ ] Set up daily backups and a simple uptime check on `/healthz`
