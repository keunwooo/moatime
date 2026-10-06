import type { ThemeId } from '../../core/session';

/**
 * Static poster with the same composition as the live scene. Shown while the renderer
 * loads, when motion is off and the renderer is unavailable, and as the no-WebGL fallback.
 */
export function Poster({ theme, visible }: { theme: ThemeId; visible: boolean }) {
  return (
    <div className={`poster ${visible ? 'show' : ''}`} aria-hidden="true">
      {theme === 'forest' ? <ForestPoster /> : theme === 'front' ? <FrontPoster /> : <CosmosPoster />}
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

function FrontPoster() {
  // the battlefield seen from high above: rival plateaus far up, the time-crystal lake behind the
  // timer, the home plateau near; fog over most of it (a war's first moment)
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">
      <defs>
        <linearGradient id="pfr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1a2c" />
          <stop offset="1" stopColor="#3a2a33" />
        </linearGradient>
        <linearGradient id="pfr-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a44" />
          <stop offset="1" stopColor="#c98a5a" />
        </linearGradient>
        <radialGradient id="pfr-lake" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#24324f" />
          <stop offset="1" stopColor="#1e2a44" />
        </radialGradient>
        <radialGradient id="pfr-fog" cx="0.5" cy="0.92" r="0.75">
          <stop offset="0.25" stopColor="#2b2733" stopOpacity="0" />
          <stop offset="0.6" stopColor="#2b2733" stopOpacity="0.72" />
          <stop offset="1" stopColor="#2b2733" stopOpacity="0.92" />
        </radialGradient>
        <filter id="pfr-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.2 0 0 0 0 0.15 0 0 0 0 0.12 0 0 0 0.1 0" />
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#pfr-sky)" />
      <rect y="100" width="1600" height="800" fill="url(#pfr-ground)" />
      <path d="M0 110 L420 110 L380 260 L0 290Z" fill="#7a4a3a" />
      <path d="M1600 110 L1180 110 L1220 260 L1600 290Z" fill="#7a4a3a" />
      <ellipse cx="800" cy="420" rx="360" ry="150" fill="url(#pfr-lake)" />
      <g fill="#f2b544" opacity="0.55">
        <circle cx="700" cy="400" r="3" />
        <circle cx="880" cy="450" r="2.4" />
        <circle cx="820" cy="380" r="2" />
      </g>
      <path d="M560 900 L600 690 L1000 690 L1040 900Z" fill="#a8704a" />
      <path d="M600 690 L1000 690 L990 720 L610 720Z" fill="#7a4a3a" />
      <g transform="translate(800 760)">
        <path d="M-60 0h120l-12-34H-28l-8-16h-32l-8 16h-8z" fill="#5b6670" />
        <path d="M-50 0l-14 26M50 0l14 26" stroke="#3e474f" strokeWidth="7" strokeLinecap="round" />
        <circle cx="-26" cy="-16" r="5" fill="#f4d29c" />
        <circle cx="26" cy="-16" r="5" fill="#f4d29c" />
      </g>
      <rect width="1600" height="900" fill="url(#pfr-fog)" />
      <rect width="1600" height="900" filter="url(#pfr-paper)" />
    </svg>
  );
}

function CosmosPoster() {
  // a quiet first-light sky: the web, a nebula wash on the left, the home star and its orbits
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 733) % 1600;
    const y = 30 + ((i * 397) % 560);
    const inTimer = x > 470 && x < 1130 && y > 170 && y < 600;
    return inTimer ? null : <circle key={i} cx={x} cy={y} r={0.8 + ((i * 7) % 5) * 0.35} fill="#eef0fa" opacity={0.25 + ((i * 13) % 7) * 0.08} />;
  });
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">
      <defs>
        <radialGradient id="pc-neb" cx="0.12" cy="0.6" r="0.45">
          <stop offset="0" stopColor="#9a4e7c" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#3e8c93" stopOpacity="0.18" />
          <stop offset="1" stopColor="#120f2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pc-star" cx="0.5" cy="0.84" r="0.12">
          <stop offset="0" stopColor="#f7d9aa" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#f5d69a" stopOpacity="0.25" />
          <stop offset="1" stopColor="#f5d69a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pc-gal" cx="0.83" cy="0.2" r="0.12">
          <stop offset="0" stopColor="#f7d9aa" stopOpacity="0.6" />
          <stop offset="1" stopColor="#7466b4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="#120f2a" />
      <rect width="1600" height="900" fill="url(#pc-neb)" />
      <rect width="1600" height="900" fill="url(#pc-gal)" />
      <g stroke="#7466b4" strokeOpacity="0.18" fill="none">
        <path d="M150 210 Q 300 260 330 500" />
        <path d="M150 210 Q 520 120 960 110" />
        <path d="M1340 400 Q 1450 520 1490 640" />
      </g>
      {stars}
      <ellipse cx="800" cy="752" rx="536" ry="107" fill="none" stroke="#e8c27a" strokeOpacity="0.12" />
      <ellipse cx="800" cy="752" rx="320" ry="64" fill="none" stroke="#e8c27a" strokeOpacity="0.1" />
      <rect width="1600" height="900" fill="url(#pc-star)" />
      <circle cx="800" cy="752" r="14" fill="#f7d9aa" />
      <circle cx="1100" cy="790" r="24" fill="#3f7fa6" />
      <circle cx="1294" cy="700" r="20" fill="#e8c27a" opacity="0.85" />
    </svg>
  );
}
