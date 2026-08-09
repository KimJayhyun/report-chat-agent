const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://127.0.0.1:9999";

interface JsonRpcResponse {
  result?: {
    task?: {
      artifacts?: { parts?: { text?: string }[] }[];
    };
  };
  error?: { message: string };
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

  const artifactText = body.result?.task?.artifacts
    ?.flatMap((artifact) => artifact.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("");

  return artifactText ?? "";
}
