import base64
import json
import logging
import os
import random
import re
import subprocess
import time
import traceback
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import uiautomator2 as u2
from openai import OpenAI
from pydantic import BaseModel, Field
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

# =========================
# 📦 STATE PERSISTENCE
# =========================
STATE_FILE = Path("agent_state.json")
DEFAULT_STATE = {
    "likes_done": 0,
    "responses_done": 0,
    "phase": "inbox",
    "replied_chats": [],
    "loop_count": 0,
    "crash_recovery": False,
    "consecutive_ai_errors": 0,
    "last_run": datetime.now().isoformat(),
}


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return DEFAULT_STATE.copy()

    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            loaded = json.load(f)
    except Exception as exc:
        logger.warning("⚠️ Falha ao carregar estado: %s. Usando padrão.", exc)
        return DEFAULT_STATE.copy()

    merged = DEFAULT_STATE.copy()
    merged.update(loaded)
    return merged


def save_state(state: dict[str, Any]) -> None:
    state["last_run"] = datetime.now().isoformat()
    with STATE_FILE.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


# =========================
# 📝 STRUCTURED LOGGING
# =========================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.FileHandler("agent.log"), logging.StreamHandler()],
)
logger = logging.getLogger("grindr_agent")


def log_action(action: str, state: dict[str, Any], msg: str = "") -> None:
    safe_state = {k: v for k, v in state.items() if k != "replied_chats"}
    logger.info("🔹 %s | %s | state=%s", action, msg, json.dumps(safe_state, ensure_ascii=False))


def save_debug_screenshot(img, action: str) -> None:
    ts = int(time.time())
    path = f"debug_fail_{ts}_{action}.png"
    try:
        img.save(path)
        logger.warning("📸 Debug screenshot saved: %s", path)
    except Exception:
        logger.exception("Falha ao salvar screenshot de debug")


# =========================
# 🛡️ VALIDAÇÃO PYDANTIC
# =========================
class LLMAction(BaseModel):
    action: str = Field(..., description="Ação a executar")
    text: str = Field("", description="Texto da mensagem (se aplicável)")
    state_detected: str = "unknown"
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    reason: str = ""


ALLOWED_ACTIONS = {
    "send_reply",
    "go_to_inbox",
    "open_chat",
    "tap_like",
    "swipe_next",
    "restart_app",
    "wait",
}


def validate_llm_response(raw: str) -> LLMAction:
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        parsed = json.loads(cleaned)
        action = LLMAction(**parsed)
        if action.action not in ALLOWED_ACTIONS:
            raise ValueError(f"Ação inválida: {action.action}")
        return action
    except Exception as exc:
        logger.warning("⚠️ Resposta inválida da IA: %s | fallback=restart_app", exc)
        return LLMAction(action="restart_app", reason="invalid_json", confidence=1.0)


# =========================
# 🌐 WATCHDOG ADB + APP
# =========================
class DeviceManager:
    def __init__(self, device: str, package: str) -> None:
        self.device_id = device
        self.package = package
        self.d = u2.connect(device)
        self.reconnect_attempts = 0

    def is_alive(self) -> bool:
        try:
            current = self.d.app_current()
            return current.get("package") == self.package
        except Exception:
            return False

    def safe_call(self, func, *args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            msg = str(exc).lower()
            if "device offline" in msg or "connection" in msg:
                self.reconnect()
                return func(*args, **kwargs)
            raise

    def reconnect(self) -> None:
        logger.critical("🔄 ADB desconectado. Tentando reconectar...")
        subprocess.run(["adb", "reconnect", self.device_id], check=False)
        time.sleep(3)
        self.d = u2.connect(self.device_id)
        self.reconnect_attempts += 1


# =========================
# 🎯 UI ELEMENTS (HÍBRIDO)
# =========================
def smart_click(d, selector: str, fallback_pct: tuple[float, float]) -> bool:
    """Tenta clicar por resourceId e fallback para % da tela."""
    el = d(resourceId=selector)
    if el.exists(timeout=2):
        el.click()
        return True

    w, h = d.window_size()
    x, y = int(w * fallback_pct[0]), int(h * fallback_pct[1])
    d.click(max(0, min(x, w - 1)), max(0, min(y, h - 1)))
    return False


# =========================
# 🔁 CIRCUIT BREAKER & RETRY
# =========================
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception),
)
def query_ai_safely(client: OpenAI, model: str, messages: list[dict[str, Any]]):
    return client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=350,
        temperature=0.15,
        response_format={"type": "json_object"},
    )


