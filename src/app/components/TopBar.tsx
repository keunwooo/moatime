import { useEffect, useRef, useState } from 'react';
import type { MotionPref, Persisted, ThemeId, Mode } from '../../core/session';
import type { EffectLevel } from '../../sim/config';
import { engine } from '../runtime';
import { sound } from '../../audio/sound';
import { BellIcon, DotsIcon, LeafIcon, MoonIcon, MotionIcon, SoundIcon, SproutMark } from './Icons';

interface Props {
  state: Persisted;
  onNewWorld: () => void;
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
}) {
  // radio group keyboard model: one tab stop, arrow keys move and select
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (props.disabled) return;
    const i = props.options.findIndex((o) => o.value === props.value);
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % props.options.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + props.options.length) % props.options.length;
    if (j < 0) return;
    e.preventDefault();
    props.onChange(props.options[j].value);
    const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
    btns[j]?.focus();
  };
  return (
    <div className={`seg ${props.className ?? ''}`} role="radiogroup" aria-label={props.label} title={props.disabled ? props.disabledHint : undefined} onKeyDown={onKey}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          tabIndex={props.value === o.value ? 0 : -1}
          className={props.value === o.value ? 'on' : ''}
          disabled={props.disabled && props.value !== o.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TopBar({ state, onNewWorld }: Props) {
  const s = state.settings;
  const inSession = !!state.session && state.session.status !== 'completed';
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return;
    // focus the first item when the menu opens
    menuRef.current?.querySelector<HTMLButtonElement>('.menu button')?.focus();
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          setMenu(false);
          triggerRef.current?.focus();
        }
        return;
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  const toggleAmbient = () => {
    sound.unlock();
    void engine.updateSettings({ ambientSound: !s.ambientSound });
  };
  const toggleChime = () => {
    sound.unlock();
    const next = !s.chime;
    void engine.updateSettings({ chime: next });
    if (next) sound.playChime();
  };

  return (
    <header className="topbar">
      <div className="brand" aria-label="모아, 집중 풍경 타이머">
        <SproutMark />
        <span className="brand-name">모아</span>
        <span className="brand-sub">집중 풍경 타이머</span>
      </div>
      <div className="topbar-mid">
        <Segmented<ThemeId>
          label="테마"
          value={s.theme}
          options={[
            { value: 'forest', label: '숲', icon: <LeafIcon /> },
            { value: 'space', label: '우주', icon: <MoonIcon /> },
          ]}
          onChange={(theme) => void engine.updateSettings({ theme })}
        />
        <Segmented<Mode>
          label="타이머 모드"
          value={s.mode}
          options={[
            { value: 'countdown', label: '카운트다운' },
            { value: 'stopwatch', label: '스톱워치' },
          ]}
          disabled={inSession}
          disabledHint="세션 중에는 모드를 바꿀 수 없어요"
          onChange={(mode) => void engine.updateSettings({ mode })}
        />
      </div>
      <div className="topbar-right">
        <button type="button" className={`icon-btn ${s.ambientSound ? 'on' : ''}`} aria-pressed={s.ambientSound} onClick={toggleAmbient} title="환경음">
          <SoundIcon on={s.ambientSound} />
          <span className="sr-only">환경음</span>
        </button>
        <button type="button" className={`icon-btn ${s.chime ? 'on' : ''}`} aria-pressed={s.chime} onClick={toggleChime} title="알림음">
          <BellIcon on={s.chime} />
          <span className="sr-only">완료 알림음</span>
        </button>
        <div className="menu-wrap" ref={menuRef}>
          <button ref={triggerRef} type="button" className={`icon-btn ${menu ? 'on' : ''}`} aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu((m) => !m)} title="애니메이션과 설정">
            <MotionIcon />
            <DotsIcon />
            <span className="sr-only">애니메이션과 설정</span>
          </button>
          {menu && (
            <div className="menu" role="menu">
              <div className="menu-group" role="group" aria-label="애니메이션">
                <div className="menu-label">애니메이션</div>
                {(
                  [
                    ['system', '시스템 설정 따르기'],
                    ['full', '켜기'],
                    ['reduce', '끄기 (지금 상태를 정지 화면으로)'],
                  ] as [MotionPref, string][]
                ).map(([v, label]) => (
                  <button key={v} type="button" role="menuitemradio" aria-checked={s.motion === v} className={s.motion === v ? 'on' : ''} onClick={() => void engine.updateSettings({ motion: v })}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="menu-group" role="group" aria-label="효과 강도">
                <div className="menu-label">효과 강도 <small>장식만 바뀌고 작업 결과는 같아요</small></div>
                <div className="menu-seg">
                  {(
                    [
                      ['low', '낮음'],
                      ['default', '기본'],
                      ['rich', '풍부함'],
                    ] as [EffectLevel, string][]
                  ).map(([v, label]) => (
                    <button key={v} type="button" role="menuitemradio" aria-checked={s.effects === v} className={s.effects === v ? 'on' : ''} onClick={() => void engine.updateSettings({ effects: v })}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="menu-group">
                <button type="button" role="menuitemcheckbox" aria-checked={!s.cameraLock} className={!s.cameraLock ? 'on' : ''} onClick={() => void engine.updateSettings({ cameraLock: !s.cameraLock })}>
                  자동 카메라 <small>{s.cameraLock ? '꺼짐 · 지금 시점에 머물러요' : '켜짐 · 작업 구역을 따라가요'}</small>
                </button>
                <button type="button" role="menuitemcheckbox" aria-checked={s.lowPower} className={s.lowPower ? 'on' : ''} onClick={() => void engine.updateSettings({ lowPower: !s.lowPower })}>
                  저전력 모드 <small>30fps · 저해상도</small>
                </button>
              </div>
              <div className="menu-group">
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setMenu(false);
                    onNewWorld();
                  }}
                >
                  새 풍경 만들기…
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
