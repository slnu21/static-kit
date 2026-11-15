<div align="center">

# static-kit

*서버 없는 정적 웹 앱·게임을 위한 작은 TypeScript 도구 모음*

의존성 0 · ESM · 모듈별 import(트리 셰이킹) · 오프라인/로컬 우선

</div>

텍스트 던전 로그라이크, 매일 퍼즐, 타이머처럼 **서버 없이 정적 파일로 배포하는** 앱이 매번 다시 만드는 것들 — 세이브 슬롯, 복사·붙여넣기 세이브 코드, 시드 난수, "오늘의 퍼즐" 날짜 계산 — 을 한곳에 모았습니다. 네트워크 요청은 하나도 하지 않습니다.

## 시작하기

npm에는 게시하지 않았습니다. 로컬 프로젝트에서 쓰는 방법은 두 가지입니다.

**① `dist/` 복사(vendoring)** — 번들러가 없는 정적 사이트에 적합

```powershell
cd static-kit
npm install
npm run build                       # dist/ 에 ESM + .d.ts 생성
Copy-Item -Recurse dist ..\my-game\vendor\static-kit
```

```html
<script type="module">
  import { createRng } from './vendor/static-kit/rng.js';
  import { createSaveStore } from './vendor/static-kit/save/store.js';
</script>
```

필요한 모듈 파일과 `dist/shared/` 를 함께 복사하면 됩니다(모듈끼리 `shared/` 청크를 공유).

**② git 의존성(나중에 GitHub 공개 후)**

```powershell
npm i github:slnu21/static-kit      # prepare 스크립트가 설치 시 빌드
```

```ts
import { createSaveCode } from 'static-kit/save/code';
import { createRng } from 'static-kit/rng';
```

## 모듈

| import 경로 | 하는 일 | 브라우저 API |
|---|---|---|
| `static-kit/save/store` | 슬롯 저장소, 마이그레이션, 자동 저장 디바운스 | IndexedDB → localStorage → 메모리 |
| `static-kit/save/persist` | `navigator.storage` 영구 저장 요청·용량 추정(미지원 시 조용히 실패) | Storage API |
| `static-kit/save/code` | 세이브 코드 `<gameId>.<v>.<payload>.<crc>` 내보내기/가져오기, 비트 패킹 | `CompressionStream('deflate-raw')` |
| `static-kit/save/file` | 세이브 파일 다운로드/파일 선택 가져오기 | Blob, `<input type=file>` |
| `static-kit/rng` | 시드 PRNG(sfc32 + cyrb128), 상태 직렬화 | 없음 |
| `static-kit/daily` | 날짜 키·타임존, 퍼즐 번호, 연속 기록, 공유 텍스트 | `Intl` |
| `static-kit/catalog` | Ondol Works 제품 목록(단일 원천) + "다른 도구" 링크 줄 HTML 생성 | 없음(DOM 없이 문자열) |
| `static-kit` | 위 전부 재노출(편의용) | |

빌드 크기(압축 안 함 / gzip): rng 4.6 KB / 2.0 KB, daily 5.9 KB / 2.5 KB, save/code ≈ 9.6 KB / 4.2 KB(공유 청크 포함), save/store ≈ 12.7 KB / 4.7 KB(공유 청크 포함).

### save/store — 슬롯 저장소

```ts
import { createSaveStore } from 'static-kit/save/store';

const store = createSaveStore<GameState>({
  gameId: 'dungeon',
  version: 3,
  migrations: {
    1: (d) => ({ ...d, hp: 10 }),     // v1 → v2
    2: (d) => ({ ...d, gold: 0 }),    // v2 → v3
  },
  autosaveDelay: 1000,                // 디바운스(ms)
});

await store.save('main', state);      // { v: 3, savedAt, data } 로 저장
const state = await store.load('main'); // v1 데이터면 migrations[1], [2] 순서대로 적용
await store.list();                   // [{ slot, v, savedAt }] 최신순
await store.remove('main');
store.autosave('main', state);        // 연속 호출 → 조용해진 뒤 1회 쓰기(최대 대기 5초)
await store.flush();                  // 대기 중 자동 저장 즉시 기록(탭 숨김/종료 시 자동)
```

