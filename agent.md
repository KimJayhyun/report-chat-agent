# report-chat-agent — 세션 인계 문서

다른 세션에서 이어서 작업할 때 필요한 맥락만 정리. 코드 자체가 최신 진실이니 여긴
"왜 이렇게 돼 있는지"와 "뭘 하다 말았는지" 위주로만 씀.

## 뭘 만드는 중인가

React/Vite 채팅 UI(`apps/web`) + Python A2A 프로토콜 agent 백엔드(`apps/agent`)로 된
모노레포. 채팅으로 지시하면 LangGraph 기반 agent가 `write_document` tool을 호출해
마크다운 보고서를 작성하고, 그걸 실시간으로 오른쪽 패널에 렌더링하다가 필요하면
`@rhwp/core`로 실제 HWP 파일로 변환할 수 있는 "공공보고서 작업공간" 데모.

## 스택 / 인프라

- `apps/agent`: Python, uv workspace, `a2a-sdk`(Google A2A 프로토콜) + LangGraph +
  `langchain-openai`. Starlette 서버, `./run_agent.sh`로 기동(포트 9999, 호스트에서 직접
  실행 — 도커 아님).
- `apps/web`: React + Vite + shadcn/ui(Radix, Nova preset) + Tailwind v4. `./run_front.sh`
  또는 `pnpm dev`(포트 5173).
- **LiteLLM proxy** (docker-compose, 포트 4000): LLM 라우팅을 전부 여기로 추상화. agent
  코드는 `ChatOpenAI(base_url=LITELLM_BASE_URL, model=<litellm model_name>)`만 알고, 실제
  provider(현재는 LM Studio 로컬 모델)는 `litellm-config.yaml`이 결정. MCP 서버 등록도
  여기서(UI: `localhost:4000/ui`, REST API로도 가능).
- **Postgres** (docker-compose, 포트 5432): agent의 LangGraph checkpointer(`agent` DB, 멀티턴
  대화 저장)와 litellm의 자체 상태(`litellm` DB, MCP 서버 등록 등)가 **같은 인스턴스,
  다른 DB**로 분리돼 있음 — 이유는 아래 "겪은 사고" 참고.
- **LM Studio**: `localhost:1234`, 모델 `gemma4-27b-a4b-it`(agent 밖에서 사용자가 직접
  켜야 함, 컨트롤 불가능한 외부 의존성).

## 실행 순서

```bash
docker compose up -d          # litellm + postgres
# LM Studio를 로컬에서 켜기 (모델 로드)
./run_agent.sh                # apps/agent, 포트 9999
./run_front.sh                # apps/web, 포트 5173
```

## 아키텍처 핵심 결정 (왜 이렇게 했는지)

- **LiteLLM을 proxy로**: `langchain_openai.ChatOpenAI`는 그대로 두고 `base_url`만 litellm으로
  바꾸는 방식이라 agent 코드 변경이 최소. 모델 추가/변경은 `litellm-config.yaml`이나
  LiteLLM UI에서만 하면 됨 — agent 재시작도 필요 없음(모델은 매 요청마다 `model=` 문자열로
  넘길 뿐, 미리 정해진 목록이 없음. `apps/agent/src/agent/graph/chains.py`의
  `LLMCollections._get_llm()` 참고).
- **MCP tool도 매 턴마다 동적 조회**: `apps/agent/src/agent/graph/mcp_tools.py`의
  `list_mcp_tools()`가 `nodes.py`의 `main()` 노드에서 매번 litellm에 물어봄(캐시 없음).
  UI에서 새 MCP 서버를 등록하면 agent 재시작 없이 다음 메시지부터 바로 씀. tool 실행은
  `/mcp-rest/tools/call`로 하는데, **`server_id`는 이름이 아니라 등록 시 발급되는
  UUID여야 함** — 이름으로 호출하면 조용히 실패하니 주의(`mcp_tools.py`가 이름→UUID
  매핑을 알아서 해줌).
- **멀티턴 = Postgres checkpointer + A2A context_id**: `executor.py`가 `task.context_id`를
  LangGraph의 `thread_id`로 그대로 씀. 프론트는 `contextIdRef`에 들고 있다가 다음 요청에
  같이 보냄(`apps/web/src/lib/a2aClient.ts`의 `sendMessageStream`). 스트림이 에러로
  끊겨도 그 전에 서버가 이미 발급한 contextId는 `SendMessageStreamError`에 실어서
  살림 — 안 그러면 재시도할 때 대화가 끊어짐.
- **`write_document` tool 하나로 생성/수정 둘 다 처리**: `document_draft` state 필드가
  있으면(이전에 한 번이라도 작성했으면) 프롬프트가 "기존 문서 수정" 모드로 자동 전환.
  별도 `edit_document` tool 안 만듦(사용자 요청).
