# 에셋 출처와 라이선스

## 그림 (아트워크)

모든 장면 그림은 이 저장소의 코드가 **브라우저에서 런타임에 직접 그린 절차적 과슈풍 일러스트**입니다.
외부 이미지, 이미지 생성 API, 스톡 아트는 사용하지 않았습니다. 같은 세계 시드로는 항상 같은 그림이 그려집니다.

| 에셋 | 생성 위치 | 비고 |
|---|---|---|
| 하늘·구름·능선·지면 띠·안개·빛줄기·종이 질감 | `src/scene/paint/landscape.ts` | 가로 반복(이음매 없음) 텍스처 |
| 붓 질감·과슈 채색·종이 그레인 | `src/scene/paint/brush.ts` | 두 테마 공통 |
| 나무(잎 묶음·잎·씨앗·날개 씨앗), 풀·꽃·바위·고사리·버섯·이끼·흙·길·샘·갈대·그루터기 | `src/scene/forest/paint.ts` | 줄기·가지는 PixiJS Graphics로 실시간 성장 |
| 숲지기 몸·팔(물뿌리개·갈퀴), 나비·작은 새 | `src/scene/forest/actors.ts` | 얼굴·대화창 없음 |
| 숲지기 자세·도구(바구니·부엽토 통·삽·망치·짚), 다람쥐, 벌 | `src/scene/forest/keeper.ts`, `ForestScene.ts` | PixiJS Graphics로 실시간 |
| 의자·씨앗 바구니·퇴비 상자·퇴비 더미·부엽토·빗물받이·물길, 가을 잎 묶음, 겨울 가지·눈 | `src/scene/forest/paintWork.ts` | 가을 묶음은 수종별 팔레트로 다시 그림 |
| 별·은하수·지구·구름, 달 능선·지면·크레이터·암석, 시설 7종(연결 거점 포함), 태양광 날개, 접시 안테나, 로버, 착륙선, 화물 상자, 착륙장, 통로 | `src/scene/space/paint.ts` | 골조·측량선·패드 조각·바닥 프레임은 Graphics |
| 광물 바위·광물 조각·채굴 바닥, 기지 배터리, 충전 기둥, 케이블, 화분 | `src/scene/space/paintWork.ts` | 로버 적재함·드릴 팔은 `rover.ts`의 Graphics |
| 정적 포스터(로딩·대체 화면) | `src/app/components/Poster.tsx` | 인라인 SVG |
| 비교 이미지·공유 이미지 `public/og/*.jpg`, `docs/compare/*.jpg`, `docs/media/*.webp` | 앱 자체 렌더러로 캡처 | 실제 작업 시뮬레이션의 상태(개선 전 화면은 이전 빌드) |
| 파비콘 `public/favicon.svg` | 직접 작성 | |

**외부 아트워크가 더 필요한 부분(선택):** 현재 그림은 모두 절차적으로 그린 것이라 손그림 원화만큼의 붓 터치 밀도는 없습니다.
전문 일러스트레이터가 같은 광원(왼쪽 위)과 팔레트로 잎 묶음·시설 본체·로버를 분리 에셋으로 그려 주면
`paintClump`, `paintFacility`, `paintRover`의 반환값을 이미지 텍스처로 바꾸는 것만으로 교체할 수 있습니다
(기준점·크기 규약은 각 함수 주석 참고).

## 소리

환경음과 알림음은 WebAudio로 실시간 합성합니다(`src/audio/sound.ts`). 오디오 파일을 쓰지 않습니다.

## 글꼴

| 글꼴 | 패키지 | 라이선스 | 용도 |
|---|---|---|---|
| Gowun Dodum | `@fontsource/gowun-dodum@5.3.0` | SIL Open Font License 1.1 (상업적 사용 가능) | UI 한글 |
| Fraunces (SOFT 축) | `@fontsource-variable/fraunces@5.3.0` | SIL Open Font License 1.1 (상업적 사용 가능) | 타이머 숫자 |

라이선스 원문: `node_modules/@fontsource/gowun-dodum/LICENSE`, `node_modules/@fontsource-variable/fraunces/LICENSE`.

## 코드 의존성 (고정 버전)

| 패키지 | 버전 | 라이선스 |
|---|---|---|
| react, react-dom | 19.3.0 | MIT |
| pixi.js | 8.22.0 | MIT |
| vite | 8.3.2 | MIT |
| @vitejs/plugin-react | 6.1.1 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| vitest | 5.0.3 | MIT |
