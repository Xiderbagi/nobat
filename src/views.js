import { esc } from './util.js';
import { LANGS, RTL, t, dictFor } from './i18n.js';
import { STAFF_LANGS, staffDict, st } from './staff-i18n.js';
import { categoryName } from './categories.js';

const LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true" class="logo"><rect width="40" height="40" rx="11" fill="currentColor"/><rect x="17" y="9" width="6" height="22" rx="2" fill="#fff"/><rect x="9" y="17" width="22" height="6" rx="2" fill="#fff"/><circle cx="30" cy="30" r="6" fill="#f08a6f"/></svg>';

// Data for page scripts goes in a JSON script tag, escaped so it can't close the tag.
const json = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
const iqd = (n) => Number(n || 0).toLocaleString('en-US');
const initials = (name) => esc(String(name).replace(/^(Dr\.?|د\.)\s*/i, '').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2));

export function page({ title, lang = 'en', body, data, script, bodyClass = '', manifest = '/manifest.webmanifest', appName = 'Nobat', head = '' }) {
  return `<!doctype html>
<html lang="${esc(lang)}" dir="${RTL.has(lang) ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="manifest" href="${esc(manifest)}">
<meta name="theme-color" content="#1f5fbf">
<link rel="icon" href="/static/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(appName)}">
<script src="/static/pwa.js" defer></script>
${head}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
${data !== undefined ? `<script id="data" type="application/json">${json(data)}</script>` : ''}
${[].concat(script || []).map((f) => `<script src="/static/${f}" defer></script>`).join('')}
</body>
</html>`;
}

function langSwitch(lang, path, langs = LANGS, nameOf = (l) => t(l, 'langName')) {
  return `<nav class="langs" aria-label="Language">${langs.map((l) => `<a href="${esc(path)}?lang=${l}" ${l === lang ? 'aria-current="true"' : ''}>${esc(nameOf(l))}</a>`).join('')}</nav>`;
}

function publicHeader(clinic, lang, path) {
  return `<header class="top"><div class="wrap row">
    <a class="brand" href="/c/${esc(clinic.slug)}?lang=${lang}">${LOGO}<span><b>${esc(clinic.name)}</b><small>${esc([clinic.address, clinic.city].filter(Boolean).join(', '))}</small></span></a>
    ${langSwitch(lang, path)}</div></header>`;
}

// ---------- Patient / customer pages ----------
const stars = (v) => { const n = Math.round(v || 0); return '★'.repeat(n) + '☆'.repeat(5 - n); };

// Ratings for a clinic: overall, the four points, and the latest comments.
export function reviewsBlock(lang, summary, points, reviews) {
  if (!summary.count) return `<section class="card stack"><h2>${esc(t(lang, 'reviewsTitle'))}</h2><p class="muted">${esc(t(lang, 'noReviews'))}</p></section>`;
  return `<section class="card stack reviews"><h2>${esc(t(lang, 'reviewsTitle'))}</h2>
    <div class="rating-head"><b class="big-rating">${summary.overall.toFixed(1)}</b><span class="stars" aria-hidden="true">${stars(summary.overall)}</span><span class="muted">${esc(summary.count === 1 ? t(lang, 'oneReview') : t(lang, 'nReviews', { n: summary.count }))}</span></div>
    <div class="points">${points.map((p) => `<div><span>${esc(p.name)}</span><meter min="0" max="5" value="${summary[p.key]}">${summary[p.key].toFixed(1)}</meter><b>${summary[p.key].toFixed(1)}</b></div>`).join('')}</div>
    <div class="stack">${reviews.map((r) => `<article class="review"><div class="row"><b>${esc(r.author || '—')}</b><span class="stars small" aria-label="${r.overall.toFixed(1)}">${stars(r.overall)}</span><span class="muted small" dir="ltr">${esc(r.created_at.slice(0, 10))}</span></div>${r.comment ? `<p dir="auto">${esc(r.comment)}</p>` : ''}</article>`).join('')}</div>
  </section>`;
}

