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
  spa: { tone: 'teal', svg: svg('<path d="M12 20c-4 0-8-2.5-8-7 3 0 5.5 1 8 4 2.5-3 5-4 8-4 0 4.5-4 7-8 7z"/><path d="M12 17c-1.8-2-2.8-4.3-2.8-6.8C9.2 7.5 10.4 5 12 3c1.6 2 2.8 4.5 2.8 7.2 0 2.5-1 4.8-2.8 6.8z"/>') },
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
  <circle cx="410" cy="78" r="46" fill="#C69563"/>
  <circle cx="410" cy="78" r="64" fill="#C69563" opacity=".18"/>
  <path d="M0 230 L70 150 L120 190 L190 110 L250 170 L300 130 L370 200 L430 150 L520 220 V300 H0Z" fill="#1B2A4A" opacity=".35"/>
  <path d="M0 255 L60 205 L130 240 L200 175 L270 230 L340 185 L410 240 L470 205 L520 235 V300 H0Z" fill="#1B2A4A" opacity=".6"/>
  <path d="M190 110 L210 132 L198 130 L190 140 L182 128 L172 133Z" fill="#fff" opacity=".9"/>
  <path d="M300 130 L314 146 L305 145 L300 152 L294 144 L288 148Z" fill="#fff" opacity=".9"/>
  <rect x="70" y="190" width="120" height="80" rx="10" fill="#fff"/>
  <path d="M60 196 L130 158 L200 196Z" fill="#A8693C"/>
  <rect x="118" y="214" width="24" height="56" rx="4" fill="#1B2A4A"/>
  <rect x="84" y="210" width="24" height="20" rx="4" fill="#E3E8F2"/>
  <rect x="152" y="210" width="24" height="20" rx="4" fill="#E3E8F2"/>
  <rect x="124" y="170" width="12" height="4" rx="2" fill="#fff"/><rect x="128" y="166" width="4" height="12" rx="2" fill="#fff"/>
  <g transform="rotate(8 330 190)">
    <rect x="280" y="96" width="104" height="186" rx="18" fill="#10223A"/>
    <rect x="288" y="108" width="88" height="162" rx="12" fill="#fff"/>
    <rect x="296" y="120" width="72" height="56" rx="10" fill="#1B2A4A"/>
    <text x="332" y="160" text-anchor="middle" font-family="Vazirmatn Variable, sans-serif" font-size="30" font-weight="800" fill="#fff">14</text>
    <rect x="296" y="186" width="72" height="8" rx="4" fill="#E6EEF0"/><rect x="296" y="186" width="46" height="8" rx="4" fill="#C69563"/>
    <rect x="296" y="204" width="50" height="7" rx="3.5" fill="#D9E2E5"/><rect x="296" y="218" width="64" height="7" rx="3.5" fill="#D9E2E5"/>
    <rect x="296" y="240" width="72" height="20" rx="10" fill="#A8693C"/>
  </g>
  <g fill="#A8693C"><circle cx="452" cy="170" r="5"/><circle cx="470" cy="150" r="3"/><circle cx="236" cy="70" r="4" fill="#1B2A4A"/></g>
  </g>
