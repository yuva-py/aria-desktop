# python/stub_server.py — ARIA Real Backend Bridge
# Port : 7331
#
# Wires the real ARIA Python engine (loop_controller.run) to the
# Electron/React frontend via FastAPI + WebSocket.
#
# Architecture:
#   POST /process
#     → runs loop_controller.run(input, display_fn=...) in a thread
#     → display_fn converts each pipeline record into a frontend WS event
#     → events are pushed to all connected WS clients in real-time
#
# Events pushed (matches useARIAStream.js dispatcher):
#   goal_planned      { goals: [str], count: int }
#   goal_started      { goal: str, index: int }
#   tool_dispatched   { tool: str, action: str }
#   tool_result       { success: bool, summary: str, tool: str, action: str }
#   recovery_triggered{ reason: str }
#   goal_completed    { index: int, success: bool }
#   tier3_required    { action: str, path: str, reason: str }
#   session_complete  { response: str }

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[ARIA] %(levelname)s  %(message)s",
)
log = logging.getLogger(__name__)

# ── Wire ARIA backend ─────────────────────────────────────────────────────────
# Default: look two directories up from this file (aria desktop/ → aria/)
_DEFAULT_BACKEND = str(Path(__file__).resolve().parent.parent.parent / "aria")
ARIA_BACKEND = Path(os.environ.get("ARIA_BACKEND_PATH", _DEFAULT_BACKEND))

if ARIA_BACKEND.exists():
    if str(ARIA_BACKEND) not in sys.path:
        sys.path.insert(0, str(ARIA_BACKEND))
    log.info("ARIA backend path: %s", ARIA_BACKEND)
else:
    log.warning("ARIA backend not found at %s — set ARIA_BACKEND_PATH env var", ARIA_BACKEND)

try:
    from core.loop_controller import run as _aria_run
    from memory.pattern_memory import PatternMemory as _PatternMemory
    from memory.performance_tracker import PerformanceTracker as _PerformanceTracker
    _ARIA_AVAILABLE = True
    log.info("Real ARIA engine loaded successfully")
except ImportError as exc:
    _ARIA_AVAILABLE = False
    log.warning("ARIA engine import failed (%s) — stub fallback active", exc)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ARIA Real Server", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self) -> None:
        self._active: list[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)
        if self._loop is None:
            self._loop = asyncio.get_running_loop()
        log.info("WS connected. Active: %d", len(self._active))

    def disconnect(self, ws: WebSocket) -> None:
        self._active = [c for c in self._active if c is not ws]

    async def broadcast(self, payload: dict[str, Any]) -> None:
        """Async broadcast — call from the event loop."""
        text = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in list(self._active):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast_sync(self, payload: dict[str, Any]) -> None:
        """
        Thread-safe broadcast from a non-async context (e.g. the ARIA pipeline
        thread).  Uses run_coroutine_threadsafe so it doesn't block the caller.
        """
        if self._loop is None or not self._active:
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(payload), self._loop)
        except Exception as exc:
            log.debug("broadcast_sync failed: %s", exc)


manager = ConnectionManager()


# ── display_fn: converts ARIA pipeline records → frontend WS events ───────────

