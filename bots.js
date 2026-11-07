// Original robot marks. No third-party artwork.

const wrap = (inner) =>
  `<svg class="bot-svg" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;

const eye = (cx, cy) => `<circle class="eye" cx="${cx}" cy="${cy}" r="2.5"/>`;

export const AVATARS = {
  scanner: wrap(`
    <g class="radar">
      <circle cx="32" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.45"/>
      <g class="sweep">
        <animateTransform attributeName="transform" type="rotate" from="0 32 13" to="360 32 13" dur="2.8s" repeatCount="indefinite"/>
        <path d="M32 13 L38.2 11.2 A7 7 0 0 0 34.2 6.4 Z" fill="currentColor" opacity="0.7"/>
      </g>
      <circle cx="32" cy="13" r="1.3" fill="currentColor"/>
    </g>
    <path d="M32 20 V25" stroke="currentColor" stroke-width="1.4"/>
    <rect x="15" y="25" width="34" height="24" rx="8" fill="#07140c" stroke="currentColor" stroke-width="1.6"/>
    <g class="eyes">${eye(25, 36)}${eye(39, 36)}</g>
    <path d="M24 43 H40" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>
  `),
  copy: wrap(`
    <path d="M18 12 V18 M46 12 V18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="18" cy="10" r="2" fill="currentColor"/>
    <circle cx="46" cy="10" r="2" fill="currentColor" opacity="0.55"/>
    <rect x="14" y="22" width="28" height="24" rx="8" fill="#07140c" stroke="currentColor" stroke-width="1.6"/>
    <rect x="34" y="26" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.45"/>
    <g class="eyes">${eye(23, 33)}${eye(33, 33)}</g>
    <g class="sweep">
      <animateTransform attributeName="transform" type="rotate" from="0 42 34" to="360 42 34" dur="3.2s" repeatCount="indefinite"/>
      <path d="M42 34 L47 32.6 A5 5 0 0 0 44 29.2 Z" fill="currentColor" opacity="0.65"/>
    </g>
  `),
  rug: wrap(`
    <path d="M32 8 L36 16 H28 Z" fill="currentColor"/>
    <rect x="14" y="20" width="36" height="26" rx="6" fill="#07140c" stroke="currentColor" stroke-width="1.6"/>
    <g class="eyes">${eye(24, 32)}${eye(40, 32)}</g>
    <path d="M24 40 Q32 36 40 40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <g class="sweep">
      <animateTransform attributeName="transform" type="rotate" from="0 32 12" to="360 32 12" dur="2.4s" repeatCount="indefinite"/>
      <path d="M32 12 L36.4 10.6 A4.5 4.5 0 0 0 33.6 7.8 Z" fill="currentColor" opacity="0.8"/>
    </g>
  `),
  trend: wrap(`
    <path d="M16 18 H48" stroke="currentColor" stroke-width="1.3" opacity="0.5"/>
    <path d="M18 18 L28 10 L36 15 L48 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="15" y="24" width="34" height="24" rx="8" fill="#07140c" stroke="currentColor" stroke-width="1.6"/>
    <g class="eyes">${eye(26, 35)}${eye(38, 35)}</g>
    <g class="sweep">
      <animateTransform attributeName="transform" type="rotate" from="0 32 14" to="360 32 14" dur="3s" repeatCount="indefinite"/>
      <path d="M32 14 L37 12.4 A5.5 5.5 0 0 0 33.8 8.8 Z" fill="currentColor" opacity="0.7"/>
    </g>
  `),
  scout: wrap(`
    <path d="M12 28 H52" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M18 28 C18 16 46 16 46 28" fill="#07140c" stroke="currentColor" stroke-width="1.6"/>
    <rect x="16" y="28" width="32" height="20" rx="7" fill="#07140c" stroke="currentColor" stroke-width="1.6"/>
    <g class="eyes">${eye(26, 37)}${eye(38, 37)}</g>
    <circle cx="50" cy="18" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <g class="sweep">
      <animateTransform attributeName="transform" type="rotate" from="0 50 18" to="360 50 18" dur="2.6s" repeatCount="indefinite"/>
      <path d="M50 18 L54.2 16.6 A4.4 4.4 0 0 0 51.6 13.8 Z" fill="currentColor" opacity="0.75"/>
    </g>
  `),
  recap: wrap(`
    <path d="M40 10 A6 6 0 1 0 46 18 H40 Z" fill="currentColor" opacity="0.85"/>
    <rect x="15" y="24" width="34" height="24" rx="12" fill="#07140c" stroke="currentColor" stroke-width="1.6"/>
    <g class="eyes">${eye(26, 35)}${eye(38, 35)}</g>
    <path d="M26 43 Q32 46 38 43" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <g class="sweep">
      <animateTransform attributeName="transform" type="rotate" from="0 43 14" to="360 43 14" dur="3.6s" repeatCount="indefinite"/>
      <path d="M43 14 L47 12.8 A4 4 0 0 0 44.4 10.2 Z" fill="currentColor" opacity="0.7"/>
    </g>
  `),
};

export function botAvatar(id) {
  return AVATARS[id] || AVATARS.scanner;
}
