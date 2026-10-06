/** Hand-drawn style line icons (stroke follows currentColor). */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const LeafIcon = () => (
  <svg {...base}>
    <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
    <path d="M5 19c3-4 6-7 10-9" />
  </svg>
);

export const FlagIcon = () => (
  <svg {...base}>
    <path d="M6 21V4" />
    <path d="M6 4.5c3-1.6 5 1.4 8.2 0 1.6-.7 2.8-.7 3.8-.3v8.3c-1-.4-2.2-.4-3.8.3-3.2 1.4-5.2-1.6-8.2 0" />
    <path d="M4 21h4" />
  </svg>
);

export const SpiralIcon = () => (
  <svg {...base}>
    <path d="M12 12.2c0-.9.8-1.5 1.6-1.2 1.2.4 1.4 2 .6 3-1.1 1.4-3.4 1.3-4.5-.1-1.5-1.8-.9-4.6 1-5.8 2.4-1.5 5.7-.6 7 1.9 1.6 3-.1 6.8-3.3 7.9" />
    <circle cx="6.2" cy="6.4" r="0.6" fill="currentColor" />
    <circle cx="18.6" cy="17.8" r="0.5" fill="currentColor" />
  </svg>
);

export const SoundIcon = ({ on }: { on: boolean }) => (
  <svg {...base}>
    <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
    {on ? (
      <>
        <path d="M15 9.5c1 .8 1.4 1.6 1.4 2.5s-.4 1.7-1.4 2.5" />
        <path d="M17.5 7c1.8 1.4 2.6 3 2.6 5s-.8 3.6-2.6 5" />
      </>
    ) : (
      <path d="M15.5 9.5l4 5m0-5-4 5" />
    )}
  </svg>
);

export const BellIcon = ({ on }: { on: boolean }) => (
  <svg {...base}>
    <path d="M6.5 16.5h11c-1.2-1.2-1.8-2.6-1.8-4.6V10a3.7 3.7 0 0 0-7.4 0v1.9c0 2-.6 3.4-1.8 4.6Z" />
    <path d="M10.3 19a1.9 1.9 0 0 0 3.4 0" />
    {!on && <path d="M4.5 4.5l15 15" />}
  </svg>
);

export const MotionIcon = () => (
  <svg {...base}>
    <path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
    <path d="M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity="0.55" />
  </svg>
);

export const DotsIcon = () => (
  <svg {...base}>
    <circle cx="6" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M8 5.5v13l10-6.5z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...base}>
    <path d="M8.5 6v12M15.5 6v12" />
  </svg>
);

export const StopIcon = () => (
  <svg {...base}>
    <rect x="7" y="7" width="10" height="10" rx="2.5" />
  </svg>
);

export const ResetIcon = () => (
  <svg {...base}>
    <path d="M5 12a7 7 0 1 0 2.1-5" />
    <path d="M5 4.5V8h3.5" />
  </svg>
);

export const EditIcon = () => (
  <svg {...base}>
    <path d="M5 19l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L9 18z" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const SproutMark = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 13c-4.5 0-6.5-2.6-6.8-6 3.8 0 6.6 1.9 6.8 6Z" fill="currentColor" opacity="0.55" />
    <path d="M12 12c.4-4 3-6.4 7-6.6-.2 4-2.8 6.6-7 6.6Z" fill="currentColor" opacity="0.85" />
  </svg>
);