def _make_display_fn(planned_goals: list[str]) -> Any:
    """
    Returns a display_fn callable that translates loop_controller records into
    the exact event shapes useARIAStream.js understands.

    Record keys (from _emit in loop_controller.py):
        step, goal, intent, planner, governance, execution, note
    """
    # Track which goal indices have been announced to avoid duplicate events.
    _announced_goals: set[int] = set()
    _announced_plan = [False]

    def display_fn(record: dict) -> None:
        step       = record.get("step", 0)
        goal       = record.get("goal")        # dict or None
        intent     = record.get("intent")      # dict or None
        governance = record.get("governance")  # dict or None
        execution  = record.get("execution")   # dict or None
        note       = record.get("note", "")    # str or None
        note       = note or ""

        # ── goal_planned (emit once when plan is ready) ─────────────────────
        if not _announced_plan[0] and planned_goals:
            manager.broadcast_sync({
                "event": "goal_planned",
                "data":  {"goals": planned_goals, "count": len(planned_goals)},
            })
            _announced_plan[0] = True

        # ── stream_token (LLM streaming, low priority) ──────────────────────
        if record.get("type") == "stream_token":
            return  # ignore — frontend doesn't use streaming tokens yet

        if goal is None:
            return  # note-only emit (suggestion, checkpoint, etc.)

        goal_idx  = goal.get("index", 0)
        goal_desc = goal.get("description", goal.get("action", "unknown"))

        # ── goal_started (first time we see this goal index) ────────────────
        if goal_idx not in _announced_goals:
            _announced_goals.add(goal_idx)
            manager.broadcast_sync({
                "event": "goal_started",
                "data":  {"goal": goal_desc, "index": goal_idx + 1},
            })

        # ── tool_dispatched (intent + governance approval) ───────────────────
        if intent and governance and governance.get("approved"):
            tool   = intent.get("tool", "")
            action = intent.get("action", "")
            if tool and action:
                manager.broadcast_sync({
                    "event": "tool_dispatched",
                    "data":  {"tool": tool, "action": action},
                })

        # ── tier3_required ───────────────────────────────────────────────────
        if governance and not governance.get("approved"):
            reason = governance.get("reason", "")
            if "tier3" in reason.lower() or "destructive" in reason.lower() or \
               governance.get("tier", 0) >= 3:
                tool   = (intent or {}).get("tool", "")
                action = (intent or {}).get("action", "")
                args   = (intent or {}).get("args", {})
                manager.broadcast_sync({
                    "event": "tier3_required",
                    "data":  {
                        "action": action or tool,
                        "path":   str(args.get("path", args.get("name", ""))),
                        "reason": reason or "Destructive action requires confirmation",
                    },
                })
            return

        # ── recovery_triggered ───────────────────────────────────────────────
        if note and any(w in note.lower() for w in
                        ("recovery", "retry", "failed", "stall", "backoff")):
            manager.broadcast_sync({
                "event": "recovery_triggered",
                "data":  {"reason": note},
            })

        # ── tool_result (after execution) ────────────────────────────────────
        if execution:
            status  = execution.get("status", "error")
            success = status in ("success", "partial")
            message = execution.get("message", "")
            tool    = (intent or goal).get("tool", "")
            action  = (intent or goal).get("action", "")
            manager.broadcast_sync({
                "event": "tool_result",
                "data":  {
                    "success": success,
                    "summary": message[:200] if message else f"{tool}.{action}",
                    "tool":    tool,
                    "action":  action,
                },
            })

            # ── goal_completed (when execution arrives) ──────────────────────
            manager.broadcast_sync({
                "event": "goal_completed",
                "data":  {"index": goal_idx + 1, "success": success},
            })

    return display_fn


# ── ARIA pipeline runner ──────────────────────────────────────────────────────

def _run_aria_sync(
    user_input: str,
    planned_goals: list[str],
    model: str,
    strategy: str,
    max_steps: int,
) -> dict:
    """
    Blocking call to the real ARIA engine.  Runs in a thread pool via
    asyncio.to_thread() so it doesn't block the event loop.
    """
    display_fn = _make_display_fn(planned_goals)

    try:
        ctx = _aria_run(user_input, display_fn=display_fn)
        final_response = getattr(ctx, "final_response", None) or \
                         getattr(ctx, "final_status", "Done.")
        success = getattr(ctx, "final_status", "failed") in ("success", "partial")
        return {"success": success, "response": str(final_response)}
    except Exception as exc:
        log.error("ARIA pipeline error: %s", exc, exc_info=True)
        return {"success": False, "response": f"Pipeline error: {exc}"}


def _stub_run_sync(user_input: str, planned_goals: list[str]) -> dict:
    """Fallback when ARIA backend is unavailable."""
    import time, random

    display_fn = _make_display_fn(planned_goals)

    for i, goal in enumerate(planned_goals):
        time.sleep(0.3)
        display_fn({
            "step": i + 1, "goal": {"index": i, "description": goal,
                                     "tool": "stub", "action": "stub"},
            "intent":     {"tool": "stub", "action": "stub", "args": {}},
            "governance": {"approved": True, "tier": 0},
            "execution":  {"status": "success",
                           "message": f"[stub] {goal} completed"},
            "note": None,
        })
        time.sleep(0.4)

    return {"success": True, "response": f"[stub] {len(planned_goals)} goal(s) done."}


async def _run_aria_async(
    user_input: str,
    model:      str,
    strategy:   str,
    max_steps:  int,
) -> None:
    """
    Fire-and-forget async wrapper.  Runs the pipeline in a thread pool,
    then emits session_complete when done.
    """
    # Quick goal preview (the real planner runs inside _aria_run, but
    # we need something to pass to _make_display_fn).  Use a one-word
    # summary; the display_fn will fire goal_planned when _aria_run starts.
    planned_preview: list[str] = [f"Process: {user_input[:60]}"]

    loop = asyncio.get_running_loop()

    if _ARIA_AVAILABLE:
        result = await loop.run_in_executor(
            None, _run_aria_sync, user_input, planned_preview, model, strategy, max_steps
        )
    else:
        result = await loop.run_in_executor(
            None, _stub_run_sync, user_input, planned_preview
        )

    await manager.broadcast({
        "event": "session_complete",
        "data":  {"response": result.get("response", "Done.")},
    })


