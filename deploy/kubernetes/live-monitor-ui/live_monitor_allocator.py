"""Lightweight session allocator for the live monitor.

Assigns each browser tab to one of N worker pods via redirect, ensuring at
most one active user per worker.  The browser is redirected to
``/live-monitor/wN/`` and all subsequent traffic (HTTP + WebSocket) goes
directly through nginx to that worker — no proxy relay.

Worker occupancy is tracked by heartbeats: the page at ``/live-monitor/wN/``
periodically POSTs to ``/live-monitor/heartbeat?worker=N``.  Each new
navigation to ``/live-monitor/`` picks the lowest worker without a recent
heartbeat.  This is per-tab because each tab knows its own worker index from
its URL.

Run with:
    python live_monitor_allocator.py --host 0.0.0.0 --port 2720
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import time

from aiohttp import web

LOGGER = logging.getLogger(__name__)


class SessionAllocator:
    def __init__(self, worker_count: int, session_timeout: float):
        self.worker_count = worker_count
        self.session_timeout = session_timeout
        # worker_index -> last_heartbeat_time
        self._heartbeats: dict[int, float] = {}
        self._lock = asyncio.Lock()

    async def assign(self) -> int:
        """Return the lowest free worker index."""
        async with self._lock:
            now = time.time()
            self._purge_expired(now)
            busy = set(self._heartbeats.keys())
            for i in range(self.worker_count):
                if i not in busy:
                    # Immediately mark as busy so a second concurrent request
                    # doesn't get the same worker.
                    self._heartbeats[i] = now
                    LOGGER.info("Assigned worker %d", i)
                    return i
            raise web.HTTPServiceUnavailable(
                text=(
                    f"All {self.worker_count} live monitor sessions are in "
                    "use. Please try again later."
                ),
            )

    async def is_busy(self, worker_index: int) -> bool:
        """Return True if the worker has a recent heartbeat."""
        async with self._lock:
            self._purge_expired(time.time())
            return worker_index in self._heartbeats

    async def heartbeat(self, worker_index: int) -> bool:
        if not (0 <= worker_index < self.worker_count):
            return False
        async with self._lock:
            self._heartbeats[worker_index] = time.time()
            return True

    async def release(self, worker_index: int) -> None:
        async with self._lock:
            if self._heartbeats.pop(worker_index, None) is not None:
                LOGGER.info("Released worker %d", worker_index)

    async def snapshot(self) -> dict:
        async with self._lock:
            self._purge_expired(time.time())
            return {
                "active_sessions": len(self._heartbeats),
                "worker_count": self.worker_count,
                "busy_workers": sorted(self._heartbeats.keys()),
            }

    def _purge_expired(self, now: float) -> None:
        expired = [
            wi
            for wi, last_seen in self._heartbeats.items()
            if now - last_seen > self.session_timeout
        ]
        for wi in expired:
            del self._heartbeats[wi]
            LOGGER.info("Expired worker %d (heartbeat timeout)", wi)

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
    worker_index = await allocator.assign()
    location = f"{base_url}/w{worker_index}/"
    if request.query_string:
        location = f"{location}?{request.query_string}"
    return web.HTTPTemporaryRedirect(location=location)


async def handle_heartbeat(request: web.Request) -> web.Response:
    allocator: SessionAllocator = request.app["allocator"]
    worker_str = request.query.get("worker")
    if worker_str is None:
        return web.json_response({"error": "missing worker param"}, status=400)
    try:
        worker_index = int(worker_str)
    except ValueError:
        return web.json_response({"error": "invalid worker param"}, status=400)
    if await allocator.heartbeat(worker_index):
        return web.json_response({"status": "ok"})
    return web.json_response({"status": "invalid worker"}, status=404)


async def handle_release(request: web.Request) -> web.Response:
    allocator: SessionAllocator = request.app["allocator"]
    worker_str = request.query.get("worker")
    if worker_str is not None:
        try:
            await allocator.release(int(worker_str))
        except ValueError:
            pass
    return web.json_response({"status": "released"})


async def handle_worker_status(request: web.Request) -> web.Response:
    """Check if a specific worker is busy (used by JS on direct navigation)."""
    allocator: SessionAllocator = request.app["allocator"]
    worker_str = request.query.get("worker")
    if worker_str is None:
        return web.json_response({"error": "missing worker param"}, status=400)
    try:
        worker_index = int(worker_str)
    except ValueError:
        return web.json_response({"error": "invalid worker param"}, status=400)
    busy = await allocator.is_busy(worker_index)
    return web.json_response({"worker": worker_index, "busy": busy})


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
    app.router.add_route("*", f"{base_url}/heartbeat", handle_heartbeat)
    app.router.add_route("*", f"{base_url}/release", handle_release)
    app.router.add_get(f"{base_url}/worker-status", handle_worker_status)
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
        default=float(os.environ.get("LUME_SESSION_TIMEOUT_SECONDS", "300")),
    )
    args = parser.parse_args()
    web.run_app(
        create_app(args.base_url, args.worker_count, args.session_timeout),
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
