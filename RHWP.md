# rhwp

[rhwp](https://github.com/edwardkim/rhwp)는 Rust + WebAssembly 기반의 오픈소스 HWP/HWPX(한글 문서) 뷰어/에디터. HWP 5.0 바이너리, HWPX(XML), HML(HWPML) 세 포맷을 파싱해서 SVG/Canvas로 렌더링함.

npm 패키지는 두 개로 나뉘어 있고, 이 프로젝트는 그중 **`@rhwp/editor`**를 씀.

## `@rhwp/core` — 안 씀

WASM 파서/렌더러를 직접 호출하는 저수준 API. 파일을 읽어서 SVG 문자열로 렌더링만 함, 편집 기능 없음.

```js
import init, { HwpDocument } from '@rhwp/core';
await init({ module_or_path: '/rhwp_bg.wasm' });
const doc = new HwpDocument(new Uint8Array(bytes));
el.innerHTML = doc.renderPageSvg(0);
```

- 읽기 전용 뷰어에 적합, 우리 앱 컴포넌트 안에 자연스럽게 박아 넣기 쉬움
- WASM 바이너리를 직접 다뤄야 함 (번들링/에셋 경로 신경 써야 함)

## `@rhwp/editor` — 이걸 씀

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
| `editor.exportHwp()` / `exportHwpx()` / `exportHml()` | 현재 문서를 바이트로 내보내기 |
| `editor.destroy()` | 에디터 제거 |

`options.studioUrl`을 안 주면 기본값은 공개 데모(`https://edwardkim.github.io/rhwp/`)를 iframe에 로드함. 나중에 자체 호스팅하려면 `rhwp-studio`를 직접 빌드해서 이 URL을 바꿔주면 됨.

### 알아둬야 할 제약

README의 "hwpctl 호환 Action API (InsertText, Field API 등)"는 **이 npm 패키지엔 아직 노출 안 됨**. 즉 문서 중간에 텍스트를 부분적으로 삽입하는 기능이 없고, **내용을 바꾸려면 완성된 HWP/HWPX/HML 파일 전체를 만들어서 `loadFile()`에 다시 넣어야 함**. 이게 markdown → 문서 변환 파이프라인을 설계할 때 제일 중요한 제약.

## 이 프로젝트에서의 위치

`apps/web/src/components/HwpEditor.tsx` — `createEditor()`를 감싼 React 컴포넌트. 아직 실제 markdown 콘텐츠는 안 채워져 있고 (에디터가 뜨는지 플러밍만 검증된 상태), agent가 만든 markdown을 HML로 변환해서 `loadFile()`에 넣는 단계가 다음 작업.