- 저장된 버전이 현재보다 **높으면** `SaveError('VERSION_TOO_NEW')`, 단계가 빠지면 `MISSING_MIGRATION`. 오류는 `err.code` 로 구분합니다(`isSaveError(err, 'VERSION_TOO_NEW')`).
- 백엔드는 인터페이스(`get/set/delete/keys`)로 분리돼 있습니다: `indexedDBBackend()`, `localStorageBackend()`, `memoryBackend()`(테스트), 기본값 `autoBackend()` 는 IndexedDB가 막히면(사생활 보호 모드 등) localStorage, 그것도 안 되면 메모리로 내려갑니다.
- 데이터는 JSON 호환 값으로 두세요(localStorage·세이브 코드와 동일 규칙).

### save/persist — 영구 저장

```ts
import { requestPersistence, storageStatus, formatBytes } from 'static-kit/save/persist';

await requestPersistence();           // 첫 저장 같은 사용자 동작 직후 호출 권장. true/false
const { persisted, estimate } = await storageStatus();
formatBytes(estimate?.usage ?? 0);    // "1.5 KB"
```

브라우저는 저장 공간이 부족하면 영구 표시 없는 사이트의 데이터를 지울 수 있습니다. 모든 함수는 예외를 던지지 않습니다.

### save/code — 세이브 코드

```ts
import { createSaveCode, isSaveError } from 'static-kit/save/code';

const codec = createSaveCode<GameState>({ gameId: 'dungeon', version: 3, migrations });
const code = await codec.exportCode(state);
// { floor: 3, hp: 17, inv: ['sword'] } → "dungeon.3.q1ZKy8nPL1KyMtZRyihQsjI011HKzCtTsopWKi7PL0pRiq0FAA.XX782A"

try {
  const state = await codec.importCode(pasted);   // 앞뒤 공백·줄바꿈 무시
} catch (e) {
  if (isSaveError(e, 'CHECKSUM')) alert('코드에 오타가 있거나 잘렸습니다');
  if (isSaveError(e, 'WRONG_GAME')) alert('다른 게임의 코드입니다');
  if (isSaveError(e, 'VERSION_TOO_NEW')) alert('앱을 업데이트하세요');
}
```

형식: `<gameId>.<v>.<payload>.<check>` — payload는 `JSON → deflate-raw → base64url`, check는 앞 세 부분에 대한 CRC-32(base64url 6자).

> **해시는 저장 수단이 아닙니다.** CRC·SHA 같은 해시는 단방향이라 해시값에서 원래 데이터를 되돌릴 수 없습니다. 세이브 코드에 데이터가 들어가는 건 payload(압축+인코딩, 누구나 디코딩 가능) 덕분이고, CRC는 **무결성 검사** — 한 글자 오타나 복사 중 잘림을 잡아내는 용도 — 일 뿐입니다. 암호화가 아닙니다.

**선택: 변조 억제** — `createSaveCode({ ..., key: 'some-key' })` 를 주면 키를 섞은 체크섬을 씁니다. 키는 클라이언트 코드에 들어 있어 누구나 꺼낼 수 있으므로 **보안이 아니라 억제**(가볍게 손으로 고치는 걸 귀찮게 만드는 정도)입니다. 키를 바꾸면 기존 코드가 전부 무효가 됩니다.

`packBits(bools)` / `unpackBits(str, n)` 은 탐험 타일·획득 플래그 같은 비트 배열을 base64url 문자열로 압축합니다.