# =========================
# 🤖 AGENTE PRINCIPAL
# =========================
def run_agent(config_module) -> None:
    client = OpenAI(api_key=config_module.API_KEY, base_url=config_module.BASE_URL)
    dev = DeviceManager(config_module.DEVICE, config_module.APP_PACKAGE)
    state = load_state()

    logger.info("🚀 GRINDR AGENT V3 INICIALIZADO")
    dev.safe_call(dev.d.app_start, config_module.APP_PACKAGE)
    time.sleep(8)

    while True:
        state["loop_count"] += 1
        if state["loop_count"] % 5 == 0 and not dev.is_alive():
            logger.warning("⚠️ App não está em foreground. Reiniciando...")
            dev.safe_call(dev.d.app_stop, config_module.APP_PACKAGE)
            time.sleep(4)
            dev.safe_call(dev.d.app_start, config_module.APP_PACKAGE)
            time.sleep(8)
            state["crash_recovery"] = True

        try:
            img = dev.safe_call(dev.d.screenshot)
            buf = BytesIO()
            img.save(buf, format="PNG", quality=85)
            image_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

            try:
                res = query_ai_safely(
                    client,
                    config_module.MODEL,
                    [
                        {
                            "role": "system",
                            "content": (
                                "Agente Grindr. Responda APENAS JSON válido. "
                                "Ações: send_reply, go_to_inbox, open_chat, tap_like, "
                                "swipe_next, restart_app, wait. Para send_reply inclua 'text'."
                            ),
                        },
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": f"Estado: {state}"},
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                                },
                            ],
                        },
                    ],
                )
                raw = res.choices[0].message.content or "{}"
                action = validate_llm_response(raw)
                state["consecutive_ai_errors"] = 0
            except Exception as exc:
                logger.error("💥 API FALHOU: %s", exc)
                state["consecutive_ai_errors"] += 1
                if state["consecutive_ai_errors"] >= 3:
                    action = LLMAction(action="restart_app", reason="api_circuit_open")
                else:
                    action = LLMAction(action="wait", reason="api_retry")

            log_action(action.action, state, action.reason)

            if action.action == "send_reply" and action.text.strip():
                smart_click(dev.d, "com.grindrapp.android:id/edit_text", (0.5, 0.88))
                time.sleep(0.8)
                dev.safe_call(dev.d.send_keys, action.text)
                time.sleep(1.0)
                dev.safe_call(dev.d.press, "enter")
                state["responses_done"] += 1
                time.sleep(2)
                dev.safe_call(dev.d.press, "back")

            elif action.action == "go_to_inbox":
                smart_click(dev.d, "com.grindrapp.android:id/tab_inbox", (0.65, 0.92))
                time.sleep(4)

            elif action.action == "open_chat":
                smart_click(dev.d, "com.grindrapp.android:id/tv_username", (0.5, 0.45))
                time.sleep(2)

            elif action.action == "tap_like":
                smart_click(dev.d, "com.grindrapp.android:id/iv_like", (0.85, 0.15))
                state["likes_done"] += 1

            elif action.action == "swipe_next":
                dev.safe_call(dev.d.swipe, 0.85, 0.5, 0.15, 0.5, duration=0.4)
                time.sleep(1)

            elif action.action == "restart_app":
                dev.safe_call(dev.d.app_stop, config_module.APP_PACKAGE)
                time.sleep(4)
                dev.safe_call(dev.d.app_start, config_module.APP_PACKAGE)
                time.sleep(8)
                state["likes_done"] = 0
                state["crash_recovery"] = True

            save_state(state)
            time.sleep(random.uniform(1.5, 3.0))

        except KeyboardInterrupt:
            logger.info("⏹️ Interrompido pelo usuário.")
            save_state(state)
            dev.safe_call(dev.d.app_stop, config_module.APP_PACKAGE)
            break
        except Exception as exc:
            logger.critical("💥 CRASH: %s", exc)
            traceback.print_exc()
            save_debug_screenshot(img, "crash")
            state["consecutive_ai_errors"] += 1
            save_state(state)
            time.sleep(5)


if __name__ == "__main__":
    import config as cfg

    run_agent(cfg)