export function directoryPage(lang, categories) {
  const body = `<header class="top"><div class="wrap row">
    <a class="brand" href="/?lang=${lang}">${LOGO}<span><b>Nobat</b><small>${esc(t(lang, 'findTitle'))}</small></span></a>
    ${langSwitch(lang, '/')}</div></header>
  <main class="wrap stack">
    <form class="search card stack" id="searchForm" role="search">
      <h1>${esc(t(lang, 'findTitle'))}</h1>
      <div class="searchrow"><input id="q" type="search" placeholder="${esc(t(lang, 'findPh'))}" autocomplete="off" aria-label="${esc(t(lang, 'search'))}">
        <button class="btn primary">${esc(t(lang, 'search'))}</button>
        <button type="button" class="btn ghost" id="near">📍 ${esc(t(lang, 'nearMe'))}</button></div>
      <div class="kindtabs" role="group"><button type="button" class="chip" data-kind="" aria-pressed="true">${esc(t(lang, 'all'))}</button><button type="button" class="chip" data-kind="clinic" aria-pressed="false">${esc(t(lang, 'doctorsTab'))}</button><button type="button" class="chip" data-kind="salon" aria-pressed="false">${esc(t(lang, 'salonsTab'))}</button></div>
      <div class="cats" id="cats"></div>
      <p class="muted small" id="status" role="status"></p>
    </form>
    <div class="row"><div class="viewtabs" role="group"><button type="button" class="chip" data-view="list" aria-pressed="true">${esc(t(lang, 'listView'))}</button><button type="button" class="chip" data-view="map" aria-pressed="false">${esc(t(lang, 'mapView'))}</button></div></div>
    <div id="map" class="map" hidden></div>
    <div id="results" class="stack"></div>
    <p class="foot"><a href="/login">${esc(t(lang, 'staffSignIn'))}</a></p>
  </main>`;
  return page({
    title: 'Nobat', lang, body, script: ['vendor/leaflet/leaflet.js', 'search.js'], head: '<link rel="stylesheet" href="/static/vendor/leaflet/leaflet.css">',
    data: { lang, categories, t: dictFor(lang), catNames: Object.fromEntries(categories.map((c) => [c.key, c.name])) }
  });
}

export function clinicPage(clinic, doctors, lang, reviews = '') {
  const body = `${publicHeader(clinic, lang, `/c/${clinic.slug}`)}
  <main class="wrap stack">
    <h1>${esc(t(lang, 'chooseDoctor'))}</h1>
    <div class="cards">${doctors.map((d) => `
      <a class="card doc" href="/c/${esc(clinic.slug)}/d/${d.id}?lang=${lang}">
        <span class="av">${initials(d.name)}</span>
        <span><b>${esc(d.name)}</b><span class="muted">${esc(d.specialty || categoryName(d.category, lang))}</span>
        <span class="fee">${esc(t(lang, 'fee'))}: ${iqd(d.fee_iqd)} ${esc(t(lang, 'iqd'))}</span></span>
      </a>`).join('') || '<p class="muted">—</p>'}
    </div>
    ${reviews}
    <p class="foot">${esc(t(lang, 'poweredBy'))}</p>
  </main>`;
  return page({ title: clinic.name, lang, body, manifest: `/c/${clinic.slug}/manifest.webmanifest`, appName: clinic.name });
}

export function bookingPage(clinic, doctor, lang, dev, choose) {
  const body = `${publicHeader(clinic, lang, `/c/${clinic.slug}/d/${doctor.id}`)}
  <main class="wrap narrow stack">
    <section class="card stack">
      <div><h1>${esc(doctor.name)}</h1><p class="muted">${esc(doctor.specialty)} · ${esc(t(lang, 'fee'))}: ${iqd(doctor.fee_iqd)} ${esc(t(lang, 'iqd'))}</p></div>
      <h2>${esc(t(lang, 'pickDate'))}</h2>
      <div class="days" id="days"></div>
      <h2>${esc(t(lang, doctor.mode === 'time' ? 'byTime' : 'byQueue'))}</h2>
      <div id="pick"></div>
    </section>
    ${contactForm(lang, choose)}
    <p class="foot">${esc(t(lang, 'poweredBy'))}</p>
  </main>`;
  return page({ title: `${doctor.name} · ${clinic.name}`, lang, body, manifest: `/c/${clinic.slug}/manifest.webmanifest`, appName: clinic.name, script: 'book.js', data: { lang, dev, doctorId: doctor.id, mode: doctor.mode, t: dictFor(lang) } });
}