요구 사항: `CompressionStream('deflate-raw')` — Chrome/Edge 103+, Firefox 113+, Safari 16.4+, Node 21.2+(빌드·테스트는 Node 18+). 없으면 `SaveError('UNSUPPORTED')`.

### save/file — 세이브 파일

```ts
import { downloadJSON, pickJSONFile, saveFileName } from 'static-kit/save/file';

downloadJSON(saveFileName('dungeon', { slot: 'main' }), record); // dungeon-main-2026-11-15T0930.json
const data = await pickJSONFile();    // 취소하면 undefined (클릭 핸들러 안에서 호출)
```

`downloadText`, `downloadFile`, `pickFile`, `pickTextFile`, `readFileText` 도 있습니다.

### rng — 시드 난수

```ts
import { createRng, restoreRng, deriveSeed } from 'static-kit/rng';

const rng = createRng('run-7f3k');           // 같은 시드 → 모든 기기에서 같은 수열
rng.int(1, 6); rng.float(); rng.chance(0.25);
rng.pick(monsters); rng.shuffle(deck);
rng.weighted([['common', 70], ['rare', 25], ['epic', 5]]);
const saved = rng.state();                   // [u32, u32, u32, u32] — JSON 그대로 저장 가능
const again = restoreRng(saved);             // 정확히 이어서 생성
createRng(deriveSeed('run-7f3k', 'floor', 3)); // 관심사별 독립 스트림
```

sfc32 알고리즘·cyrb128 시드 해시·워밍업 횟수는 테스트에 고정값으로 박혀 있습니다(바뀌면 기존 세이브·데일리 시드가 깨지므로).

### daily — 매일 퍼즐

```ts
import { dateKey, puzzleNumber, dailySeed, recordPlay, streakOn, shareText, emojiGrid, msUntilNextDay } from 'static-kit/daily';

const opts = { timeZone: 'Asia/Seoul' };      // 생략하면 사용자 로컬 타임존
const today = dateKey(Date.now(), opts);      // "2026-11-15"
puzzleNumber('2026-11-01', today);            // 15 (출시일이 #1)
const rng = createRng(dailySeed('tiles', today));

let streak = recordPlay(saved.streak, today); // { current, best, last } — 같은 날 중복 무시, 하루 빠지면 1로
streakOn(streak, today);                      // 어제까지 했으면 아직 살아 있음
shareText({ title: 'Tiles', number: 15, score: '4/6', grid: emojiGrid(rows, ['⬛', '🟨', '🟩']) });
msUntilNextDay(Date.now(), opts);             // 다음 퍼즐까지 남은 ms
```

모든 퍼즐이 같은 순간에 바뀌어야 하면 `timeZone` 을 고정(`'UTC'` 등)하세요. 날짜 계산은 달력 일 단위라 서머타임 전환일에도 하루가 23·25시간이 되지 않습니다.

### catalog — Ondol Works 제품 목록

