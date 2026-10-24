import { esc } from './util.js';
import { LANGS, RTL, t, dictFor } from './i18n.js';

const LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true" class="logo"><rect width="40" height="40" rx="11" fill="currentColor"/><rect x="17" y="9" width="6" height="22" rx="2" fill="#fff"/><rect x="9" y="17" width="22" height="6" rx="2" fill="#fff"/><circle cx="30" cy="30" r="6" fill="#f08a6f"/></svg>';

// Data for page scripts goes in a JSON script tag, escaped so it can't close the tag.
const json = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

export function page({ title, lang = 'en', body, data, script, head = '' }) {
  return `<!doctype html>
<html lang="${lang === 'ckb' ? 'ckb' : lang}" dir="${RTL.has(lang) ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/app.css">
${head}
</head>
<body>
${body}
${data !== undefined ? `<script id="data" type="application/json">${json(data)}</script>` : ''}
${[].concat(script || []).map((f) => `<script src="/static/${f}" defer></script>`).join('')}
</body>
</html>`;
}

function langSwitch(lang, path) {
  return `<nav class="langs" aria-label="Language">${LANGS.map((l) => `<a href="${esc(path)}?lang=${l}" ${l === lang ? 'aria-current="true"' : ''}>${esc(t(l, 'langName'))}</a>`).join('')}</nav>`;
}

function publicHeader(clinic, lang, path) {
  return `<header class="top"><div class="wrap row">
    <a class="brand" href="/c/${esc(clinic.slug)}?lang=${lang}">${LOGO}<span><b>${esc(clinic.name)}</b><small>${esc([clinic.address, clinic.city].filter(Boolean).join(', '))}</small></span></a>
    ${langSwitch(lang, path)}</div></header>`;
}

export function clinicPage(clinic, doctors, lang) {
  const body = `${publicHeader(clinic, lang, `/c/${clinic.slug}`)}
  <main class="wrap stack">
    <h1>${esc(t(lang, 'chooseDoctor'))}</h1>
    <div class="cards">${doctors.map((d) => `
      <a class="card doc" href="/c/${esc(clinic.slug)}/d/${d.id}?lang=${lang}">
        <span class="av">${esc(d.name.replace(/^(Dr\.?|د\.)\s*/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2))}</span>
        <span><b>${esc(d.name)}</b><span class="muted">${esc(d.specialty)}</span>
        <span class="fee">${esc(t(lang, 'fee'))}: ${d.fee_iqd.toLocaleString('en-US')} ${esc(t(lang, 'iqd'))}</span></span>
      </a>`).join('') || '<p class="muted">—</p>'}
    </div>
    <p class="foot">${esc(t(lang, 'poweredBy'))}</p>
  </main>`;
  return page({ title: clinic.name, lang, body });
}

export function bookingPage(clinic, doctor, lang, dev) {
  const body = `${publicHeader(clinic, lang, `/c/${clinic.slug}/d/${doctor.id}`)}
  <main class="wrap narrow stack">
    <section class="card stack">
      <div><h1>${esc(doctor.name)}</h1><p class="muted">${esc(doctor.specialty)} · ${esc(t(lang, 'fee'))}: ${doctor.fee_iqd.toLocaleString('en-US')} ${esc(t(lang, 'iqd'))}</p></div>
      <h2>${esc(t(lang, 'pickDate'))}</h2>
      <div class="days" id="days"></div>
      <h2 id="pickTitle">${esc(t(lang, doctor.mode === 'time' ? 'byTime' : 'byQueue'))}</h2>
      <div id="pick"></div>
    </section>
    <form class="card stack" id="form" novalidate hidden>
      <label>${esc(t(lang, 'name'))}<input id="name" autocomplete="name" maxlength="60" required></label>
      <label>${esc(t(lang, 'phone'))}<input id="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="0750 123 4567" maxlength="20" required></label>
      <button type="button" class="btn ghost" id="sendCode">${esc(t(lang, 'sendCode'))}</button>
      <div id="codeBox" hidden class="stack">
        <p class="muted" id="codeMsg"></p>
        <label>${esc(t(lang, 'code'))}<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="4" dir="ltr" class="code"></label>
        <button class="btn primary big" id="confirm">${esc(t(lang, 'confirm'))}</button>
      </div>
      <p class="err" id="err" role="alert" hidden></p>
    </form>
    <p class="foot">${esc(t(lang, 'poweredBy'))}</p>
  </main>`;
  return page({ title: `${doctor.name} · ${clinic.name}`, lang, body, script: 'book.js', data: { lang, dev, doctorId: doctor.id, mode: doctor.mode, t: dictFor(lang) } });
}