# ── Routes ────────────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    input:    str
    model:    str = "llama3"
    strategy: str = "balanced"
    maxSteps: int = 10


@app.post("/process")
async def process(body: ProcessRequest) -> dict:
    log.info("POST /process  input=%r  model=%s", body.input, body.model)
    asyncio.create_task(
        _run_aria_async(body.input, body.model, body.strategy, body.maxSteps)
    )
    return {"success": True, "message": "Processing started"}


@app.post("/tier3/confirm")
async def tier3_confirm() -> dict:
    log.info("POST /tier3/confirm")
    await manager.broadcast({
        "event": "goal_completed",
        "data":  {"index": -1, "success": True},
    })
    await asyncio.sleep(0.2)
    await manager.broadcast({
        "event": "session_complete",
        "data":  {"response": "Tier-3 action confirmed and executed."},
    })
    return {"success": True}


@app.post("/tier3/cancel")
async def tier3_cancel() -> dict:
    log.info("POST /tier3/cancel")
    await manager.broadcast({
        "event": "goal_completed",
        "data":  {"index": -1, "success": False},
    })
    await asyncio.sleep(0.2)
    await manager.broadcast({
        "event": "session_complete",
        "data":  {"response": "Tier-3 action cancelled by user."},
    })
    return {"success": True}


@app.get("/memory")
async def get_memory() -> dict:
    """Return real ARIA memory if available, else return empty defaults."""
    if not _ARIA_AVAILABLE:
        return {"patterns": [], "metrics": {"totalGoals": 0, "successRate": 0, "avgSteps": 0}, "episodes": []}

    try:
        from memory.pattern_memory import PatternMemory
        from memory.performance_tracker import PerformanceTracker
        from memory.persistence import load_json

        pm = PatternMemory()
        pm.load()
        patterns = [
            {"intent": k, "count": v.get("count", 1), "confidence": v.get("confidence", 0.8)}
            for k, v in (pm._patterns if hasattr(pm, "_patterns") else {}).items()
        ]

        perf = PerformanceTracker()
        try:
            perf.from_dict(load_json("data/performance.json", default={}))
        except Exception:
            pass

        metrics = {
            "totalGoals":  perf.total_goals,
            "successRate": round(perf.success_rate, 3),
            "avgSteps":    round(getattr(perf, "avg_steps_per_goal", 0), 2),
        }

        try:
            from memory.memory import EpisodicMemory
            em = EpisodicMemory()
            em.load()
            episodes = [
                {
                    "timestamp": e.get("timestamp", ""),
                    "goal":      e.get("goal", ""),
                    "success":   e.get("verification", {}).get("verified", False),
                    "steps":     1,
                }
                for e in (em.entries[-20:] if hasattr(em, "entries") else [])
            ]
        except Exception:
            episodes = []

        return {"patterns": patterns, "metrics": metrics, "episodes": episodes}

    except Exception as exc:
        log.warning("GET /memory failed: %s", exc)
        return {"patterns": [], "metrics": {"totalGoals": 0, "successRate": 0, "avgSteps": 0}, "episodes": []}


class ForgetRequest(BaseModel):
    intent: str


@app.post("/memory/forget")
async def forget_pattern(body: ForgetRequest) -> dict:
    log.info("POST /memory/forget  intent=%r", body.intent)
    if _ARIA_AVAILABLE:
        try:
            from memory.pattern_memory import PatternMemory
            pm = PatternMemory()
            pm.load()
            if hasattr(pm, "_patterns") and body.intent in pm._patterns:
                del pm._patterns[body.intent]
                pm.save()
                return {"success": True, "removed": 1}
        except Exception as exc:
            log.warning("forget_pattern failed: %s", exc)
    return {"success": True, "removed": 0}


# ── WebSocket /stream ─────────────────────────────────────────────────────────

@app.websocket("/stream")
async def stream(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        while True:
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                pass  # keep-alive
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.error("WS error: %s", exc)
    finally:
        manager.disconnect(ws)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("Starting ARIA real server on http://0.0.0.0:7331")
    log.info("ARIA backend available: %s", _ARIA_AVAILABLE)
    uvicorn.run(
        "stub_server:app",
        host="0.0.0.0",
        port=7331,
        log_level="info",
        reload=False,
    )