- **세션 목록**: LangGraph 자체엔 "모든 대화 나열" API가 없어서, `apps/agent/src/agent/sessions.py`가
  `checkpoints` 테이블(jsonb 컬럼)을 직접 SQL로 읽음. 제목은 별도 필드가 없어서 각
  대화의 첫 질문(`query` 채널, 대화 내내 안 바뀜)을 그대로 씀.

## 겪은 사고 / 트러블슈팅 (반복하지 말 것)

- **litellm + Postgres DB 공유하면 안 됨**: 처음에 agent 체크포인터랑 litellm을 같은
  `agent` DB에 물렸다가, litellm의 Prisma 마이그레이션이 자기가 모르는 테이블
  (`checkpoints` 등)을 정리 대상으로 보고 **실제로 DROP해버림**. 지금은 `litellm`
  DB를 따로 만들어 분리(`docker/postgres-init/01-create-litellm-db.sql`, 새 환경에서만
  자동 적용됨 — 기존 볼륨엔 수동으로 만들어야 함).
- **litellm 이미지 버전 지뢰밭** (Apple Silicon + Colima):
  - `litellm:main-stable`(arm64 네이티브) → 뜨자마자 SIGILL로 죽음.
  - `litellm-database:main-v1.26.13`(오래된 버전) → MCP 엔드포인트 자체가 없음, DB
    붙이면 Prisma CLI 런타임 설치 실패(`libatomic.so.1` 없음).
  - **`litellm-database:main-v1.83.14-stable`(amd64, Rosetta 에뮬레이션)로 고정** — 이게
    현재 정상 동작 확인된 조합. `docker-compose.yaml`에 이유 주석으로 남겨둠.
  - 이미 데이터 있는 DB에 새 litellm 버전을 붙이면 마이그레이션이 "baseline 재구성"을
    하느라 극도로 느림(120개 마이그레이션 순차 처리, ~20초씩) — DB를 비우고 처음부터
    migrate하면 훨씬 빠름.
- **떠 있는 agent 서버 프로세스가 코드 변경을 반영 못 함**: uvicorn은 핫리로드 없음.
  코드 고친 뒤엔 반드시 재시작해서 확인할 것(여러 번 이걸로 헛디딤 — "왜 안 되지" 하고
  삽질하다가 프로세스 시작 시각 vs 파일 수정 시각 비교해서 발견).
- **rhwp/core (`apps/web/src/lib/markdownToHwp.ts`, `hwpCoreTemplates.ts`)**:
  - `insertParagraph(section, N)`은 N *뒤에 추가*가 아니라 N *위치에 삽입*(뒤 내용을
    밀어냄) — 끝에 이어붙이려면 매번 `getParagraphCount()`를 인덱스로 넘겨야 함.
  - `globalThis.measureTextWidth`(canvas 기반)를 안 정의하면 글자가 겹쳐 보임.
  - **`applyCharFormat`가 "직전에 마지막으로 적용된 서식"을 다음 문단들이 계속
    물려받는 버그성 동작이 있음** — 문단마다 굵게 처리할 게 없어도 매번 명시적으로
    기본값(`{bold:false, fontSize:...}`)을 전체 범위에 다시 찍어야 새어 들어오는 걸
    막을 수 있음(`markdownToHwp.ts`의 `buildDocument` 참고).
  - `applyCharFormat`/`applyParaFormat`의 JSON 스키마는 공식 문서가 없어서
    `rhwp_bg.wasm`을 `strings`로 뒤져서 알아냄(키 이름, fontSize 단위 등).
- **LiteLLM MCP REST 호출 시 `server_id`는 UUID여야 함**: 등록할 때 응답으로 받은
  `server_id`를 저장해뒀다가 써야 하고, 이름으로 넘기면 "Tool not found"류 에러.
- **A2A `message.metadata`는 `google.protobuf.Struct`라 `.get()`이 없음** — `in`
  연산자로 확인해야 함(`executor.py` 참고).

## 지금까지 만든 것 (전부 실제로 브라우저/API로 검증 완료)

1. HWP 렌더링: markdown → `@rhwp/core`로 실제 HWP 파일 (`한글로 변환` 버튼), 헤딩/굵게
   서식 정상 적용.
2. 멀티턴 대화: Postgres checkpointer, 프론트 `contextIdRef`, 에러 시에도 contextId 보존.
3. LiteLLM 기반 모델 선택: 전송 버튼 옆 드롭다운, `GET /models`가 litellm의
   `/v1/models`를 그대로 중계(하드코딩 없음). 드롭다운에 "LiteLLM에서 모델 관리" 링크로
   `localhost:4000/ui` 새 탭 오픈.