function contactForm(lang, choose) {
  return `<form class="card stack" id="form" novalidate hidden>
      <label>${esc(t(lang, 'name'))}<input id="name" autocomplete="name" maxlength="60" required></label>
      <label>${esc(t(lang, 'phone'))}<input id="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="0750 123 4567" maxlength="20" required></label>
      ${choose ? `<fieldset class="chan"><legend>${esc(t(lang, 'msgBy'))}</legend>
        <label class="check"><input type="radio" name="channel" value="whatsapp" checked> WhatsApp</label>
        <label class="check"><input type="radio" name="channel" value="sms"> SMS</label></fieldset>` : ''}
      <button type="button" class="btn ghost" id="sendCode">${esc(t(lang, 'sendCode'))}</button>
      <div id="codeBox" hidden class="stack">
        <p class="muted" id="codeMsg"></p>
        <label>${esc(t(lang, 'code'))}<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="4" dir="ltr" class="code"></label>
        <button class="btn primary big" id="confirm">${esc(t(lang, 'confirm'))}</button>
      </div>
      <p class="err" id="err" role="alert" hidden></p>
    </form>`;
}

export function salonPage(clinic, staff, services, lang, dev, choose, reviews = '') {
  const body = `${publicHeader(clinic, lang, `/c/${clinic.slug}`)}
  <main class="wrap narrow stack">
    <section class="card stack">
      <h2>1. ${esc(t(lang, 'chooseServices'))}</h2>
      <div class="svcs" id="svcs">${services.map((s) => `
        <label class="svc"><input type="checkbox" value="${s.id}" data-min="${s.minutes}" data-price="${s.price_iqd}">
          <span><b>${esc(s.name)}</b> <span class="muted">· ${s.minutes} ${esc(t(lang, 'minutes'))}</span></span><span class="fee">${iqd(s.price_iqd)} ${esc(t(lang, 'iqd'))}</span></label>`).join('')}
      </div>
      <h2>2. ${esc(t(lang, 'chooseStaff'))}</h2>
      <div class="staffrow" id="staff">
        <label class="staff"><input type="radio" name="staff" value="" checked><span class="av sm">★</span><b>${esc(t(lang, 'anyone'))}</b></label>
        ${staff.map((d) => `<label class="staff"><input type="radio" name="staff" value="${d.id}"><span class="av sm">${initials(d.name)}</span><b>${esc(d.name)}</b><span class="muted small">${esc(d.specialty)}</span></label>`).join('')}
      </div>
      <h2>3. ${esc(t(lang, 'chooseTime'))}</h2>
      <div class="days" id="days"></div>
      <div id="pick"></div>
      <div class="summary" id="summary" hidden></div>
    </section>
    ${contactForm(lang, choose)}
    ${reviews}
    <p class="foot">${esc(t(lang, 'poweredBy'))}</p>
  </main>`;
  return page({ title: clinic.name, lang, body, manifest: `/c/${clinic.slug}/manifest.webmanifest`, appName: clinic.name, script: 'salon-book.js', data: { lang, dev, clinicId: clinic.id, t: dictFor(lang) } });
}

export function unavailablePage(clinic, lang) {
  const body = `${publicHeader(clinic, lang, `/c/${clinic.slug}`)}
  <main class="wrap narrow stack"><section class="card stack center"><h1>${esc(t(lang, 'unavailable'))}</h1><p class="muted">${esc(t(lang, 'unavailableHint'))}</p>${clinic.phone ? `<p dir="ltr"><b>${esc(clinic.phone)}</b></p>` : ''}</section></main>`;
  return page({ title: clinic.name, lang, body });
}

