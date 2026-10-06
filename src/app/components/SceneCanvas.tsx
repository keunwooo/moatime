import { useEffect, useRef, useState } from 'react';
import type { ThemeId } from '../../core/session';
import { SceneHost, type HostState } from '../../scene/host';
import type { EffectLevel } from '../../sim/config';
import { engine } from '../runtime';
import { simAt, simRunner } from '../sim';
import { hostRef as activeHostRef } from '../hostRef';
import { Poster } from './Poster';
import { devCallSight } from '../../world/cosmos';
import { devCallBattle } from '../../world/front';
import { worldEnv } from '../../world/env';

interface Props {
  theme: ThemeId;
  reducedMotion: boolean;
  cameraLock: boolean;
  lowPower: boolean;
  effects: EffectLevel;
  onState?: (s: HostState) => void;
}

/** Mounts the PixiJS world behind the HTML UI. The UI never depends on it. */
export function SceneCanvas({ theme, reducedMotion, cameraLock, lowPower, effects, onState }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const hostRef = useRef<SceneHost | null>(null);
  const [state, setState] = useState<HostState>('init');
  const [posterTheme, setPosterTheme] = useState(theme);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const host = new SceneHost(
      el,
      engine,
      { reducedMotion, cameraLock, lowPower, effects },
      (s) => {
        setState(s);
        onState?.(s);
      },
      (th, W) => simAt(th, W),
    );
    hostRef.current = host;
    activeHostRef.current = host;
    if (import.meta.env.DEV) {
      // Dev inspection: render now and show a magnified region of the canvas as an overlay.
      const zoom = (x: number, y: number, w: number, h: number) => {
        host.devRenderNow();
        const src = el.querySelector('canvas');
        document.getElementById('moa-zoom')?.remove();
        if (!src || w <= 0) return;
        const k = Math.min(window.innerWidth / w, window.innerHeight / h);
        const c = document.createElement('canvas');
        c.id = 'moa-zoom';
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '99', imageRendering: 'auto' });
        const r = src.width / src.clientWidth;
        c.getContext('2d')!.drawImage(src, x * r, y * r, w * r, h * r, 0, 0, c.width, c.height);
        document.body.appendChild(c);
      };
      const at = async (ms: number) => {
        await engine.devSetWorldTime(ms);
        host.snap();
        host.devRenderNow();
        host.devRenderNow();
        return host.devInfo();
      };
      const sim = () => simRunner(engine.getState().settings.theme);
      // a cosmos session sight that began `agoMs` ago (inspection while idle)
      const sight = (agoMs = 25_000, kind?: string) => devCallSight(engine.worldTime() - agoMs, engine.cosmosOrigin(), engine.getState().world.seed, kind);
      const headline = () => worldEnv(engine.getState().settings.theme, engine.getState().world.seed, engine.worldTime(), engine.originOf(engine.getState().settings.theme)).event;
      // the front: a battle that began `agoMs` ago, and setting the war's time directly
      const battle = (agoMs = 25_000, opts: { grade?: number; away?: boolean } = {}) => devCallBattle(engine.worldTime() - agoMs, engine.frontOrigin(), engine.getState().world.seed, opts);
      const war = async (A: number) => {
        await engine.devSetFrontAge(A);
        host.snap();
        host.devRenderNow();
        host.devRenderNow();
        return host.devInfo();
      };
      (window as unknown as { __moa: unknown }).__moa = { host, engine, zoom, at, sim, sight, headline, battle, war };
    }
    void host.init(theme);
    const off = engine.onEvent((e) => {
      if (e.type === 'completed' && e.live) {
        host.celebrate();
        void engine.markCelebrated(e.sessionId);
      }
    });
    return () => {
      off();
      host.destroy();
      if (activeHostRef.current === host) activeHostRef.current = null;
      hostRef.current = null;
    };
    // The host is created once; later changes are pushed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowPower]);

  useEffect(() => {
    setPosterTheme(theme);
    void hostRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    hostRef.current?.setOptions({ reducedMotion, cameraLock, effects });
  }, [reducedMotion, cameraLock, effects]);

  const showPoster = state !== 'ready';
  return (
    <>
      <div ref={ref} className={`canvas-host ${state === 'ready' ? 'ready' : ''}`} />
      <Poster theme={posterTheme} visible={showPoster} />
      {state === 'failed' && (
        <p className="renderer-note" role="status">
          이 기기에서는 움직이는 풍경을 그릴 수 없어 정지된 그림으로 보여드려요. 타이머와 누적 시간은 그대로 동작해요.
        </p>
      )}
    </>
  );
}
