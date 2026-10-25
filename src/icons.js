// Small line icons (24×24, drawn with the current text color) for search categories, plus a color for each tile.
const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const CATEGORY_ICONS = {
  gp: { tone: 'teal', svg: svg('<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>') },
  dentist: { tone: 'sky', svg: svg('<path d="M7 3c-2.5 0-4 2-4 4.5 0 3 1.5 4.5 2 7.5.4 2.5 1 6 2.5 6s1.8-4 4.5-4 3 4 4.5 4 2.1-3.5 2.5-6c.5-3 2-4.5 2-7.5C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z"/>') },
  children: { tone: 'sun', svg: svg('<circle cx="12" cy="13" r="7"/><path d="M12 6c0-2 1.5-3 3-3"/><circle cx="9.5" cy="12" r=".6" fill="currentColor"/><circle cx="14.5" cy="12" r=".6" fill="currentColor"/><path d="M9.5 15.5c1.4 1.2 3.6 1.2 5 0"/>') },
  women: { tone: 'rose', svg: svg('<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V22M8.5 18.5h7"/>') },
  heart: { tone: 'coral', svg: svg('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/><path d="M5 12h3l1.5-2.5 2 5 1.5-2.5H19"/>') },
  skin: { tone: 'peach', svg: svg('<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>') },
  eyes: { tone: 'sky', svg: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>') },
  ent: { tone: 'violet', svg: svg('<path d="M8 20c2 0 2.5-1.5 3-3 .6-1.8 2-2.5 3-3.6A5.5 5.5 0 1 0 6.5 9"/><path d="M10.5 9.5a2 2 0 1 1 3 1.7"/>') },
  bones: { tone: 'sand', svg: svg('<path d="M17 4a2.5 2.5 0 0 1 2.4 3.2A2.5 2.5 0 1 1 17 11l-6 6a2.5 2.5 0 1 1-4.2 2.4A2.5 2.5 0 1 1 7 13l6-6a2.5 2.5 0 0 1 4-3z"/>') },
  internal: { tone: 'teal', svg: svg('<path d="M9 3v4c0 1.5-1 2-2.5 2.5S4 11 4 13c0 4 3 7 7 7 3 0 4-2 6-2s3 1 3-2c0-2-2-3-4-3-1.5 0-2-1-2-2.5V3"/>') },
  nerves: { tone: 'violet', svg: svg('<path d="M12 4.5A3.5 3.5 0 0 0 5.6 6 3.5 3.5 0 0 0 4 12a3.5 3.5 0 0 0 2 5.5A3.5 3.5 0 0 0 12 19.5"/><path d="M12 4.5A3.5 3.5 0 0 1 18.4 6 3.5 3.5 0 0 1 20 12a3.5 3.5 0 0 1-2 5.5 3.5 3.5 0 0 1-6 2V4.5z"/>') },
  urology: { tone: 'rose', svg: svg('<path d="M9 4C5.5 4 4 7 4 10.5S6 18 9 18c2 0 2.5-2 2.5-4s-1.5-2-1.5-4S11 7 11 6 10.5 4 9 4z"/><path d="M15 4c3.5 0 5 3 5 6.5S18 18 15 18c-2 0-2.5-2-2.5-4s1.5-2 1.5-4-1-3-1-4 .5-2 2-2z"/>') },
  mental: { tone: 'sun', svg: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>') },
  physio: { tone: 'teal', svg: svg('<circle cx="13" cy="4.5" r="2"/><path d="M5 11l4-2 4 1 3 4"/><path d="M9 9l1 6-3 6M10 15l5 2 2 4"/>') },
  barber_men: { tone: 'ink', svg: svg('<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.2 16 17 4M15.8 16 7 4"/>') },
  salon_women: { tone: 'rose', svg: svg('<path d="M5 21c0-6 1-11 4-14 2-2 6-2 8 0 3 3 2 8 2 14"/><path d="M9 7c1 3 3 4 6 4"/><path d="M12 14c-1 2-1 5-1 7"/>') },
  nails: { tone: 'coral', svg: svg('<rect x="8" y="11" width="8" height="10" rx="2"/><path d="M10 11V7h4v4M11 7V3h2v4"/>') },
  makeup: { tone: 'peach', svg: svg('<path d="M9 22v-9h6v9z"/><path d="M10 13V7.5L14 4v9"/>') },
  kids_hair: { tone: 'sun', svg: svg('<path d="M4 7h16M4 7v3M8 7v3M12 7v3M16 7v3M20 7v3"/><path d="M8 14c0 4 2 7 4 7s4-3 4-7"/>') }
};

// One of eight colors for an avatar, always the same for the same name.
export function avatarTone(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `t${h % 8}`;
}

// Hero picture for the home page: layered Zagros mountains, the sun, a clinic and a phone with a booking ticket.
export const HERO_ART = `<svg class="hero-art" viewBox="0 0 520 300" aria-hidden="true" focusable="false">
  <defs><clipPath id="hero-clip"><rect width="520" height="300" rx="26"/></clipPath></defs>
  <g clip-path="url(#hero-clip)">
  <circle cx="410" cy="78" r="46" fill="#FFC53D"/>
  <circle cx="410" cy="78" r="64" fill="#FFC53D" opacity=".18"/>
  <path d="M0 230 L70 150 L120 190 L190 110 L250 170 L300 130 L370 200 L430 150 L520 220 V300 H0Z" fill="#0B8F7A" opacity=".35"/>
  <path d="M0 255 L60 205 L130 240 L200 175 L270 230 L340 185 L410 240 L470 205 L520 235 V300 H0Z" fill="#0B8F7A" opacity=".6"/>
  <path d="M190 110 L210 132 L198 130 L190 140 L182 128 L172 133Z" fill="#fff" opacity=".9"/>
  <path d="M300 130 L314 146 L305 145 L300 152 L294 144 L288 148Z" fill="#fff" opacity=".9"/>
  <rect x="70" y="190" width="120" height="80" rx="10" fill="#fff"/>
  <path d="M60 196 L130 158 L200 196Z" fill="#FF6F59"/>
  <rect x="118" y="214" width="24" height="56" rx="4" fill="#0B8F7A"/>
  <rect x="84" y="210" width="24" height="20" rx="4" fill="#D7F3EC"/>
  <rect x="152" y="210" width="24" height="20" rx="4" fill="#D7F3EC"/>
  <rect x="124" y="170" width="12" height="4" rx="2" fill="#fff"/><rect x="128" y="166" width="4" height="12" rx="2" fill="#fff"/>
  <g transform="rotate(8 330 190)">
    <rect x="280" y="96" width="104" height="186" rx="18" fill="#10223A"/>
    <rect x="288" y="108" width="88" height="162" rx="12" fill="#fff"/>
    <rect x="296" y="120" width="72" height="56" rx="10" fill="#0B8F7A"/>
    <text x="332" y="160" text-anchor="middle" font-family="Vazirmatn Variable, sans-serif" font-size="30" font-weight="800" fill="#fff">14</text>
    <rect x="296" y="186" width="72" height="8" rx="4" fill="#E6EEF0"/><rect x="296" y="186" width="46" height="8" rx="4" fill="#FFC53D"/>
    <rect x="296" y="204" width="50" height="7" rx="3.5" fill="#D9E2E5"/><rect x="296" y="218" width="64" height="7" rx="3.5" fill="#D9E2E5"/>
    <rect x="296" y="240" width="72" height="20" rx="10" fill="#FF6F59"/>
  </g>
  <g fill="#FF6F59"><circle cx="452" cy="170" r="5"/><circle cx="470" cy="150" r="3"/><circle cx="236" cy="70" r="4" fill="#0B8F7A"/></g>
  </g>
</svg>`;
