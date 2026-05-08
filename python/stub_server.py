# FastAPI server for ARIA desktop — Phase 2
# Port : 7331
#
# Routes:
#   POST /process          — accept { input, model, strategy, maxSteps }
#                            fire-and-forget pipeline; pushes events to WS clients
#   WS   /stream           — persistent push channel; receives all pipeline events
#   POST /tier3/confirm    — user confirmed a destructive action
#   POST /tier3/cancel     — user cancelled a destructive action
#   GET  /memory           — return patterns, metrics, episodes
#   POST /memory/forget    — remove a pattern by intent string

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import random
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

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ARIA Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    """Thread-safe registry of active WebSocket clients with broadcast support."""

    def __init__(self) -> None:
        self._active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)
        log.info("WS connected. Active connections: %d", len(self._active))

    def disconnect(self, ws: WebSocket) -> None:
        self._active = [c for c in self._active if c is not ws]
        log.info("WS disconnected. Active connections: %d", len(self._active))

    async def broadcast(self, payload: dict[str, Any]) -> None:
        """Send a JSON payload to every connected client, pruning dead sockets."""
        text = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in list(self._active):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ── In-memory store (survives until server restart) ───────────────────────────

_patterns: list[dict] = [
    {"intent": "open Chrome",      "count": 5, "confidence": 0.92},
    {"intent": "list processes",   "count": 3, "confidence": 0.87},
    {"intent": "take screenshot",  "count": 2, "confidence": 0.75},
]

_metrics: dict = {
    "totalGoals":   13,
    "successRate":  0.615,
    "avgSteps":     3.5,
}

_episodes: list[dict] = [
    {
        "timestamp": "2026-05-08T10:00:00Z",
        "goal":    "open Chrome",
        "success": True,
        "steps":   2,
    },
    {
        "timestamp": "2026-05-08T10:05:00Z",
        "goal":    "search for weather",
        "success": True,
        "steps":   4,
    },
    {
        "timestamp": "2026-05-08T10:10:00Z",
        "goal":    "take screenshot",
        "success": False,
        "steps":   1,
    },
]


# ── Goal planner (demo heuristic) ─────────────────────────────────────────────

def _plan_goals(user_input: str) -> list[str]:
    """Derive a simple goal list from user input for demo purposes."""
    text = user_input.lower()
    goals: list[str] = []

    if any(w in text for w in ("open", "launch", "start")):
        app_name = "Chrome"
        for candidate in ("chrome", "notepad", "firefox", "vscode", "terminal", "settings"):
            if candidate in text:
                app_name = candidate.title()
                break
        goals.append(f"Launch {app_name}")

    if any(w in text for w in ("search", "find", "look up", "google")):
        goals.append("Search web")

    if any(w in text for w in ("screenshot", "capture", "screen")):
        goals.append("Capture screenshot")

    if any(w in text for w in ("memory", "cpu", "ram", "battery", "usage")):
        goals.append("Query system state")

    if any(w in text for w in ("close", "kill", "stop", "terminate")):
        goals.append("Close application")

    if any(w in text for w in ("delete", "remove", "erase")):
        goals.append("Delete file")  # triggers Tier-3 flow

    if not goals:
        goals = [f"Process: {user_input[:50]}"]

    return goals


# Maps goal prefix → (tool, action) for demo purposes.
_TOOL_MAP: dict[str, tuple[str, str]] = {
    "Launch":  ("app_tool",          "launch"),
    "Search":  ("browser_tool",      "navigate"),
    "Capture": ("screen_tool",       "screenshot"),
    "Query":   ("system_state_tool", "get_full_state"),
    "Close":   ("app_tool",          "close"),
    "Delete":  ("file_tool",         "delete_file"),
    "Process": ("ai_layer",          "decide"),
}


def _pick_tool(goal: str) -> tuple[str, str]:
    for prefix, pair in _TOOL_MAP.items():
        if goal.startswith(prefix):
            return pair
    return ("ai_layer", "decide")


# ── Pipeline emitter ──────────────────────────────────────────────────────────

