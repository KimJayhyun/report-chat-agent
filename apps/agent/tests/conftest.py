import pytest

"""
uv run --directory apps/agent pytest              # LM Studio 없어도 통과 (unit만)
uv run --directory apps/agent pytest -m integration -s   # LM Studio 켜져 있어야 함
"""


@pytest.fixture
def anyio_backend():
    return "asyncio"
