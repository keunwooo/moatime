/**
 * Ad slots live in static HTML below the landscape with space reserved by CSS, so loading,
 * failing or blocking ads never moves the timer or the scene. No auto-refresh, no overlays.
 *
 * Connect AdSense later by setting at build time:
 *   VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
 *   VITE_ADSENSE_SLOT_BELOW=1234567890
 *   VITE_ADSENSE_SLOT_FOOTER=1234567891
 * Without them a labelled development slot is shown instead.
 */

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const SLOTS: Record<string, string | undefined> = {
  'below-scene': import.meta.env.VITE_ADSENSE_SLOT_BELOW as string | undefined,
  footer: import.meta.env.VITE_ADSENSE_SLOT_FOOTER as string | undefined,
};

export function initAds() {
  const slots = [...document.querySelectorAll<HTMLElement>('.ad-slot[data-ad-slot]')];
  if (!slots.length) return;
  if (!CLIENT) {
    for (const el of slots) {
      el.classList.add('ad-placeholder');
      el.innerHTML = `<span>광고 영역 · ${import.meta.env.DEV ? '개발용 슬롯' : '준비 중'}</span><small>${el.dataset.adSize ?? ''}</small>`;
    }
    return;
  }
  const load = () => {
    try {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
      s.onerror = () => slots.forEach((el) => el.classList.add('ad-failed'));
      document.head.appendChild(s);
      for (const el of slots) {
        const slotId = SLOTS[el.dataset.adSlot ?? ''];
        if (!slotId) continue;
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.dataset.adClient = CLIENT;
        ins.dataset.adSlot = slotId;
        ins.dataset.adFormat = 'auto';
        ins.dataset.fullWidthResponsive = 'true';
        el.appendChild(ins);
        try {
          ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({});
        } catch {
          el.classList.add('ad-failed');
        }
      }
    } catch {
      /* ads must never affect the timer */
    }
  };
  // after the app is interactive
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(load, { timeout: 4000 });
  else window.setTimeout(load, 2500);
}
