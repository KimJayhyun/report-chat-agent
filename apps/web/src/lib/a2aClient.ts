const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://127.0.0.1:9999";

// litellm proxy의 관리 UI — 모델/키 등을 여기서 직접 설정할 수 있게 딥링크로만 씀
// (agent를 거치지 않고 브라우저에서 바로 여는 링크라 agent API랑은 무관).
export const LITELLM_UI_URL =
  (import.meta.env.VITE_LITELLM_URL ?? "http://localhost:4000") + "/ui";

function textFromParts(parts?: { text?: string }[]): string {
  return (
    parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("") ?? ""
  );
}

interface StreamEvent {
  result?: {
    // 스트림의 첫 이벤트(TASK_STATE_SUBMITTED 전, task 최초 생성) — contextId가 여기서만 옴.
    task?: { contextId?: string };
    statusUpdate?: {
      // status 안이 아니라 statusUpdate와 형제 필드로 옴.
      contextId?: string;
      status?: {
        state?: string;
        message?: {
          parts?: { text?: string }[];
          metadata?: { tag?: string };
        };
      };
    };
  };
  error?: { message: string };
}

// executor.py가 write_document 체인 청크에 이 값을 message.metadata.tag로 실어 보냄.
const WRITE_DOCUMENT_TAG = "write_document";

/**
 * 스트림 도중 에러가 나도, 그 전에 서버가 이미 발급한 contextId(Task 생성 이벤트가
 * 제일 먼저 오므로 거의 항상 존재)는 살려서 던진다 — 안 이러면 호출부가 catch에서
 * 이 턴의 contextId를 영영 알 수 없어서, 다음 메시지가 새 대화로 끊겨버린다.
 */
export class SendMessageStreamError extends Error {
  contextId?: string;

  constructor(message: string, contextId?: string) {
    super(message);
    this.name = "SendMessageStreamError";
    this.contextId = contextId;
  }
}

export interface SendMessageStreamOptions {
  onChunk: (chunk: string) => void;
  // 주어지면, write_document 태그가 붙은 청크(문서 작성 체인이 만든 본문)는
  // onChunk 대신 이쪽으로 라우팅된다 — 채팅 말풍선에는 안 섞인다.
  onDocumentChunk?: (chunk: string) => void;
  // 백엔드가 같은 대화(스레드)로 이어붙이는 기준값 — 첫 호출은 없어도 되고(서버가
  // 새로 발급), 반환값으로 그 값을 돌려주니 다음 호출부터는 그대로 넘기면 됨.
  contextId?: string;
  // litellm에 등록된 모델 이름 (agent의 GET /models로 조회). 생략하면 서버 기본값.
  model?: string;
}

/**
 * SendStreamingMessage(SSE)로 토큰이 오는 대로 onChunk를 호출한다.
 * SendMessage(일반 요청)는 task가 TASK_STATE_COMPLETED에 도달할 때까지 기다렸다가
 * 완성된 답변을 한 번에 돌려주는 반면, 이건 각 TASK_STATE_WORKING 조각을 그때그때 전달한다.
 */
export async function sendMessageStream(
  text: string,
  options: SendMessageStreamOptions,
): Promise<string | undefined> {
  const { onChunk, onDocumentChunk, contextId, model } = options;

  const payload = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "SendStreamingMessage",
    params: {
      message: {
        messageId: crypto.randomUUID(),
        role: "ROLE_USER",
        parts: [{ text }],
        ...(contextId ? { contextId } : {}),
        ...(model ? { metadata: { model } } : {}),
      },
    },
  };

  let observedContextId = contextId;

  // 어디서 실패하든(네트워크 오류, 파싱 오류, 서버가 보낸 명시적 error 이벤트) 그때까지
  // observedContextId에 쌓인 값을 SendMessageStreamError에 실어 던진다 — Task 생성
  // 이벤트가 스트림에서 제일 먼저 오기 때문에 거의 항상 뭔가는 잡혀 있고, 이게 없으면
  // 호출부는 이번 턴의 contextId를 영영 모른 채 다음 메시지를 새 대화로 보내게 된다.
  try {
    const res = await fetch(`${AGENT_URL}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "A2A-Version": "1.0",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Stream request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;

        const event: StreamEvent = JSON.parse(jsonStr);
        if (event.error) {
          throw new Error(event.error.message);
        }

        observedContextId =
          event.result?.task?.contextId ?? event.result?.statusUpdate?.contextId ?? observedContextId;

        const status = event.result?.statusUpdate?.status;

        // TASK_STATE_COMPLETED의 message는 새 조각이 아니라 지금까지 누적된
        // 전체 텍스트를 다시 담고 있음 — onChunk로 또 이어붙이면 중복됨.
        if (status?.state === "TASK_STATE_COMPLETED") return observedContextId;

        const chunkText = textFromParts(status?.message?.parts);
        if (!chunkText) continue;

        if (status?.message?.metadata?.tag === WRITE_DOCUMENT_TAG) {
          onDocumentChunk?.(chunkText);
        } else {
          onChunk(chunkText);
        }
      }
    }

    return observedContextId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SendMessageStreamError(message, observedContextId);
  }
}

/**
 * agent의 GET /models(litellm proxy의 /v1/models를 그대로 전달)를 조회해서
 * 선택 가능한 모델 이름 목록을 돌려준다. 모델 목록은 litellm-config.yaml이
 * 유일한 출처라 프론트에는 하드코딩하지 않는다.
 */
export async function listModels(): Promise<string[]> {
  const res = await fetch(`${AGENT_URL}/models`);
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  const body: { data?: { id: string }[] } = await res.json();
  return body.data?.map((model) => model.id) ?? [];
}

export interface SessionSummary {
  context_id: string;
  title: string;
  updated_at: string | null;
}

export interface Session {
  context_id: string;
  messages: { role: "user" | "agent"; text: string }[];
  document_draft: string | null;
}

/** Postgres에 남아있는 대화(thread_id)별 최신 상태를 조회 — 최근순으로 정렬돼서 옴. */
export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${AGENT_URL}/sessions`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`);
  }
  const body: { sessions?: SessionSummary[] } = await res.json();
  return body.sessions ?? [];
}

/** 이전 대화를 다시 열 때 채팅창/문서초안을 복원하는 데 필요한 것만 받아온다. */
export async function getSession(contextId: string): Promise<Session> {
  const res = await fetch(`${AGENT_URL}/sessions/${contextId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch session: ${res.status}`);
  }
  return res.json();
}
