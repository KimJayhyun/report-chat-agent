"""Manual HTTP smoke test for the agent server.

Usage:
    uv run --project apps/agent agent &   # start the server first
    uv run test.py
"""

import json

import httpx

BASE_URL = "http://127.0.0.1:9999"


def get_agent_card(client: httpx.Client) -> dict:
    res = client.get(f"{BASE_URL}/.well-known/agent-card.json")
    res.raise_for_status()
    return res.json()


def send_message(client: httpx.Client, text: str) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "SendMessage",
        "params": {
            "message": {
                "messageId": "test-msg-1",
                "role": "ROLE_USER",
                "parts": [{"text": text}],
            }
        },
    }
    res = client.post(
        f"{BASE_URL}/",
        json=payload,
        headers={"A2A-Version": "1.0"},
    )
    res.raise_for_status()
    return res.json()


if __name__ == "__main__":
    with httpx.Client() as client:
        print("=== agent card ===")
        print(json.dumps(get_agent_card(client), indent=2, ensure_ascii=False))

        print("\n=== SendMessage('hi') ===")
        print(json.dumps(send_message(client, "hi"), indent=2, ensure_ascii=False))
