# rhwp

[rhwp](https://github.com/edwardkim/rhwp)는 Rust + WebAssembly 기반의 오픈소스 HWP/HWPX(한글 문서) 뷰어/에디터. HWP 5.0 바이너리, HWPX(XML), HML(HWPML) 세 포맷을 파싱해서 SVG/Canvas로 렌더링함.

npm 패키지는 두 개로 나뉘어 있고, 둘 다 `apps/web`에 설치돼 있음 (`@rhwp/editor` — 화면에 뜨는 뷰어, `@rhwp/core` — 문서 조립 엔진). 역할 분리는 맨 아래 "결정" 섹션 참고.

## `@rhwp/core` — 템플릿/썸네일용으로 채택

> 설치 완료 (`pnpm add @rhwp/core`, v0.8.2). 다음 작업은 Vite에서 `rhwp_bg.wasm` 에셋을 어떻게 서빙할지(예: `?url` import) 정하고 실제로 `init()`이 되는지 확인하는 것.

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

남은 작업: `@rhwp/core` 설치(`rhwp_bg.wasm` 7.2MB, 서빙 방식 결정 필요) + 보고서 유형별 템플릿(.hwp, 필드 이름 미리 배치) 준비 + 서버가 주는 키-값 스키마 확정.