async def _emit_pipeline(
    user_input: str,
    model:      str,
    strategy:   str,
    max_steps:  int,
) -> None:
    """
    Simulate the full ARIA ReAct loop by broadcasting WS events in sequence.
    Realistic async delays are injected between phases.
    """
    goals = _plan_goals(user_input)
    has_destructive = any("Delete" in g for g in goals)

    # ── goal_planned ──────────────────────────────────────────────────────────
    await asyncio.sleep(0.3)
    await manager.broadcast({
        "event": "goal_planned",
        "data":  {"goals": goals, "count": len(goals)},
    })

    for idx, goal in enumerate(goals, start=1):
        tool, action = _pick_tool(goal)

        # ── goal_started ──────────────────────────────────────────────────────
        await asyncio.sleep(0.4)
        await manager.broadcast({
            "event": "goal_started",
            "data":  {"goal": goal, "index": idx},
        })

        # ── tool_dispatched ───────────────────────────────────────────────────
        await asyncio.sleep(0.5)
        await manager.broadcast({
            "event": "tool_dispatched",
            "data":  {"tool": tool, "action": action},
        })

        # Destructive goal → pause for Tier-3 confirmation; skip goal_completed.
        if "Delete" in goal:
            await asyncio.sleep(0.3)
            await manager.broadcast({
                "event": "tier3_required",
                "data":  {
                    "action": "delete_file",
                    "path":   "C:/Users/YUVARAJ/Documents/report.pdf",
                    "reason": "Irreversible — requires explicit confirmation",
                },
            })
            continue  # session_complete emitted by confirm/cancel endpoint

        # ── tool_result ───────────────────────────────────────────────────────
        await asyncio.sleep(0.6)
        success = random.random() > 0.15  # 85 % success rate for demo
        await manager.broadcast({
            "event": "tool_result",
            "data":  {
                "success": success,
                "summary": f"{tool}.{action} → {'ok' if success else 'failed'}",
                "tool":    tool,
                "action":  action,
            },
        })

        # Recovery path on failure
        if not success:
            await asyncio.sleep(0.4)
            await manager.broadcast({
                "event": "recovery_triggered",
                "data":  {"reason": f"{action} returned an error — retrying"},
            })
            await asyncio.sleep(0.6)
            success = True  # assume recovery succeeds
            await manager.broadcast({
                "event": "tool_result",
                "data":  {
                    "success": True,
                    "summary": f"Recovery: {tool}.{action} → ok",
                    "tool":    tool,
                    "action":  action,
                },
            })

        # ── goal_completed ────────────────────────────────────────────────────
        await asyncio.sleep(0.3)
        await manager.broadcast({
            "event": "goal_completed",
            "data":  {"index": idx, "success": success},
        })

    # ── session_complete (skipped when a Tier-3 halt is pending) ─────────────
    if not has_destructive:
        await asyncio.sleep(0.4)
        await manager.broadcast({
            "event": "session_complete",
            "data":  {
                "response": (
                    f"Done. Completed {len(goals)} goal"
                    f"{'s' if len(goals) != 1 else ''}."
                ),
            },
        })

        # Persist run to in-memory episode log and update metrics.
        _episodes.append({
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "goal":      user_input[:60],
            "success":   True,
            "steps":     len(goals) * 3,
        })
        _metrics["totalGoals"] += len(goals)
        _metrics["successRate"] = round(_metrics["successRate"] * 0.9 + 0.85 * 0.1, 3)


# ── Routes ────────────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    input:    str
    model:    str = "llama3"
    strategy: str = "balanced"
    maxSteps: int = 10


class ProcessResponse(BaseModel):
    success: bool
    message: str


@app.post("/process", response_model=ProcessResponse)
async def process(body: ProcessRequest) -> ProcessResponse:
    log.info(
        "POST /process  input=%r  model=%s  strategy=%s  maxSteps=%d",
        body.input, body.model, body.strategy, body.maxSteps,
    )
    # Fire-and-forget — response returns immediately; events flow over WS.
    asyncio.create_task(
        _emit_pipeline(body.input, body.model, body.strategy, body.maxSteps)
    )
    return ProcessResponse(success=True, message="Processing started")


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
    return {
        "patterns": _patterns,
        "metrics":  _metrics,
        "episodes": _episodes[-20:],  # cap at 20 most recent
    }


class ForgetRequest(BaseModel):
    intent: str


@app.post("/memory/forget")
async def forget_pattern(body: ForgetRequest) -> dict:
    global _patterns
    before   = len(_patterns)
    _patterns = [p for p in _patterns if p["intent"] != body.intent]
    removed  = before - len(_patterns)
    log.info("POST /memory/forget  intent=%r  removed=%d", body.intent, removed)
    return {"success": True, "removed": removed}


# ── WebSocket /stream ─────────────────────────────────────────────────────────

@app.websocket("/stream")
async def stream(ws: WebSocket) -> None:
    """
    Persistent push channel.  The server pushes events; the client only listens.
    A 30-second receive timeout keeps the loop alive without busy-waiting.
    """
    await manager.connect(ws)
    try:
        while True:
            try:
                # Wait for any client ping; ignore content.
                await asyncio.wait_for(ws.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                pass  # normal — no message expected, just keep alive
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.error("WS /stream unexpected error: %s", exc)
    finally:
        manager.disconnect(ws)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("Starting ARIA server on http://0.0.0.0:7331")
    uvicorn.run(
        "stub_server:app",
        host="0.0.0.0",
        port=7331,
        log_level="info",
        reload=False,
    )
