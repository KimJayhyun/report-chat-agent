# rhwp

[rhwp](https://github.com/edwardkim/rhwp)는 Rust + WebAssembly 기반의 오픈소스 HWP/HWPX(한글 문서) 뷰어/에디터. HWP 5.0 바이너리, HWPX(XML), HML(HWPML) 세 포맷을 파싱해서 SVG/Canvas로 렌더링함.

npm 패키지는 두 개로 나뉘어 있고, 둘 다 `apps/web`에 설치돼 있음 (`@rhwp/editor` — 화면에 뜨는 뷰어, `@rhwp/core` — 문서 조립 엔진). 역할 분리는 맨 아래 "결정" 섹션 참고.

## `@rhwp/core` — 템플릿/썸네일용으로 채택

> 설치 완료, 실제로 연결됨: `import wasmUrl from '@rhwp/core/rhwp_bg.wasm?url'` + `init({ module_or_path: wasmUrl })` — Vite dev 서버에서 `.wasm`이 `application/wasm`으로 정상 서빙되는 것 확인함 ([apps/web/src/lib/hwpCoreTemplates.ts](apps/web/src/lib/hwpCoreTemplates.ts)). `HwpDocument.createEmpty()` → `insertText`/`insertParagraph`/`applyCharFormat` → `renderPageSvg()`까지 Node에서 직접 실행해 실동작 검증함.

WASM으로 컴파일된 Rust 엔진을 **거의 그대로** 바인딩한 저수준 API. `@rhwp/editor`(iframe, 제한된 postMessage RPC)와 달리 엔진의 편집 기능 대부분이 그대로 노출돼 있음 — `HwpDocument` 클래스 하나에 2000줄 넘는 메서드가 있음 (텍스트 삽입/삭제, 서식, 표, 필드, 스타일, 번호 매기기 등).

```js
import init, { HwpDocument } from '@rhwp/core';
await init({ module_or_path: '/rhwp_bg.wasm' });
const doc = new HwpDocument(new Uint8Array(bytes));
el.innerHTML = doc.renderPageSvg(0);
```

- 읽기/쓰기 다 가능, UI(메뉴/툴바) 없이 우리 컴포넌트 안에 원하는 대로 박아 넣을 수 있음
- WASM 바이너리를 직접 다뤄야 함 (번들링/에셋 경로 신경 써야 함) — `@rhwp/editor`는 이걸 studio(iframe) 쪽에 위임해서 이 부담이 없었음

### 필드(템플릿) API — 있음

> ⚠️ 아래 "`@rhwp/editor`엔 필드 API가 없다"는 결론은 **`@rhwp/editor` 한정**이고, `@rhwp/core`는 다름. 처음엔 이 둘을 구분 안 하고 "rhwp엔 템플릿 기능이 없다"고 결론 냈었는데, `@rhwp/core`의 실제 `.d.ts`(`HwpDocument` 클래스)를 까보니 필드 관련 메서드가 그대로 노출돼 있었음. 정정함.

```typescript
getFieldList(): string;                    // [{fieldId, fieldType, name, guide, command, value, location}]
getFieldValue(field_id: number): string;
getFieldValueByName(name: string): string;
setFieldValue(field_id: number, value: string): string;
setFieldValueByName(name: string, value: string): string;
insertClickHereField(
  section_idx: number, para_idx: number, char_offset: number,
  guide: string, memo: string, name: string, editable: boolean,
): string;
insertText(section_idx: number, para_idx: number, char_offset: number, text: string): string;
// ↑ 문서 전체 교체 없이 부분 삽입도 가능 (editor의 loadFile 방식과 다름)
```

보고서 유형별 템플릿(.hwp, 필드 이름 미리 배치) → `new HwpDocument(templateBytes)` → `getFieldList()`로 필드 확인 → 서버가 준 키-값을 `setFieldValueByName(key, value)`로 채움 → `renderPageSvg()` / `exportHwp()` — 이 흐름이 실제로 됨.

### ⚠️ 함정: `insertParagraph(section, N)`은 "N 뒤에 추가"가 아니라 "N 위치에 삽입"

여러 줄짜리 문서를 코드로 조립할 때 걸렸던 버그. `insertParagraph(section_idx, para_idx)`는 새 빈 문단을 **`para_idx` 위치에 끼워 넣고 기존 내용을 뒤로 미는** 동작이지, "그 뒤에 추가"가 아님. 그래서 매번 `insertParagraph(0, i - 1)`처럼 호출하면 새 문단이 계속 맨 앞에 끼어들어서 **문서가 역순으로 쌓이고, 심지어 문단이 안 나뉘고 문자열이 그대로 이어붙는** 증상까지 생김 (문단 인덱스가 밀리면서 `insertText`가 엉뚱한 문단에 char_offset 0으로 텍스트를 계속 앞에 꽂아넣게 됨).

**끝에 이어붙이려면 항상 현재 문단 개수를 인덱스로 넘겨야 함**:
```js
doc.insertParagraph(0, doc.getParagraphCount(0));  // O: 끝에 추가
doc.insertParagraph(0, i - 1);                     // X: i-1 위치에 삽입, 기존 걸 뒤로 밂
```
실제로 3줄("AAA-first", "BBB-second", "CCC-third")을 두 방식으로 넣고 렌더링해서 렌더된 y좌표별 텍스트로 직접 확인함 — 틀린 방식은 `CCC-thirdBBB-secondAAA-first`(역순+한 줄로 뭉침), 맞는 방식은 세 줄이 순서대로 분리되어 나옴. [apps/web/scripts/generate-hwp-templates.mjs](apps/web/scripts/generate-hwp-templates.mjs)의 `buildParagraphs`에 반영함 — 나중에 필드 삽입(`insertClickHereField`)에서 여러 문단을 다룰 때도 같은 함정을 조심해야 함.

### HWP → markdown 변환 — 없음

`core`의 전체 타입 정의에 `markdown`이라는 단어 자체가 없음. `getTextRange`, `getTextInCell` 같은 저수준 텍스트 추출은 있지만 서식 있는 markdown으로 바꿔주는 기능은 없음 — 필요하면 직접 조립해야 함. (참고: `edwardkim/rhwp`와 무관한 별도 패키지 `@ohah/hwpjs`가 HWP→Markdown 변환을 표방함. 지금 방향은 반대(markdown→HWP)라 당장은 무관.)

## `@rhwp/editor` — 지금 코드에 연결돼 있음 (재검토 중)

메뉴/툴바/서식 편집까지 포함된 완전한 HWP 에디터를 **iframe으로 통째로 임베드**. 실제 편집 UI는 `edwardkim.github.io/rhwp`에 호스팅된 "rhwp-studio"이고, 우리 앱은 그 iframe과 `postMessage`로 통신하는 얇은 래퍼(`createEditor()`)만 npm으로 설치하는 구조.

```js
import { createEditor } from '@rhwp/editor';
const editor = await createEditor('#container');
await editor.loadFile(bytes, 'document.hwp');
```

- WASM을 우리가 직접 다룰 필요 없음 (studio 쪽에서 처리)
- 메뉴/툴바까지 포함된 풀 에디터를 거의 공짜로 얻음

### 실제 공개 API (`index.d.ts` 기준, v0.8.2)

| 메서드 | 설명 |
|---|---|
| `createEditor(container, options?)` | 에디터 생성, iframe 마운트 |
| `editor.loadFile(bytes, fileName?, options?)` | HWP/HWPX/HML 파일을 **통째로** 로드 |
| `editor.getPageSvg(page?)` | 렌더링된 페이지를 SVG로 |
| `editor.pageCount()` | 페이지 수 |
| `editor.getRendererDiagnostics(page?)` | 선택된 renderer + 페이지별 readiness 진단 |
| `editor.exportHwp()` / `exportHwpx()` / `exportHml()` | 현재 문서를 바이트로 내보내기 |
| `editor.getHmlSaveState()` | 현재 문서가 HML로 저장 가능한지 + blocker 목록 |
| `editor.exportHwpVerify()` | HWP 직렬화 후 자기 재로드 검증 메타데이터 |
| `editor.notifySaved(fileName?)` | 내보내기 바이트 영속화 완료를 studio에 통지 |
| `editor.element` | 내부 `<iframe>` 엘리먼트 (readonly) |
| `editor.destroy()` | 에디터 제거 |

이 표는 `index.d.ts`(`RhwpEditor` 클래스)에 정의된 메서드 전부이자, `rhwp-studio`의 postMessage RPC 허용 목록(`src/embed/rpc-router.ts`)과도 정확히 일치함 — 즉 이게 embed로 닿을 수 있는 API의 전부.

`options.studioUrl`을 안 주면 기본값은 공개 데모(`https://edwardkim.github.io/rhwp/`)를 iframe에 로드함. 나중에 자체 호스팅하려면 `rhwp-studio`를 직접 빌드해서 이 URL을 바꿔주면 됨.

### 알아둬야 할 제약

README의 "hwpctl 호환 Action API (InsertText, Field API 등)"는 **이 npm 패키지엔 아직 노출 안 됨**. 즉 문서 중간에 텍스트를 부분적으로 삽입하는 기능이 없고, **내용을 바꾸려면 완성된 HWP/HWPX/HML 파일 전체를 만들어서 `loadFile()`에 다시 넣어야 함**. 이게 markdown → 문서 변환 파이프라인을 설계할 때 제일 중요한 제약.

### 템플릿(필드 채우기)은 안 됨

HWP엔 "필드(누름틀)" 라는 mail-merge 스타일 기능이 실제로 있고, 엔진/CLI 레벨에선 지원됨:

- `rhwp-studio`엔 필드 삽입/편집 다이얼로그가 있음 (`src/ui/field-insert-dialog.ts`, `field-edit-dialog.ts`) — **사람이 수동으로** 문서 만들 때만 씀
- Rust CLI엔 `rhwp fields <file> --json`로 문서 안 필드 목록(이름·안내문·위치)을 읽는 기능이 있음

하지만 둘 다 우리가 쓰는 embed API로는 안 열려 있음:

1. `fields` CLI는 소스에 `#![cfg(not(target_arch = "wasm32"))]`로 박혀 있어서 **WASM(브라우저) 빌드엔 아예 안 들어감**
2. `rhwp-studio`와 우리 iframe 사이의 postMessage RPC 허용 목록(`src/embed/rpc-router.ts`)엔 필드 관련 메서드가 없음 — 허용된 건 `ready, loadFile, pageCount, getRendererDiagnostics, getPageSvg, exportHwp, exportHwpx, exportHml, getHmlSaveState, exportHwpVerify, notifySaved`가 전부이고, 그 외 메서드는 `Unknown method` 에러로 막힘

**결론**: `loadFile()`로 직접 만든 `.hwp`를 "시작 문서"로 불러오는 건 되지만, 그 안의 필드를 코드로 찾아서 값을 채워 넣는 건 안 됨. "재사용 가능한 빈칸 템플릿" 방식이 아니라, **markdown을 매번 완성된 HML 문서로 통째로 새로 만들어서 `loadFile()`에 넣는 방식**으로 가야 함.

## 이 프로젝트에서의 위치

`apps/web/src/components/HwpEditor.tsx` — `createEditor()`를 감싼 React 컴포넌트, `@rhwp/editor` 기반. 아직 실제 markdown 콘텐츠는 안 채워져 있고 (에디터가 뜨는지 플러밍만 검증된 상태).

## 결정: editor와 core를 역할 나눠서 같이 쓴다

either/or가 아니라 **역할 분리**로 확정:

- **`@rhwp/core`** — 화면엔 안 뜨고, 문서를 조립하는 엔진으로만 씀
- **`@rhwp/editor`** — 화면(채팅창 오른쪽)에 뜨는, 최종 결과를 보여주는 창. `HwpEditor.tsx` 그대로 유지

파이프라인:

```
1. core:   new HwpDocument(templateBytes)          템플릿 로드
2. core:   getFieldList() → setFieldValueByName()  서버가 준 키-값으로 필드 채움
3. core:   exportHwp() / exportHwpx()               채워진 문서를 바이트로 export
4. editor: editor.loadFile(그 바이트)               화면에 렌더링
```

`editor.loadFile()`이 받는 바이트 포맷(HWP/HWPX/HML)과 `core.exportHwp()`/`exportHwpx()`가 내놓는 바이트 포맷이 그대로 맞아떨어져서 핸드오프가 깔끔함. 덤으로 사용자가 결과물을 손으로 고치고 싶으면 editor의 툴바/메뉴가 이미 있으니 그것도 같이 딸려옴.

남은 작업: 지금 템플릿엔 필드(누름틀)가 없음 — `insertClickHereField`로 필드 이름 미리 배치 + 서버가 주는 키-값 스키마 확정.

## 템플릿 파일은 어디 있나

실제 `.hwp` 파일로 만들어서 **`apps/web`(React app) 안에 정적 파일로** 둠 (브라우저가 매번 새로 조립하지 않음). Python agent는 이 파일과 무관함 — agent는 채팅 응답만 담당하고, 템플릿은 순수 프론트엔드 자산.

- 생성: [apps/web/scripts/generate-hwp-templates.mjs](apps/web/scripts/generate-hwp-templates.mjs) — `@rhwp/core`로 `HwpDocument.createEmpty()` → `insertText`/`insertParagraph` → `exportHwp()`. 템플릿 내용 바꾸면 이 스크립트 다시 실행(`node scripts/generate-hwp-templates.mjs`, `apps/web`에서).
- 저장 위치: `apps/web/public/templates/*.hwp` (지금은 `planning-report.hwp`, `press-release.hwp` 2개) — Vite가 `public/` 아래를 그대로 정적 서빙하므로 `/templates/{id}.hwp`로 바로 접근됨
- 소비: [apps/web/src/lib/hwpCoreTemplates.ts](apps/web/src/lib/hwpCoreTemplates.ts)의 `renderTemplateSvg(id)`가 같은 origin에서 `fetch("/templates/{id}.hwp")`로 bytes를 받아서 `new HwpDocument(bytes)` → `renderPageSvg(0)`으로 썸네일 렌더링

> 한 번 agent(Starlette `StaticFiles`)에 저장하는 걸로 잘못 만들었다가(불필요한 백엔드 왕복 + CORS) 되돌림 — 템플릿은 백엔드 리소스가 아니라 프론트엔드 정적 자산이라는 게 맞는 그림.
