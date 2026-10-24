# Nobat

Online booking, a live queue and WhatsApp/SMS reminders for private clinics in the Kurdistan Region.

This is the first working version (clinics only). Patients book from a link, with no app to install. Reception runs the day from a browser on a tablet or computer.

## What it does

**Patients** (Sorani Kurdish, Arabic, English):
- Open the clinic's link (for example from a QR poster or Instagram) and choose a doctor
- Take a queue number, or pick a fixed time, for today or the next 7 days. Days the doctor doesn't work are closed
- Confirm with a 4-digit SMS code. No account or password
- Get a live page showing their number, who is in the room, how many people are ahead and the expected wait. It updates by itself
- Get messages: booking confirmed, a reminder the evening before, "2 patients before you, come now", and "it's your turn"
- Cancel from the same page

**Clinic staff** (English for now):
- **Today**: the day's queue for each doctor, with one button to call the next patient (it sends the messages automatically). Also mark arrived or no-show, and add walk-ins
- **Messages**: every message sent, with its status
- **Settings** (owner only): clinic details, doctors (fee, queue or fixed times, working hours per day, daily limit) and staff accounts

Not in this version: patient files, online payment, salons, schools, and Kurdish/Arabic staff screens.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22.13 or newer.

```bash
npm install
npm run seed      # creates a demo clinic: sign in with demo@nobat.app / demo12345
npm start         # open http://localhost:3000
```

- Staff sign in at `http://localhost:3000/login`
- Patients book at `http://localhost:3000/c/demo-clinic`
- `npm test` runs the automated tests

Until WhatsApp or SMS is set up, messages are not sent. They are printed in the terminal and listed under **Messages**. In this test mode the booking page also shows the SMS code on screen, so you can try it without a phone.

## Add a real clinic

```bash
npm run seed -- --name "Shifa Clinic" --city Erbil --owner "Dr. Hemin" --email owner@shifa.iq --password "a-long-password" --no-demo-doctor
```

The owner then signs in, adds the doctors and working hours under **Settings**, and gives reception their own account.

## Put it online

1. Rent a small server (about $10–20 a month is enough to start), or use a Node.js host such as Render, Railway or Fly.io.
2. Set these environment variables:

| Variable | What it is |
| --- | --- |
| `NODE_ENV` | `production`. Hides the test SMS code and turns on caching |
| `BASE_URL` | The public address, for example `https://nobat.app`. Used in links inside messages |
| `PORT` | The port to listen on (default 3000) |
| `DB_FILE` | Where the database file lives (default `data/nobat.db`). Keep it on a disk that is backed up |

3. Put HTTPS in front of it (most hosts do this for you).
4. Back up the database file every day.

## Turn on WhatsApp and SMS

**WhatsApp** (WhatsApp Business Platform, through Meta):
1. Create a Meta Business account and get it verified. This can take 1–3 weeks, so start early.
2. Add a WhatsApp phone number and create one message template with a single body variable, `{{1}}`. Wait for Meta to approve it.
3. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` (the template name) and `WHATSAPP_TEMPLATE_LANG` (for example `en`).

**SMS** (needed for the login codes):
1. Sign up with an SMS provider that delivers to Iraqi networks (Asiacell, Korek, Zain).
2. Set `SMS_URL`, `SMS_TOKEN` and `SMS_SENDER`. If your provider's API looks different, change `sendSms` in `src/notify.js` (about 10 lines).

Meta and SMS providers charge per message, so check their prices before launch.

## How the code is organised

| Path | What's in it |
| --- | --- |
| `src/server.js` | Web server, pages and API routes, evening reminder timer |
| `src/queue.js` | Booking and queue rules: slots, queue numbers, calling the next patient |
| `src/notify.js` | Sends WhatsApp/SMS and records every message |
| `src/i18n.js` | Patient-facing text in Kurdish, Arabic and English |
| `src/db.js` | Database tables (SQLite, built into Node.js) |
| `src/auth.js` | Staff sign-in and sessions |
| `src/views.js` | HTML for each page |
| `public/` | Browser scripts and styles |
| `scripts/seed.js` | Creates a clinic and its owner account |
| `test/` | Automated tests |

## Before real patients use it

- [ ] Have a native speaker check the Kurdish (Sorani) and Arabic text in `src/i18n.js`, and add Badini if needed
- [ ] Test the full flow with 2–3 friendly clinics for a few weeks
- [ ] Have a lawyer write a privacy policy and terms for clinics and patients
- [ ] Set up daily database backups and a simple uptime check
