import type { ThemeId } from '../../core/session';

/**
 * Static poster with the same composition as the live scene. Shown while the renderer
 * loads, when motion is off and the renderer is unavailable, and as the no-WebGL fallback.
 */
export function Poster({ theme, visible }: { theme: ThemeId; visible: boolean }) {
  return (
    <div className={`poster ${visible ? 'show' : ''}`} aria-hidden="true">
      {theme === 'forest' ? <ForestPoster /> : <SpacePoster />}
    </div>
  );
}

function ForestPoster() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">
      <defs>
        <linearGradient id="pf-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9e1d0" />
          <stop offset="0.45" stopColor="#e9e7d8" />
          <stop offset="0.7" stopColor="#f3e8d2" />
          <stop offset="1" stopColor="#eeeadf" />
        </linearGradient>
        <radialGradient id="pf-sun" cx="0.08" cy="0" r="0.7">
          <stop offset="0" stopColor="#f7e3b4" stopOpacity="0.85" />
          <stop offset="1" stopColor="#f7e3b4" stopOpacity="0" />
        </radialGradient>
        <filter id="pf-soft">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id="pf-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.4 0 0 0 0 0.33 0 0 0 0.09 0" />
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#pf-sky)" />
      <rect width="1600" height="900" fill="url(#pf-sun)" />
      <path d="M0 560 C220 470 390 520 560 490 C760 455 900 520 1080 480 C1260 445 1420 500 1600 470 L1600 900 L0 900Z" fill="#cdcfc6" />
      <path d="M0 600 C180 540 330 580 520 560 C720 540 880 590 1060 560 C1250 530 1420 580 1600 555 L1600 900 L0 900Z" fill="#b8c2ad" />
      <path d="M0 650 C200 620 420 650 640 630 C860 612 1050 650 1260 630 C1400 618 1500 640 1600 632 L1600 900 L0 900Z" fill="#a9b99a" />
      <path d="M0 720 C260 690 520 712 800 700 C1080 688 1320 712 1600 696 L1600 900 L0 900Z" fill="#94a986" />
      <ellipse cx="800" cy="790" rx="70" ry="20" fill="#b48e74" />
      <ellipse cx="796" cy="782" rx="7" ry="4.5" fill="#9c7a60" />
      <path d="M690 790 C680 740 720 720 750 730 C770 736 770 780 760 790Z" fill="#aba7b0" filter="url(#pf-soft)" />
      <path d="M692 750 C700 728 735 722 752 732 C740 742 712 748 692 750Z" fill="#7f9a72" />
      <g fill="#8aa07d">
        <path d="M600 900 C605 850 612 830 620 820 C618 850 616 880 630 900Z" />
        <path d="M980 900 C985 860 992 840 1004 828 C998 858 998 884 1010 900Z" />
      </g>
      <rect width="1600" height="900" filter="url(#pf-paper)" />
    </svg>
  );
}

function SpacePoster() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">
      <defs>
        <linearGradient id="ps-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#110f27" />
          <stop offset="0.55" stopColor="#1d1b3c" />
          <stop offset="0.72" stopColor="#332d55" />
          <stop offset="1" stopColor="#463c6c" />
        </linearGradient>
        <radialGradient id="ps-giant" cx="0.4" cy="0.38" r="0.65">
          <stop offset="0" stopColor="#d6ecee" />
          <stop offset="0.6" stopColor="#afd0d4" />
          <stop offset="1" stopColor="#7c86a8" />
        </radialGradient>
        <filter id="ps-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.6 0 0 0 0 0.6 0 0 0 0 0.7 0 0 0 0.06 0" />
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#ps-sky)" />
      <g fill="#f2f1e9">
        {[
          [120, 90, 1.6],
          [300, 160, 1.1],
          [520, 70, 1.4],
          [700, 200, 0.9],
          [930, 110, 1.3],
          [1110, 60, 1],
          [1290, 150, 1.5],
          [1450, 90, 1.1],
          [1530, 240, 0.9],
          [210, 300, 0.8],
          [1380, 320, 0.8],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity="0.75" />
        ))}
      </g>
      <g transform="translate(240 200) rotate(-24)">
        <path d="M-118 0 A118 25 0 0 1 118 0" fill="none" stroke="#dcd3ea" strokeWidth="9" opacity="0.4" />
        <circle r="62" fill="url(#ps-giant)" transform="rotate(24)" />
        <path d="M-60 -8 C-30 -4 30 -4 60 -8" stroke="#9590be" strokeWidth="7" fill="none" opacity="0.5" />
        <path d="M-56 16 C-30 20 30 20 56 16" stroke="#9590be" strokeWidth="5" fill="none" opacity="0.4" />
        <path d="M-118 0 A118 25 0 0 0 118 0" fill="none" stroke="#dcd3ea" strokeWidth="9" opacity="0.6" />
      </g>
      <path d="M0 600 C200 540 360 580 560 545 C760 510 920 570 1120 540 C1320 510 1460 560 1600 540 L1600 900 L0 900Z" fill="#675a86" />
      <path d="M0 650 C240 610 460 640 700 625 C940 610 1160 650 1400 630 C1500 622 1560 632 1600 630 L1600 900 L0 900Z" fill="#8a6f92" />
      <path d="M0 720 C300 700 600 715 900 705 C1200 695 1400 712 1600 706 L1600 900 L0 900Z" fill="#d2ac94" />
      <ellipse cx="1180" cy="760" rx="120" ry="20" fill="#b9998f" />
      <g transform="translate(780 770)">
        <ellipse cx="0" cy="18" rx="40" ry="7" fill="#8c7697" opacity="0.5" />
        <rect x="-26" y="-14" width="52" height="24" rx="10" fill="#d8dbe2" />
        <circle cx="-16" cy="12" r="7" fill="#5f6380" />
        <circle cx="16" cy="12" r="7" fill="#5f6380" />
        <circle cx="10" cy="-4" r="3" fill="#f0d29c" />
      </g>
      <rect width="1600" height="900" filter="url(#ps-paper)" />
    </svg>
  );
}
