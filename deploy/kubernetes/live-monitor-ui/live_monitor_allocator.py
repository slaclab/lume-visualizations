"""Lightweight session allocator for the live monitor.

Assigns each browser to one of N worker pods via redirect, ensuring at most
one active user per worker.  The browser is redirected to
``/live-monitor/wN/`` and all subsequent traffic (HTTP + WebSocket) goes
directly through nginx to that worker — no proxy relay.

Run with:
    python live_monitor_allocator.py --host 0.0.0.0 --port 2720
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import time
import uuid

from aiohttp import web

LOGGER = logging.getLogger(__name__)
COOKIE_NAME = "LUME_WORKER_SESSION"


class SessionAllocator:
    def __init__(self, worker_count: int, session_timeout: float):
        self.worker_count = worker_count
        self.session_timeout = session_timeout
        # cookie_value -> (worker_index, last_activity)
        self._sessions: dict[str, tuple[int, float]] = {}
        self._lock = asyncio.Lock()

    async def assign(self, cookie: str | None) -> tuple[str, int]:
        """Return ``(cookie, worker_index)`` for a session."""
        async with self._lock:
            now = time.time()
            self._purge_expired(now)

            if cookie and cookie in self._sessions:
                worker_index, _ = self._sessions[cookie]
                self._sessions[cookie] = (worker_index, now)
                return cookie, worker_index

            used = {wi for (wi, _) in self._sessions.values()}
            for i in range(self.worker_count):
                if i not in used:
                    new_cookie = uuid.uuid4().hex
                    self._sessions[new_cookie] = (i, now)
                    LOGGER.info(
                        "Assigned session %s to worker %d", new_cookie[:8], i,
                    )
                    return new_cookie, i

            raise web.HTTPServiceUnavailable(
                text=(
                    f"All {self.worker_count} live monitor sessions are in "
                    "use. Please try again later."
                ),
            )

    async def heartbeat(self, cookie: str) -> bool:
        async with self._lock:
            if cookie in self._sessions:
                worker_index, _ = self._sessions[cookie]
                self._sessions[cookie] = (worker_index, time.time())
                return True
            return False

    async def release(self, cookie: str) -> None:
        async with self._lock:
            entry = self._sessions.pop(cookie, None)
            if entry:
                LOGGER.info(
                    "Released session %s (worker %d)", cookie[:8], entry[0],
                )

    async def snapshot(self) -> dict:
        async with self._lock:
            self._purge_expired(time.time())
            return {
                "active_sessions": len(self._sessions),
                "worker_count": self.worker_count,
            }

    def _purge_expired(self, now: float) -> None:
        expired = [
            cookie
            for cookie, (_, last_seen) in self._sessions.items()
            if now - last_seen > self.session_timeout
        ]
        for cookie in expired:
            worker_index = self._sessions.pop(cookie)[0]
            LOGGER.info(
                "Expired session %s (worker %d, idle %.0f s)",
                cookie[:8],
                worker_index,
                now - self._sessions.get(cookie, (0, now))[1],
            )

    async def cleanup_forever(self, interval: float = 30.0) -> None:
        while True:
            await asyncio.sleep(interval)
            async with self._lock:
                self._purge_expired(time.time())


# ---------------------------------------------------------------------------
# Request handlers
# ---------------------------------------------------------------------------

async def handle_navigation(request: web.Request) -> web.Response:
    allocator: SessionAllocator = request.app["allocator"]
    base_url: str = request.app["base_url"]
    existing_cookie = request.cookies.get(COOKIE_NAME)
    cookie, worker_index = await allocator.assign(existing_cookie)
    location = f"{base_url}/w{worker_index}/"
    if request.query_string:
        location = f"{location}?{request.query_string}"
    response = web.HTTPTemporaryRedirect(location=location)
    response.set_cookie(
        COOKIE_NAME,
        cookie,
        max_age=3600,
        path=base_url,
        httponly=True,
        samesite="Lax",
    )
    return response


async def handle_heartbeat(request: web.Request) -> web.Response:
    allocator: SessionAllocator = request.app["allocator"]
    cookie = request.cookies.get(COOKIE_NAME)
    if cookie and await allocator.heartbeat(cookie):
        return web.json_response({"status": "ok"})
    return web.json_response({"status": "expired"}, status=404)


async def handle_release(request: web.Request) -> web.Response:
    allocator: SessionAllocator = request.app["allocator"]
    cookie = request.cookies.get(COOKIE_NAME)
    if cookie:
        await allocator.release(cookie)
    return web.json_response({"status": "released"})


async def healthz(request: web.Request) -> web.Response:
    allocator: SessionAllocator = request.app["allocator"]
    return web.json_response(await allocator.snapshot())


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

async def _app_context(app: web.Application):
    cleanup_task = asyncio.create_task(
        app["allocator"].cleanup_forever(),
    )
    try:
        yield
    finally:
        cleanup_task.cancel()
        await asyncio.gather(cleanup_task, return_exceptions=True)


def create_app(
    base_url: str = "/live-monitor",
    worker_count: int = 5,
    session_timeout: float = 3600.0,
) -> web.Application:
    app = web.Application()
    app["allocator"] = SessionAllocator(worker_count, session_timeout)
    app["base_url"] = base_url.rstrip("/")
    app.cleanup_ctx.append(_app_context)
    app.router.add_get("/healthz", healthz)
    app.router.add_post(f"{base_url}/heartbeat", handle_heartbeat)
    app.router.add_post(f"{base_url}/release", handle_release)
    # Everything else is a navigation request → redirect to a worker.
    app.router.add_route("*", "/{tail:.*}", handle_navigation)
    return app


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    parser = argparse.ArgumentParser(description="Live monitor session allocator")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=2720)
    parser.add_argument(
        "--base-url",
        default=os.environ.get("LUME_BASE_URL", "/live-monitor"),
    )
    parser.add_argument(
        "--worker-count",
        type=int,
        default=int(os.environ.get("LUME_WORKER_COUNT", "5")),
    )
    parser.add_argument(
        "--session-timeout",
        type=float,
        default=float(os.environ.get("LUME_SESSION_TIMEOUT_SECONDS", "3600")),
    )
    args = parser.parse_args()
    web.run_app(
        create_app(args.base_url, args.worker_count, args.session_timeout),
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
