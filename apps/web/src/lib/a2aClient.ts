const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://127.0.0.1:9999";

interface JsonRpcResponse {
  result?: {
    task?: {
      status?: {
        message?: { parts?: { text?: string }[] };
      };
      artifacts?: { parts?: { text?: string }[] }[];
    };
  };
  error?: { message: string };
}

function textFromParts(parts?: { text?: string }[]): string {
  return (
    parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("") ?? ""
  );
}

export async function sendMessage(text: string): Promise<string> {
  const payload = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "SendMessage",
    params: {
      message: {
        messageId: crypto.randomUUID(),
        role: "ROLE_USER",
        parts: [{ text }],
      },
    },
  };

  const res = await fetch(`${AGENT_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "A2A-Version": "1.0",
    },
    body: JSON.stringify(payload),
  });

  const body: JsonRpcResponse = await res.json();
  if (body.error) {
    throw new Error(body.error.message);
  }

  const task = body.result?.task;

  // 최종 답변은 지금 executor 기준 task.status.message에 실려 옴.
  // artifacts는 (다른 executor 구현 대비) 폴백으로만 확인.
  const statusText = textFromParts(task?.status?.message?.parts);
  if (statusText) return statusText;

  const artifactText = task?.artifacts
    ?.flatMap((artifact) => artifact.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("");

  return artifactText ?? "";
}

interface StreamEvent {
  result?: {
    statusUpdate?: {
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
 * SendStreamingMessage(SSE)로 토큰이 오는 대로 onChunk를 호출한다.
 * SendMessage(일반 요청)는 task가 TASK_STATE_COMPLETED에 도달할 때까지 기다렸다가
 * 완성된 답변을 한 번에 돌려주는 반면, 이건 각 TASK_STATE_WORKING 조각을 그때그때 전달한다.
 *
 * onDocumentChunk가 주어지면, write_document 태그가 붙은 청크(문서 작성 체인이
 * 만든 본문)는 onChunk 대신 이쪽으로 라우팅된다 — 채팅 말풍선에는 안 섞인다.
 */
export async function sendMessageStream(
  text: string,
  onChunk: (chunk: string) => void,
  onDocumentChunk?: (chunk: string) => void,
): Promise<void> {
  const payload = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "SendStreamingMessage",
    params: {
      message: {
        messageId: crypto.randomUUID(),
        role: "ROLE_USER",
        parts: [{ text }],
      },
    },
  };

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

      const status = event.result?.statusUpdate?.status;

      // TASK_STATE_COMPLETED의 message는 새 조각이 아니라 지금까지 누적된
      // 전체 텍스트를 다시 담고 있음 — onChunk로 또 이어붙이면 중복됨.
      if (status?.state === "TASK_STATE_COMPLETED") return;

      const chunkText = textFromParts(status?.message?.parts);
      if (!chunkText) continue;

      if (status?.message?.metadata?.tag === WRITE_DOCUMENT_TAG) {
        onDocumentChunk?.(chunkText);
      } else {
        onChunk(chunkText);
      }
    }
  }
}