[Ondol Works](https://ondolworks.com) 의 도구·앱 목록을 한곳에 둡니다. 허브 사이트와 각 도구의 "다른 도구" 줄이 같은 데이터를 씁니다.

```ts
import { listProducts, renderOtherTools, productName } from 'static-kit/catalog';

listProducts({ kind: 'web', status: 'live' });         // 카탈로그 순서 유지, exclude: 'id' | ['id', …]
renderOtherTools('ko', 'pulsar-timer');                // <nav class="ow-other" …>…</nav> (빌드 시 정적 HTML에 넣기)
renderOtherTools('en', 'pulsar-timer', { soon: 'hide', kind: 'web', hubLink: false });
```

- 항목: `id`, `name`(문자열 또는 `{ko,en}`), `tagline{ko,en}`, `kind`(`web`·`desktop`·`game`), `status`(`live`·`soon`), `url`(웹 주소 또는 Microsoft Store 페이지), `icon`(인라인 SVG·`currentColor`), `color`, `platform`.
- `soon` 은 기본으로 링크 없는 글자 + "(준비 중)" — 아직 열리지 않은 주소로 보내지 않습니다. 데스크톱 앱은 Store 링크 + `Windows` 표기.
- 데스크톱 앱은 **Microsoft Store 에 실제로 게시된 것만** 넣습니다. 제품을 추가하면 `npm run build` 후 소비 프로젝트에 `dist/catalog.js`(+`.d.ts`)를 다시 복사하세요(공유 청크 없이 파일 하나).

## 설계 지침: 짧은 로그라이크 세이브 코드

**생성된 결과를 저장하지 말고, 생성의 입력을 저장하세요.** 맵·몬스터 배치는 `(시드, 층)` 으로 언제든 똑같이 다시 만들 수 있습니다. 세이브에는 플레이어가 *바꾼 것* 만 넣습니다.

```ts
interface RunSave {
  seed: string;            // 런 시드
  floor: number;           // 현재 층 → generateFloor(seed, floor) 로 맵 재생성
  explored: string;        // packBits(탐험 비트마스크)
  player: { x: number; y: number; hp: number; maxHp: number; lvl: number; xp: number };
  inv: Array<[string, number]>;
  rng: RngState;           // 전투·드롭 RNG 상태 → 로드 후에도 같은 굴림이 이어짐
  turn: number;
}

function generateFloor(seed: string, floor: number) {
  const rng = createRng(deriveSeed(seed, 'floor', floor)); // 층마다 독립 스트림
  // ... 결정적 생성 ...
}

const code = await codec.exportCode({
  seed, floor, explored: packBits(explored), player, inv: [...inventory], rng: rng.state(), turn,
});
```

전체 예제: [`examples/roguelike.ts`](examples/roguelike.ts) (테스트 [`test/roguelike-example.test.ts`](test/roguelike-example.test.ts) 가 "코드 왕복 후 맵·탐험·이후 RNG 굴림까지 동일"을 검증).

**코드 길이 측정** (48×32 맵, `npm run measure` 로 재현):

| 상태 | 층 | 탐험 타일 | 인벤 종류 | JSON 문자 | 세이브 코드 문자 | (비교) 맵 통째 저장 코드 |
|---|---|---|---|---|---|---|
| 새 런 | 1 | 0/1536 | 1 | 439 | **219** | 353 |
| 초반(40턴) | 1 | 93/1536 | 2 | 452 | **275** | 411 |
| 후반(12층, 2500턴) | 12 | 661/1536 | 24 | 760 | **413** | 688 |

맵이 커지거나 몬스터·아이템 배치까지 저장해야 할수록 차이는 더 벌어집니다. 탐험 비트마스크가 가장 큰 항목이므로, 더 줄이려면 "현재 층만 저장"하거나 "방 단위 탐험 플래그"로 바꾸세요.

**세이브 스컴은 막을 수 없습니다.** 영구 사망 게임이라도 코드를 복사해 두었다가 죽은 뒤 붙여 넣으면 되돌릴 수 있고, 클라이언트만으로는 이를 막을 방법이 없습니다(로컬 저장소도 마찬가지 — 개발자 도구로 복사 가능). 완화 선택지:

- **체크포인트에서만 내보내기** — 층 계단·휴식처에서만 코드 발급(전투 도중 상태는 코드로 못 뺌).
- **로드 시 소모** — 코드/슬롯을 불러오면 그 슬롯을 지우거나 "불러옴" 표시를 남겨 정직한 플레이어에게 신호 주기.
- **결정적 RNG 상태 포함** — 되돌려도 같은 굴림이 나오므로 "될 때까지 다시" 이득이 줄어듦(이 패턴이 기본으로 해 줌).
- 경쟁(리더보드)이 필요하면 클라이언트만으로는 불가 — 서버 검증의 영역입니다.

## 개발

```powershell
npm install
npm run build              # vite library mode + tsc 선언 파일 → dist/
npm test                   # vitest 단위 테스트
npm run typecheck          # tsc --noEmit (테스트·예제 포함)
npm run measure            # 세이브 코드 길이 표 출력
npm run test:integration   # 헤드리스 Edge(CDP)로 실제 브라우저 백엔드 점검
```

## 라이선스

MIT © 2026 slnu21 (SlnU)

---

<div align="center">

## English

</div>

*A tiny TypeScript toolkit for serverless static web apps and games.* Zero dependencies · ESM · per-module imports (tree-shakable) · offline / local-first. It makes no network requests.

It bundles what static-file apps (text roguelikes, daily puzzles, timers) keep rewriting: save slots, copy-paste save codes, seeded RNG, and "today's puzzle" date math.

## Getting started

Not published to npm. Two ways to use it from a local project:

1. **Vendor `dist/`** — `npm install && npm run build`, then copy `dist/` (the module files you need plus `dist/shared/`) into your project and `import { createRng } from './vendor/static-kit/rng.js'`.
2. **Git dependency (once public)** — `npm i github:slnu21/static-kit` (the `prepare` script builds on install), then `import { createSaveCode } from 'static-kit/save/code'`.

## Modules

| Import path | Purpose |
|---|---|
| `static-kit/save/store` | Slot store `{ v, savedAt, data }`, ordered migrations (`migrations[v]`: v → v+1), clear `VERSION_TOO_NEW` error, debounced autosave with max-wait and flush-on-hide. Backends: IndexedDB (default) → localStorage → memory, behind a `get/set/delete/keys` interface. |
| `static-kit/save/persist` | Fail-soft wrappers for `navigator.storage.persist()/persisted()/estimate()`. |
| `static-kit/save/code` | Save codes `<gameId>.<v>.<payload>.<crc32>`: JSON → `deflate-raw` → base64url, CRC-32 integrity check, whitespace-tolerant import, wrong-game / truncation / version handling, optional keyed checksum, `packBits`/`unpackBits`. |
| `static-kit/save/file` | Download a save file / pick and read one. |
| `static-kit/rng` | Seeded sfc32 PRNG with cyrb128 string seeding; `int/float/chance/pick/shuffle/weighted`; serializable `state()` / `restoreRng()`. |
| `static-kit/daily` | Date keys in a chosen time zone, puzzle numbers, streaks, share text, countdown to next day. |
| `static-kit/catalog` | The Ondol Works product list (single source) plus `listProducts({kind,status,exclude})` and `renderOtherTools(lang, currentId)`, which returns a "more tools" line as an HTML string (no DOM, build-time friendly). `soon` items render as plain text, desktop apps link to their Microsoft Store page. Self-contained: vendor `dist/catalog.js` alone. |

**Hashes are not storage.** A hash (CRC, SHA…) is one-way: you cannot recover data from it. The data lives in the payload (compressed + encoded, decodable by anyone); the CRC only detects typos and truncation. It is not encryption. The optional `key` mixes a client-side key into the checksum — since the key ships with the client, this is **deterrence, not security**.

## Design note: short roguelike save codes

Save the *inputs* of generation, not its outputs: seed + floor + exploration bitmask + player/inventory + RNG state. The map is regenerated deterministically from `(seed, floor)`. See [`examples/roguelike.ts`](examples/roguelike.ts); measured code lengths are in the table above (219 / 275 / 413 chars vs. 353 / 411 / 688 when saving the whole map).

**Save scumming cannot be prevented client-side** (copy a code, die, paste it back). Mitigations: export only at checkpoints, consume the slot on load, keep RNG state in the save so rewinding replays the same rolls; anything competitive needs server-side validation.

## Development

`npm run build` (Vite library mode + `tsc` declarations), `npm test` (vitest), `npm run typecheck`, `npm run measure`, `npm run test:integration` (headless Edge via CDP).

## License

MIT © 2026 slnu21 (SlnU)