export function ticketPage(booking, lang, points = []) {
  const salon = booking.clinic_kind === 'salon';
  const body = `<header class="top"><div class="wrap row"><span class="brand">${LOGO}<span><b>${esc(booking.clinic_name)}</b><small>${esc(booking.doctor_name)}</small></span></span>${langSwitch(lang, `/t/${booking.token}`)}</div></header>
  <main class="wrap narrow stack">
    <section class="ticket" id="ticket" aria-live="polite"></section>
    <form class="card stack" id="review" hidden></form>
    <p class="muted center">${esc(t(lang, salon ? 'keepLink' : 'keepOpen'))}</p>
    <button class="btn ghost" id="cancel" hidden>${esc(t(lang, 'cancel'))}</button>
    <p class="foot">${esc(t(lang, 'poweredBy'))}</p>
  </main>`;
  return page({ title: booking.clinic_name, lang, body, script: 'ticket.js', data: { lang, token: booking.token, salon, points, t: dictFor(lang) } });
}

// ---------- Staff pages ----------
export function loginPage(lang) {
  const L = staffDict(lang);
  const body = `<main class="wrap narrow stack login">
    <div class="row"><div class="brand big">${LOGO}<span><b>Nobat</b><small>${esc(L.signInTitle)}</small></span></div>${langSwitch(lang, '/login', STAFF_LANGS, (l) => staffDict(l).langName)}</div>
    <form class="card stack" id="login">
      <label>${esc(L.email)}<input id="email" type="email" autocomplete="username" dir="ltr" required></label>
      <label>${esc(L.password)}<input id="password" type="password" autocomplete="current-password" dir="ltr" required></label>
      <button class="btn primary big">${esc(L.signIn)}</button>
      <p class="err" id="err" role="alert" hidden></p>
    </form>
  </main>`;
  return page({ title: 'Nobat', lang, body, script: 'login.js', data: { t: { wrongLogin: L.wrongLogin, errGeneric: L.errGeneric, clinicOff: L.clinicOff } } });
}

