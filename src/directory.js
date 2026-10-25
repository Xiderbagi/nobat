// Public search: find clinics and salons by category or words, nearest first, featured (paid) ones on top.
import { CATEGORIES, categoriesForText, fold, isCategory, REVIEW_POINTS } from './categories.js';
import { localParts } from './util.js';
import { avatarTone } from './icons.js';

// Distance in km between two points on Earth.
export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export const isFeatured = (c, today = localParts().date) => Boolean(c.featured_until && c.featured_until >= today);

export function ratingSummary(db, clinicId) {
  const r = db.prepare(`SELECT COUNT(*) AS n, AVG(overall) AS overall, AVG(a1) AS a1, AVG(a2) AS a2, AVG(a3) AS a3, AVG(a4) AS a4
    FROM reviews WHERE clinic_id = ? AND hidden = 0`).get(clinicId);
  const round = (v) => (v == null ? null : Math.round(v * 10) / 10);
  return { count: r.n, overall: round(r.overall), a1: round(r.a1), a2: round(r.a2), a3: round(r.a3), a4: round(r.a4) };
}

export function search(db, { q = '', cat = '', lat = null, lng = null, kind = '', limit = 50 } = {}, now = new Date()) {
  const today = localParts(now).date;
  const words = fold(q).split(/\s+/).filter((w) => w.length >= 2);
  const textCats = categoriesForText(q);
  const filterCat = isCategory(cat) ? cat : null;
  const here = Number.isFinite(lat) && Number.isFinite(lng);

  const clinics = db.prepare("SELECT * FROM clinics WHERE status != 'off' AND listed = 1").all();
  const doctorsOf = db.prepare('SELECT id, name, specialty, category, fee_iqd FROM doctors WHERE clinic_id = ? AND active = 1 ORDER BY name');
  const results = [];

  for (const c of clinics) {
    if (kind && c.kind !== kind) continue;
    const doctors = doctorsOf.all(c.id);
    if (!doctors.length) continue; // nothing to book yet
    const tags = c.tags ? c.tags.split(',').filter(isCategory) : [];
    const cats = new Set([...tags, ...doctors.map((d) => d.category).filter(isCategory)]);

    // Which doctors match decides which ones the result shows (salons show the whole salon).
    let matched = doctors;
    if (filterCat) {
      if (!cats.has(filterCat)) continue;
      if (c.kind === 'clinic') matched = doctors.filter((d) => d.category === filterCat);
    }
    let score = 0;
    if (words.length) {
      const byCat = textCats.filter((k) => cats.has(k));
      const clinicText = fold(`${c.name} ${c.city} ${c.address}`);
      const textHit = (d) => words.some((w) => fold(`${d.name} ${d.specialty}`).includes(w));
      const nameHit = words.some((w) => clinicText.includes(w));
      if (!byCat.length && !nameHit && !doctors.some(textHit)) continue;
      if (c.kind === 'clinic' && byCat.length && !nameHit) matched = matched.filter((d) => byCat.includes(d.category) || textHit(d));
      else if (c.kind === 'clinic' && !nameHit && !byCat.length) matched = matched.filter(textHit);
      if (!matched.length) matched = doctors;
      score = (nameHit ? 2 : 0) + (byCat.length ? 1 : 0);
    }
    const dist = here && c.lat != null && c.lng != null ? distanceKm(lat, lng, c.lat, c.lng) : null;
    results.push({
      id: c.id, slug: c.slug, name: c.name, kind: c.kind, city: c.city, address: c.address, tone: avatarTone(c.name),
      lat: c.lat, lng: c.lng, distanceKm: dist == null ? null : Math.round(dist * 10) / 10,
      featured: isFeatured(c, today), categories: [...cats], score,
      rating: ratingSummary(db, c.id),
      doctors: matched.slice(0, 4).map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, category: d.category, fee: d.fee_iqd }))
    });
  }

  // Featured first; then nearest (when we know where the patient is), then best match, best rated, name.
  results.sort((a, b) =>
    (b.featured - a.featured)
    || (here ? (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) : 0)
    || (b.score - a.score)
    || ((b.rating.overall ?? 0) - (a.rating.overall ?? 0))
    || a.name.localeCompare(b.name));
  return results.slice(0, limit).map(({ score, ...r }) => r);
}

export function categoriesFor(lang) {
  return CATEGORIES.map((c) => ({ key: c.key, kind: c.kind, name: c[lang] || c.en }));
}

export function reviewPoints(kind, lang) {
  return (REVIEW_POINTS[kind] || REVIEW_POINTS.clinic).map((p) => ({ key: p.key, name: p[lang] || p.en }));
}