</svg>`;

// Calm picture for the salons and spa pages until a real photo is added: an arch, leaves, stones and a candle.
export const BEAUTY_ART = `<svg class="hero-art" viewBox="0 0 520 320" aria-hidden="true" focusable="false">
  <defs><clipPath id="beauty-clip"><rect width="520" height="320" rx="28"/></clipPath></defs>
  <g clip-path="url(#beauty-clip)">
    <rect width="520" height="320" fill="#EFE6DA"/>
    <path d="M150 320V150a110 110 0 0 1 220 0v170Z" fill="#E3D3BF"/>
    <circle cx="260" cy="120" r="34" fill="#F6EEE3"/>
    <g fill="#7E9C7F">
      <path d="M95 320C80 250 60 210 20 185c45 5 80 40 95 135Z"/>
      <path d="M118 320c-5-80 10-140 55-185-15 60-25 120-25 185Z" fill="#5F7F63"/>
      <path d="M80 320c-40-40-70-55-110-55 40-20 85-10 125 55Z" fill="#9DB59B"/>
    </g>
    <g fill="#5F7F63">
      <path d="M430 320c5-70-10-125-45-165 30 15 65 70 70 165Z"/>
      <path d="M455 320c20-60 45-95 85-110-30 35-50 70-60 110Z" fill="#7E9C7F"/>
      <path d="M410 250c-30-20-55-22-80-15 25-20 55-25 85 0Z" fill="#9DB59B"/>
    </g>
    <ellipse cx="260" cy="300" rx="120" ry="14" fill="#D8C6AE"/>
    <ellipse cx="225" cy="285" rx="34" ry="16" fill="#B9A58C"/>
    <ellipse cx="270" cy="270" rx="26" ry="13" fill="#CDBBA3"/>
    <ellipse cx="300" cy="258" rx="18" ry="9" fill="#A8937A"/>
    <rect x="330" y="240" width="26" height="46" rx="5" fill="#F8F3EC"/>
    <path d="M343 222c5 7 6 12 0 18-6-6-5-11 0-18Z" fill="#E9B46B"/>
    <circle cx="343" cy="232" r="14" fill="#F3D8A7" opacity=".35"/>
  </g>
</svg>`;

// Pictures for the Barbers, Spa and Women's salons cards until real photos are added.
const moodSvg = (bg, inner) => `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="400" height="260" fill="${bg}"/>${inner}</svg>`;
const leaves = (x, y, s, c1, c2) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 120C-4 70 6 30 30 0c4 40-6 80-30 120Z" fill="${c1}"/><path d="M0 120c-30-30-50-40-80-38 26-18 60-12 80 38Z" fill="${c2}"/><path d="M0 120c20-34 42-48 72-50-22 16-40 30-72 50Z" fill="${c1}" opacity=".8"/></g>`;
export const MOOD_ART = {
  barber_men: moodSvg('#E6D6C3', `
    <circle cx="300" cy="70" r="90" fill="#EFE3D4"/>
    <rect x="96" y="40" width="34" height="170" rx="17" fill="#FBF7F1"/>
    <clipPath id="pole"><rect x="96" y="40" width="34" height="170" rx="17"/></clipPath>
    <g clip-path="url(#pole)" fill="#B5674D" opacity=".85"><path d="M80 60l70-40v18l-70 40Z"/><path d="M80 110l70-40v18l-70 40Z"/><path d="M80 160l70-40v18l-70 40Z"/><path d="M80 210l70-40v18l-70 40Z"/></g>
    <rect x="90" y="28" width="46" height="16" rx="8" fill="#3B3A36"/><rect x="90" y="206" width="46" height="16" rx="8" fill="#3B3A36"/>
    <g fill="none" stroke="#3B3A36" stroke-width="7" stroke-linecap="round"><circle cx="230" cy="190" r="18"/><circle cx="290" cy="190" r="18"/><path d="M243 177 312 80M277 177 208 80"/></g>
    ${leaves(360, 140, .9, '#7E9C7F', '#9DB59B')}`),
  spa: moodSvg('#DCE4D4', `
    <circle cx="200" cy="90" r="80" fill="#E8EEE1"/>
    ${leaves(80, 150, 1, '#5F7F63', '#7E9C7F')}
    ${leaves(330, 160, .85, '#7E9C7F', '#9DB59B')}
    <ellipse cx="200" cy="240" rx="120" ry="14" fill="#C8D3BD"/>
    <ellipse cx="200" cy="222" rx="56" ry="20" fill="#9C8F7E"/>
    <ellipse cx="200" cy="190" rx="42" ry="16" fill="#B7A995"/>
    <ellipse cx="200" cy="164" rx="30" ry="12" fill="#CFC3B0"/>
    <ellipse cx="200" cy="144" rx="18" ry="8" fill="#E4DACB"/>
    <path d="M200 120c10 -16 26 -22 40 -20-6 16-22 24-40 20Z" fill="#5F7F63"/>`),
  salon_women: moodSvg('#F0DFD6', `
    <circle cx="210" cy="110" r="78" fill="#F8EDE7" stroke="#D9B8A6" stroke-width="10"/>
    <rect x="203" y="186" width="14" height="60" rx="7" fill="#D9B8A6"/>
    <path d="M150 230h120" stroke="#C99B85" stroke-width="10" stroke-linecap="round"/>
    ${leaves(70, 130, 1, '#8FA88D', '#B3C4AA')}
    <g transform="translate(300 60) rotate(20)"><rect width="22" height="120" rx="6" fill="#B5674D"/><g stroke="#B5674D" stroke-width="5">${Array.from({ length: 8 }, (_, i) => `<path d="M22 ${10 + i * 14}h22"/>`).join('')}</g></g>
    <circle cx="190" cy="92" r="10" fill="#fff" opacity=".7"/>`)
};