function staffHeader(user, L, current) {
  const tabs = [['/app', L.today], ['/app/patients', L.patients], ['/app/reviews', L.reviews], ['/app/messages', L.messages]];
  if (user.role === 'owner') tabs.push(['/app/settings', L.settings]);
  return `<header class="top"><div class="wrap row">
    <a class="brand" href="/app">${LOGO}<span><b>Nobat</b><small>${esc(user.clinic_name)} · ${esc(user.name)}</small></span></a>
    <nav class="tabs">${tabs.map(([href, label]) => `<a href="${href}" ${href === current ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>
    <select id="staffLang" class="langsel" aria-label="Language">${STAFF_LANGS.map((l) => `<option value="${l}" ${l === user.lang ? 'selected' : ''}>${esc(staffDict(l).langName)}</option>`).join('')}</select>
    <button class="btn ghost small" id="logout">${esc(L.signOut)}</button></div></header>`;
}

function staffPage(user, clinic, current, title, main, script, data = {}) {
  const L = staffDict(user.lang, clinic.kind);
  return page({
    title: `${title} · Nobat`, lang: user.lang,
    body: `${staffHeader(user, L, current)}\n${main(L)}\n<div class="toast" id="toast" role="status"></div>`,
    script: ['staff.js', ...[].concat(script || [])],
    data: { t: L, kind: clinic.kind, role: user.role, clinicSlug: clinic.slug, ...data }
  });
}

export function receptionPage(user, clinic, doctors, live) {
  const salon = clinic.kind === 'salon';
  return staffPage(user, clinic, '/app', 'Today', (L) => `
  <main class="wrap stack">
    ${live ? '' : `<p class="note warn">${esc(L.notLive)}</p>`}
    <div class="row">
      ${salon ? '' : `<label class="inline">${esc(L.provider)} <select id="doctor">${doctors.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>`}
      <label class="inline">${esc(L.day)} <input type="date" id="date"></label>
      <span class="grow"></span>
      <a class="btn ghost small" id="posterLink">${esc(L.poster)}</a>
      <a class="btn ghost small" id="publicLink" target="_blank" rel="noopener">${esc(L.bookingPage)} ↗</a>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="split">
      <section class="card"><h2>${esc(L.queue)}</h2><div class="tablewrap"><table><thead><tr>${salon
        ? `<th>${esc(L.colTime)}</th><th>${esc(L.colPatient)}</th><th>${esc(L.colServices)}</th><th>${esc(L.provider)}</th><th>${esc(L.colStatus)}</th><th></th>`
        : `<th>${esc(L.colNo)}</th><th>${esc(L.colPatient)}</th><th>${esc(L.colTime)}</th><th>${esc(L.colStatus)}</th><th></th>`}</tr></thead><tbody id="rows"></tbody></table></div></section>
      <aside class="stack">
        ${salon ? '' : '<section class="card stack now" id="now"></section>'}
        <form class="card stack" id="walkin"><h2>${esc(salon ? L.addBooking : L.addWalkin)}</h2>
          <label>${esc(L.name)}<input id="wName" maxlength="60" required></label>
          <label>${esc(L.mobileOpt)}<input id="wPhone" type="tel" dir="ltr" maxlength="20"></label>
          ${salon ? `<fieldset class="svcpick"><legend>${esc(L.services)}</legend><div id="wServices"></div></fieldset>
          <label>${esc(L.provider)}<select id="wStaff"><option value="">${esc(L.anyone)}</option>${doctors.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>
          <label>${esc(L.time)}<input id="wTime" type="time" step="900" required></label>` : ''}
          <button class="btn ghost">${esc(salon ? L.addBookingBtn : L.addToQueue)}</button>
        </form>
      </aside>
    </div>
  </main>`, 'reception.js');
}

export function messagesPage(user, clinic, rows) {
  return staffPage(user, clinic, '/app/messages', 'Messages', (L) => `
  <main class="wrap stack">
    <h1>${esc(L.messages)}</h1>
    <p class="muted">${esc(L.messagesIntro)}</p>
    <section class="card"><div class="tablewrap"><table><thead><tr><th>${esc(L.mWhen)}</th><th>${esc(L.mTo)}</th><th>${esc(L.mType)}</th><th>${esc(L.mChannel)}</th><th>${esc(L.mStatus)}</th><th>${esc(L.mBody)}</th></tr></thead><tbody>
    ${rows.map((m) => `<tr><td class="nowrap" dir="ltr">${esc(m.created_at)}</td><td class="nowrap" dir="ltr">${esc(m.to_phone)}</td><td>${esc(m.kind)}</td><td>${esc(m.channel)}</td><td><span class="pill ${m.status === 'failed' ? 'bad' : m.status === 'sent' ? 'good' : ''}">${esc(m.status)}</span>${m.error ? `<div class="muted small">${esc(m.error)}</div>` : ''}</td><td dir="auto">${esc(m.body)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">${esc(L.noMessages)}</td></tr>`}
    </tbody></table></div></section>
  </main>`);
}

export function staffReviewsPage(user, clinic, summary, points, reviews) {
  const n = (v) => (v == null ? '–' : v.toFixed(1));
  return staffPage(user, clinic, '/app/reviews', 'Reviews', (L) => `
  <main class="wrap stack">
    <h1>${esc(L.reviews)}</h1>
    <p class="muted">${esc(L.reviewsIntro)}</p>
    <div class="kpis"><div class="kpi"><span>${esc(L.overall)}</span><b>${n(summary.overall)} <small class="muted">(${summary.count})</small></b></div>${points.slice(0, 3).map((p) => `<div class="kpi"><span>${esc(p.name)}</span><b>${n(summary[p.key])}</b></div>`).join('')}</div>
    <section class="card"><div class="tablewrap"><table><thead><tr><th>${esc(L.mWhen)}</th><th>${esc(L.colPatient)}</th><th>${esc(L.provider)}</th>${points.map((p) => `<th class="num">${esc(p.name)}</th>`).join('')}<th>${esc(L.comment)}</th></tr></thead><tbody>
      ${reviews.map((r) => `<tr><td class="nowrap" dir="ltr">${esc(r.created_at.slice(0, 10))}</td><td>${esc(r.author)}</td><td>${esc(r.doctor || '')}</td>${points.map((p) => `<td class="num">${'★'.repeat(r[p.key])}</td>`).join('')}<td dir="auto">${esc(r.comment)}</td></tr>`).join('') || `<tr><td colspan="${4 + points.length}" class="muted">${esc(L.noReviewsYet)}</td></tr>`}
    </tbody></table></div></section>
  </main>`);
}

export function settingsPage(user, clinic) {
  return staffPage(user, clinic, '/app/settings', 'Settings', () => '<main class="wrap stack" id="settings"></main>', 'settings.js');
}

export function patientsPage(user, clinic) {
  return staffPage(user, clinic, '/app/patients', 'Patients', (L) => `
  <main class="wrap stack">
    <h1>${esc(L.patients)}</h1>
    <input id="q" type="search" placeholder="${esc(L.search)}" autocomplete="off">
    <section class="card"><div class="tablewrap"><table><thead><tr><th>${esc(L.name)}</th><th>${esc(L.mobile)}</th><th>${esc(L.lastVisit)}</th><th>${esc(L.visits)}</th></tr></thead><tbody id="rows"></tbody></table></div></section>
  </main>`, 'patients.js');
}

export function patientFilePage(user, clinic, patientId) {
  return staffPage(user, clinic, '/app/patients', 'Patient', () => '<main class="wrap stack" id="file"></main>', 'patient-file.js', { patientId });
}

export function posterPage(clinic, doctor, url, qrSvg) {
  const who = doctor ? `<p class="p-doc">${esc(doctor.name)}</p><p class="p-spec">${esc(doctor.specialty)}</p>` : '';
  const salon = clinic.kind === 'salon';
  const body = `<div class="noprint bar"><button class="btn primary" id="print">Print / چاپکردن / طباعة</button><span class="muted">A4 / A5</span></div>
  <article class="poster">
    <header><div class="p-brand">${LOGO}<b>${esc(clinic.name)}</b></div>${who}</header>
    <h1 class="p-ku" dir="rtl" lang="ckb">${salon ? 'نۆرەکەت بە مۆبایل بگرە' : 'نۆرەی دکتۆر بە مۆبایل بگرە'}</h1>
    <p class="p-ar" dir="rtl" lang="ar">${salon ? 'احجز موعدك من الموبايل' : 'احجز دورك عند الطبيب من الموبايل'}</p>
    <p class="p-en">${salon ? 'Book your appointment on your phone' : 'Book your turn with the doctor on your phone'}</p>
    <div class="qr">${qrSvg}</div>
    <p class="p-url" dir="ltr">${esc(url.replace(/^https?:\/\//, ''))}</p>
    <ol class="p-steps">
      <li><b dir="rtl" lang="ckb">کامێرای مۆبایلەکەت بکەرەوە و سکانی بکە</b><span>Open your camera and scan · افتح الكاميرا وامسح الرمز</span></li>
      <li><b dir="rtl" lang="ckb">${salon ? 'خزمەتگوزاری و کات هەڵبژێرە' : 'ژمارەی نۆرە یان کات هەڵبژێرە'}</b><span>${salon ? 'Choose a service and time · اختر الخدمة والوقت' : 'Choose a number or time · اختر رقماً أو وقتاً'}</span></li>
      <li><b dir="rtl" lang="ckb">کاتێک نۆرەت نزیک بوو نامەت بۆ دێت</b><span>Get a message when your turn is close · تصلك رسالة عند اقتراب دورك</span></li>
    </ol>
    <footer>Nobat</footer>
  </article>`;
  return page({ title: `QR · ${clinic.name}`, lang: 'en', body, script: 'poster.js', bodyClass: 'poster-page' });
}
