/* MaeumSanctuary — 요청받은 Tailwind 내장형 컴포넌트의 **참고 원본**
 *
 * 이 파일은 빌드 대상이 아니다(이 앱은 React 없이 도는 정적 SPA). 원본 계약을 잃지 않으려고 남긴다.
 * 앱에 옮긴 것은 아래 네 가지이고, 위치는 `docs/routing-resilience-spec.md` 5절에 있다.
 *
 *   1. fallbackStyles — 외부 CSS 가 유실돼도 종이/주사/글 색과 32px 격자가 남는다
 *                       → index.html 의 #boot 인라인 셸 · js/features.js 의 applyFallbackTheme()
 *   2. 상단 헤더(⌂ 마음정원 / 내 정원) → 상단 바 + 브레드크럼
 *   3. auto-grow textarea + Clear(✕)   → .sagye-inputwrap + enhanceFields()
 *   4. 인장 CTA → .seal-send (원본 36~44px 보다 큰 72px, 엄지 존)
 *
 * Tailwind 클래스는 원본 그대로 두었다 — 실제 클래스 이름이 아니라 '무엇을 하는지'의 기록이다.
 * 색 값은 사경첩 팔레트와 같다: paper #FAF7F2 · ink #1A1A1A · jusa #B71C1C · grid rgba(183,28,28,0.04)
 */

import { useEffect, useRef, useState } from 'react';

/** 외부 CSS 가 없을 때를 위한 인라인 백업. 값이 바뀌면 docs/routing-resilience-spec.md 도 함께 고친다. */
export const fallbackStyles = {
  paper: '#FAF7F2',
  ink: '#1A1A1A',
  jusa: '#B71C1C',
  grid: 'rgba(183,28,28,0.04)',
  gridSize: 24
} as const;

export interface MaeumSanctuaryProps {
  /** 이미 쌓인 사경 장 수 — 0 이면 안내, 1~2 면 씨앗 카드 */
  counselCount?: number;
  onAsk?: (text: string) => void | Promise<void>;
  /** 인증 서버가 불통일 때만 true — 하단에 게스트 입장 훅이 선다 */
  offline?: boolean;
}

export default function MaeumSanctuary({ counselCount = 0, onAsk, offline = false }: MaeumSanctuaryProps) {
  const [text, setText] = useState('');
  const [alert, setAlert] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // auto-grow — 입력이 늘어난 만큼만 자란다 (스크롤바가 생기지 않게)
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = async () => {
    if ('vibrate' in navigator) navigator.vibrate?.(8);
    if (!text.trim()) {
      // 빈 입력: 조용히 실패하지 않는다 — 두 번 점멸 + 포커스 유지
      setAlert(true);
      window.setTimeout(() => setAlert(false), 800);
      area.current?.focus();
      return;
    }
    await onAsk?.(text.trim());
    setText('');
  };

  const grid = `repeating-linear-gradient(0deg, ${fallbackStyles.grid} 0 1px, transparent 1px ${fallbackStyles.gridSize}px),
                repeating-linear-gradient(90deg, ${fallbackStyles.grid} 0 1px, transparent 1px ${fallbackStyles.gridSize}px)`;

  return (
    <section className="maeum-sanctuary" style={{ background: fallbackStyles.paper, color: fallbackStyles.ink, backgroundImage: grid }}>
      <header className="flex items-center justify-between px-4 py-3">
        <span aria-hidden="true">⌂ 마음정원</span>
        <strong>내 정원</strong>
      </header>

      <div className={`sagye-inputwrap ${alert ? 'is-alert' : ''}`} aria-invalid={alert || undefined}>
        <label className="sr-only" htmlFor="sagye-prompt">마음의 지기에게 남기는 물음</label>
        <textarea
          id="sagye-prompt"
          ref={area}
          rows={2}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="지금 마음에 머무는 것을 한 줄 적어 보세요"
        />
        {text && (
          <button type="button" className="absolute right-2 top-2" aria-label="지우기" onClick={() => setText('')}>✕</button>
        )}
      </div>

      <button
        type="button"
        className="seal-send"
        aria-label="마음의 지기에게 보내기"
        onClick={submit}
        style={{ background: fallbackStyles.jusa, color: fallbackStyles.paper }}
      >
        印
      </button>

      {counselCount > 0 && counselCount < 3 && (
        <p className="seed-note">🌱 마음 씨앗 — {3 - counselCount}번 더 이야기하면 주간 감정선이 피어납니다.</p>
      )}

      {offline && (
        <a className="auth-guest" href="#/account?guest=1">인터넷 없이 게스트로 임시 입장</a>
      )}
    </section>
  );
}