4. MCP tool 통합: litellm에 등록된 MCP 서버의 tool을 매 턴 동적 조회 → `write_document`와
   함께 LLM에 제공 → 그래프가 tool 이름 보고 라우팅(`Node.MCP_TOOL`) → 실행 → 결과 반환.
   실제 더미 MCP 서버(add/get_weather tool)로 등록→조회→호출 전 과정 검증함.
5. 이전 대화 목록/재개: `GET /sessions`, `GET /sessions/{context_id}`, 클릭하면 채팅 +
   문서초안 복원하고 그 context_id로 이어서 대화 가능.
6. UI 정리: 툴바는 `새 보고서 작업`/`이전 대화`만(대화 탐색), 톱니바퀴엔 `문서서식
   선택`(설정류), 모델은 전송 버튼 옆(자주 씀). 죽어있던 버튼(클립, 작성 설정 대화)
   제거.

## 알려진 문제 / 안 끝난 것

- **`문서서식 선택`이 실제로는 백엔드에 전달 안 됨**: `apps/web/src/App.tsx`의
  `docFormat` state가 라벨 표시에만 쓰이고, `handleSend`가 `sendMessageStream` 호출할 때
  이 값을 안 보냄. 백엔드는 `document_format` 필드와 `get_document_format_guide()`로
  이미 받을 준비가 돼 있음 — 프론트에서 `metadata`(또는 비슷한 경로)로 실어 보내는
  작업만 남음.
- **"근거자료로 작성" 추천 카드**(`SUGGESTIONS` 배열, `App.tsx`)도 비슷한 문제 —
  "정부 보도자료를 찾아 근거를 확인한 뒤 작성합니다"라고 돼 있는데 실제 웹 검색 tool이
  없어서 못 지키는 약속. 지우거나 문구를 바꿔야 함(사용자 확인 대기 중).
- **파일 첨부 기능 — 지금 이 사이에 하던 작업, 미완성**:
  - 배경: "agent가 사용자 디렉토리에 접근할 수 있냐"는 질문에서 시작 → 서버가 사용자
    로컬 파일시스템에 직접 접근할 방법은 없다는 걸 확인 → 실제로 필요한 건 **브라우저에서
    파일을 골라 채팅에 첨부하는 기능**이라는 결론.
  - A2A 프로토콜이 `FilePart`(base64 인코딩, `FileWithBytes`: `bytes`/`mime_type`/`name`)를
    이미 지원함 확인함(`a2a.types`). 새 인프라 필요 없이 메시지 `parts`에 TextPart와
    나란히 넣으면 됨.
  - 스코프 결정: **텍스트 계열(.txt, .md)만 우선 지원**하기로 함(HWP까지 포함하는 옵션도
    검토했으나 텍스트만으로 시작하기로 결정). 브라우저에서 그냥 디코딩해서 바로 쓸 수
    있어 구현이 제일 간단함.
  - **여기서 대화가 끊김 — 다음 세션에서 할 일**:
    1. `apps/web/src/lib/a2aClient.ts`의 `sendMessageStream`이 파일(들)을 받아서
       `FilePart`로 `parts` 배열에 추가하도록 옵션 확장.
    2. `App.tsx`에 파일 선택 UI 복원(죽어있던 클립 버튼 자리) — `.txt`/`.md`만 accept,
       선택된 파일 chip으로 표시, 전송 시 내용을 base64로 읽어서 실어 보냄.
    3. agent 쪽: `executor.py`의 `get_message_text()`는 지금 TextPart만 읽을 텐데,
       FilePart도 디코딩해서 어딘가에 반영해야 함 — 어디에 반영할지(예: `query`에
       합치기 vs `messages`에 별도 컨텍스트로 추가 vs 새 state 필드) 아직 미정, 다음
       세션에서 설계 필요.
    4. `write_document` 프롬프트가 첨부 파일 내용을 참고 자료로 쓰도록 안내 문구 추가
       검토.

## 참고 파일 위치

- 그래프 정의: `apps/agent/src/agent/graph/graph.py`, 노드: `nodes.py`,
  `document/nodes.py`, 라우팅: `conditional_edges.py`, state: `states.py`,
  식별자 모음: `config.py`(전역 설정만, report/document 관련 로직은 각 노드 파일에
  콜로케이션 — 사용자 확정 원칙).
- MCP: `apps/agent/src/agent/graph/mcp_tools.py`.
- 세션 목록: `apps/agent/src/agent/sessions.py`.
- 프론트 A2A 클라이언트: `apps/web/src/lib/a2aClient.ts`.
- 프론트 메인 컴포넌트(거의 전부): `apps/web/src/App.tsx`.
- rHWP 관련: `apps/web/src/lib/markdownToHwp.ts`, `hwpCoreTemplates.ts`,
  `apps/web/src/components/HwpEditor.tsx`.