export function ticketPage(booking, lang) {
  const body = `<header class="top"><div class="wrap row"><span class="brand">${LOGO}<span><b>${esc(booking.clinic_name)}</b><small>${esc(booking.doctor_name)}</small></span></span>${langSwitch(lang, `/t/${booking.token}`)}</div></header>
  <main class="wrap narrow stack">
    <section class="ticket" id="ticket" aria-live="polite"></section>
    <p class="muted center">${esc(t(lang, 'keepOpen'))}</p>
    <button class="btn ghost" id="cancel" hidden>${esc(t(lang, 'cancel'))}</button>
    <p class="foot">${esc(t(lang, 'poweredBy'))}</p>
  </main>`;
  return page({ title: booking.clinic_name, lang, body, script: 'ticket.js', data: { lang, token: booking.token, t: dictFor(lang) } });
}

export function loginPage() {
  const body = `<main class="wrap narrow stack login">
    <div class="brand big">${LOGO}<span><b>Nobat</b><small>Clinic sign in</small></span></div>
    <form class="card stack" id="login">
      <label>Email<input id="email" type="email" autocomplete="username" required></label>
      <label>Password<input id="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary big">Sign in</button>
      <p class="err" id="err" role="alert" hidden></p>
    </form>
  </main>`;
  return page({ title: 'Sign in · Nobat', body, script: 'login.js' });
}

function staffHeader(user, current) {
  const tabs = [['/app', 'Today'], ['/app/messages', 'Messages']];
  if (user.role === 'owner') tabs.push(['/app/settings', 'Settings']);
  return `<header class="top"><div class="wrap row">
    <a class="brand" href="/app">${LOGO}<span><b>Nobat</b><small>${esc(user.clinic_name)}</small></span></a>
    <nav class="tabs">${tabs.map(([href, label]) => `<a href="${href}" ${href === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <button class="btn ghost small" id="logout">Sign out</button></div></header>`;
}

export function receptionPage(user, clinic, doctors, live) {
  const body = `${staffHeader(user, '/app')}
  <main class="wrap stack">
    ${live ? '' : '<p class="note warn">Messages are not being sent yet: WhatsApp and SMS are not set up. They are saved under Messages.</p>'}
    <div class="row wrapper">
      <label class="inline">Doctor <select id="doctor">${doctors.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>
      <label class="inline">Day <input type="date" id="date"></label>
      <span class="grow"></span>
      <a class="btn ghost small" id="publicLink" target="_blank" rel="noopener">Booking page ↗</a>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="split">
      <section class="card"><h2>Queue</h2><div class="tablewrap"><table><thead><tr><th>#</th><th>Patient</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section>
      <aside class="stack">
        <section class="card stack now" id="now"></section>
        <form class="card stack" id="walkin"><h2>Add walk-in</h2>
          <label>Name<input id="wName" maxlength="60" required></label>
          <label>Mobile (optional, for messages)<input id="wPhone" type="tel" dir="ltr" maxlength="20"></label>
          <button class="btn ghost">Add to queue</button>
        </form>
      </aside>
    </div>
  </main>
  <div class="toast" id="toast" role="status"></div>`;
  return page({ title: 'Today · Nobat', body, script: ['staff.js', 'reception.js'], data: { clinicSlug: clinic.slug } });
}

export function messagesPage(user, rows) {
  const body = `${staffHeader(user, '/app/messages')}
  <main class="wrap stack">
    <h1>Messages</h1>
    <p class="muted">The last 200 messages sent to patients. Login codes are hidden.</p>
    <section class="card"><div class="tablewrap"><table><thead><tr><th>When (UTC)</th><th>To</th><th>Type</th><th>Channel</th><th>Status</th><th>Message</th></tr></thead><tbody>
    ${rows.map((m) => `<tr><td class="nowrap">${esc(m.created_at)}</td><td class="nowrap" dir="ltr">${esc(m.to_phone)}</td><td>${esc(m.kind)}</td><td>${esc(m.channel)}</td><td><span class="pill ${m.status === 'failed' ? 'bad' : m.status === 'sent' ? 'good' : ''}">${esc(m.status)}</span>${m.error ? `<div class="muted small">${esc(m.error)}</div>` : ''}</td><td dir="auto">${esc(m.body)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No messages yet.</td></tr>'}
    </tbody></table></div></section>
  </main>`;
  return page({ title: 'Messages · Nobat', body, script: 'staff.js' });
}

export function settingsPage(user) {
  const body = `${staffHeader(user, '/app/settings')}
  <main class="wrap stack" id="settings"></main>
  <div class="toast" id="toast" role="status"></div>`;
  return page({ title: 'Settings · Nobat', body, script: ['staff.js', 'settings.js'] });
}