// Tall pictures for the three big choices on the home page, until real photos are added.
const doorSvg = (bg, inner) => `<svg viewBox="0 0 300 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="300" height="420" fill="${bg}"/>${inner}</svg>`;
export const DOOR_ART = {
  clinic: doorSvg('#DCE4F0', `
    <circle cx="225" cy="150" r="46" fill="#C69563"/><circle cx="225" cy="150" r="66" fill="#C69563" opacity=".2"/>
    <path d="M0 330 60 250l40 40 60-90 50 70 40-40 50 60v130H0Z" fill="#1B2A4A" opacity=".35"/>
    <path d="M0 360 50 320l60 30 60-50 60 40 70-30v130H0Z" fill="#1B2A4A" opacity=".6"/>
    <rect x="70" y="250" width="130" height="110" rx="12" fill="#fff"/>
    <path d="M58 258 135 214l77 44Z" fill="#A8693C"/>
    <rect x="120" y="290" width="30" height="70" rx="5" fill="#1B2A4A"/>
    <rect x="84" y="282" width="26" height="22" rx="5" fill="#E3E8F2"/><rect x="160" y="282" width="26" height="22" rx="5" fill="#E3E8F2"/>
    <rect x="128" y="228" width="14" height="5" rx="2" fill="#fff"/><rect x="132.5" y="223.5" width="5" height="14" rx="2" fill="#fff"/>`),
  salon: doorSvg('#EFE3D6', `
    <path d="M60 420V170a90 90 0 0 1 180 0v250Z" fill="#E4D2BE"/>
    <circle cx="150" cy="190" r="62" fill="#F8EFE6" stroke="#D2AE97" stroke-width="10"/>
    <rect x="144" y="252" width="12" height="70" rx="6" fill="#D2AE97"/><path d="M105 325h90" stroke="#C3957E" stroke-width="10" stroke-linecap="round"/>
    <g transform="translate(205 120) rotate(18)"><rect width="18" height="96" rx="5" fill="#B5674D"/><g stroke="#B5674D" stroke-width="4">${Array.from({ length: 7 }, (_, i) => `<path d="M18 ${8 + i * 13}h18"/>`).join('')}</g></g>
    <g fill="none" stroke="#3B3A36" stroke-width="6" stroke-linecap="round"><circle cx="70" cy="395" r="13"/><circle cx="110" cy="395" r="13"/><path d="M80 385 128 318M100 385 52 318"/></g>
    ${leaves(270, 300, .9, '#7E9C7F', '#9DB59B')}`),
  spa: doorSvg('#DCE5D4', `
    <circle cx="150" cy="150" r="80" fill="#EAF0E3"/>
    ${leaves(40, 290, 1.1, '#5F7F63', '#7E9C7F')}
    ${leaves(275, 300, 1, '#7E9C7F', '#9DB59B')}
    <ellipse cx="150" cy="400" rx="130" ry="18" fill="#C8D3BD"/>
    <ellipse cx="150" cy="378" rx="62" ry="22" fill="#9C8F7E"/>
    <ellipse cx="150" cy="342" rx="46" ry="17" fill="#B7A995"/>
    <ellipse cx="150" cy="313" rx="33" ry="13" fill="#CFC3B0"/>
    <ellipse cx="150" cy="291" rx="20" ry="9" fill="#E4DACB"/>
    <path d="M150 264c11-18 29-24 44-22-7 18-25 26-44 22Z" fill="#5F7F63"/>
    <path d="M150 264c-9-14-24-19-36-17 6 14 20 20 36 17Z" fill="#7E9C7F"/>`)
};
