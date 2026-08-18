import httpx
from agent.properties import LITELLM_BASE_URL, LITELLM_MASTER_KEY

# litellm의 /mcp-rest/tools/call은 이름만으로는 안 되고(서버가 여러 개면 이름이
# 겹칠 수 있어서) 등록할 때 발급된 server_id(UUID)가 있어야 호출이 통과한다 —
# tools/list 응답 자체엔 UUID가 안 들어있어서 별도 조회로 이름→UUID 매핑을 만든다.


async def list_mcp_tools() -> list[dict]:
    """litellm에 등록된 모든 MCP tool의 메타데이터(이름/설명/입력 스키마/서버 UUID)를
    조회한다. UI에서 새 서버를 등록/삭제하면 다음 호출부터 바로 반영됨 — agent
    프로세스를 재시작할 필요 없음."""
    async with httpx.AsyncClient() as client:
        servers_res = await client.get(
            f"{LITELLM_BASE_URL}/v1/mcp/server",
            headers={"Authorization": f"Bearer {LITELLM_MASTER_KEY}"},
        )
        servers_res.raise_for_status()
        server_id_by_name = {
            server["server_name"]: server["server_id"] for server in servers_res.json()
        }

        tools_res = await client.get(
            f"{LITELLM_BASE_URL}/mcp-rest/tools/list",
            headers={"Authorization": f"Bearer {LITELLM_MASTER_KEY}"},
        )
        tools_res.raise_for_status()

    tools = []
    for tool in tools_res.json().get("tools", []):
        server_name = tool.get("mcp_info", {}).get("server_name")
        server_id = server_id_by_name.get(server_name)
        if not server_id:
            continue
        tools.append(
            {
                "name": tool["name"],
                "description": tool.get("description") or "",
                "input_schema": tool.get("inputSchema") or {"type": "object", "properties": {}},
                "server_id": server_id,
            }
        )
    return tools


def to_openai_tool_schema(mcp_tool: dict) -> dict:
    """bind_tools()에 write_document(@tool 데코레이터)랑 나란히 넘길 수 있는 형태.
    실제 실행은 이 스키마가 아니라 conditional_edges.py가 tool_call 이름을 보고
    MCP_TOOL 노드로 라우팅해서 call_mcp_tool()로 한다 — 이 스키마는 LLM에게
    "이런 tool이 있다"만 알려주는 용도."""
    return {
        "type": "function",
        "function": {
            "name": mcp_tool["name"],
            "description": mcp_tool["description"],
            "parameters": mcp_tool["input_schema"],
        },
    }


async def call_mcp_tool(server_id: str, name: str, arguments: dict) -> str:
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{LITELLM_BASE_URL}/mcp-rest/tools/call",
            headers={"Authorization": f"Bearer {LITELLM_MASTER_KEY}"},
            json={"server_id": server_id, "name": name, "arguments": arguments},
        )
        res.raise_for_status()
        data = res.json()

    return "".join(
        part.get("text", "") for part in data.get("content", []) if part.get("type") == "text"
    )
