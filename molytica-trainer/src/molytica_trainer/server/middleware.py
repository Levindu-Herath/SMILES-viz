"""Private Network Access support for browser -> localhost preflights.

Pure-ASGI (not BaseHTTPMiddleware) so streaming responses such as the
`/train/{job_id}/stream` SSE endpoint are never wrapped or buffered.
"""
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class PrivateNetworkAccessMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "OPTIONS":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        wants_pna = headers.get(b"access-control-request-private-network") == b"true"
        if not wants_pna:
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                message["headers"].append(
                    (b"access-control-allow-private-network", b"true")
                )
            await send(message)

        await self.app(scope, receive, send_wrapper)
