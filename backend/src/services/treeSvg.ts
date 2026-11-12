import type { TreeLevel } from "../config/treeLevels";

/** Tiny SVG per level — no external assets. */
export function renderTreeSvg(level: TreeLevel, serial: number | string): string {
  const title = `EcoTree #${serial} (${level})`;
  const scenes: Record<TreeLevel, string> = {
    seed: `
      <ellipse cx="100" cy="150" rx="18" ry="12" fill="#8B5A2B"/>
      <circle cx="100" cy="138" r="10" fill="#6B8E23"/>
    `,
    sprout: `
      <rect x="96" y="110" width="8" height="50" fill="#4a7c3f"/>
      <ellipse cx="88" cy="105" rx="16" ry="10" fill="#7CB342" transform="rotate(-25 88 105)"/>
      <ellipse cx="112" cy="105" rx="16" ry="10" fill="#8BC34A" transform="rotate(25 112 105)"/>
      <ellipse cx="100" cy="165" rx="40" ry="8" fill="#3E2723" opacity="0.35"/>
    `,
    sapling: `
      <rect x="94" y="90" width="12" height="70" fill="#5D4037"/>
      <circle cx="100" cy="85" r="36" fill="#66BB6A"/>
      <circle cx="78" cy="95" r="22" fill="#81C784"/>
      <circle cx="122" cy="95" r="22" fill="#43A047"/>
      <ellipse cx="100" cy="168" rx="48" ry="9" fill="#3E2723" opacity="0.35"/>
    `,
    tree: `
      <rect x="92" y="80" width="16" height="85" fill="#4E342E"/>
      <circle cx="100" cy="70" r="48" fill="#2E7D32"/>
      <circle cx="70" cy="85" r="30" fill="#43A047"/>
      <circle cx="130" cy="85" r="30" fill="#388E3C"/>
      <circle cx="100" cy="55" r="28" fill="#66BB6A"/>
      <ellipse cx="100" cy="172" rx="55" ry="10" fill="#3E2723" opacity="0.4"/>
    `,
    forest: `
      <rect x="40" y="100" width="12" height="60" fill="#5D4037"/>
      <circle cx="46" cy="90" r="28" fill="#2E7D32"/>
      <rect x="92" y="75" width="16" height="85" fill="#4E342E"/>
      <circle cx="100" cy="65" r="45" fill="#1B5E20"/>
      <circle cx="75" cy="80" r="28" fill="#388E3C"/>
      <circle cx="125" cy="80" r="28" fill="#43A047"/>
      <rect x="148" y="105" width="12" height="55" fill="#5D4037"/>
      <circle cx="154" cy="95" r="26" fill="#2E7D32"/>
      <ellipse cx="100" cy="172" rx="70" ry="11" fill="#3E2723" opacity="0.4"/>
    `
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b3d2e"/>
      <stop offset="100%" stop-color="#062418"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#sky)"/>
  ${scenes[level]}
  <text x="100" y="24" text-anchor="middle" fill="#b8ffd4" font-family="Georgia, serif" font-size="12">${title}</text>
</svg>`;
}
