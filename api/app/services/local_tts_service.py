"""
Local TTS via Kokoro-ONNX.

Runs entirely on CPU using ONNX Runtime — zero VRAM usage, so it never
competes with your LLM (Ollama / deepseek) for GPU memory.

Model files (~83 MB total) are downloaded from GitHub on first use and
cached in KOKORO_MODEL_CACHE (volume-mounted in Docker so they persist
across container rebuilds).

Available voices:
  af_sky    — warm, natural American female  ← default
  af_bella  — clear, confident American female
  af_nicole — soft American female
  bf_emma   — British female
  af        — generic American female
"""

import asyncio
import base64
import io
import logging
import urllib.request
from pathlib import Path

log = logging.getLogger("gator.services.local_tts")

# ── Model download URLs (kokoro-onnx GitHub releases) ─────────────────────────
_ONNX_URL   = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx"
_VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.bin"

_kokoro_instance = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _model_dir() -> Path:
    from app.config import get_settings
    d = Path(get_settings().KOKORO_MODEL_CACHE)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _download_if_missing(url: str, dest: Path) -> None:
    """Download a file with a simple progress log. No-op if already present."""
    if dest.exists() and dest.stat().st_size > 0:
        return
    log.info("[LocalTTS] Downloading %s → %s …", dest.name, dest)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    try:
        urllib.request.urlretrieve(url, str(tmp))
        tmp.rename(dest)
        log.info("[LocalTTS] %s ready (%.1f MB)", dest.name, dest.stat().st_size / 1e6)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Failed to download {dest.name}: {exc}") from exc


# ── Singleton loader ──────────────────────────────────────────────────────────

def _get_kokoro():
    """Load (and cache) the Kokoro model. Downloads model files on first call."""
    global _kokoro_instance
    if _kokoro_instance is not None:
        return _kokoro_instance

    from kokoro_onnx import Kokoro  # lazy import — not all deployments install this

    d = _model_dir()
    model_path  = d / "kokoro-v0_19.onnx"
    voices_path = d / "voices.bin"

    _download_if_missing(_ONNX_URL,   model_path)
    _download_if_missing(_VOICES_URL, voices_path)

    log.info("[LocalTTS] Loading Kokoro ONNX model …")
    _kokoro_instance = Kokoro(str(model_path), str(voices_path))
    log.info("[LocalTTS] Kokoro ready ✓")
    return _kokoro_instance


# ── Public API ────────────────────────────────────────────────────────────────

async def synthesize_kokoro(text: str, voice: str = "af_sky") -> tuple[str, str]:
    """
    Generate speech for *text* using the given Kokoro voice.

    Returns:
        (audio_base64, format)  — format is always "wav" (PCM-16, 24 kHz).
        expo-av plays WAV natively; no ffmpeg required.
    """
    import numpy as np
    import soundfile as sf

    kokoro = _get_kokoro()
    loop   = asyncio.get_event_loop()

    # Run synthesis in a thread pool so we don't block the async event loop
    samples, sample_rate = await loop.run_in_executor(
        None,
        lambda: kokoro.create(text, voice=voice, speed=1.0, lang="en-us"),
    )

    # Convert to standard PCM-16 WAV (universally supported by mobile players)
    buf = io.BytesIO()
    sf.write(buf, np.asarray(samples, dtype=np.float32), sample_rate,
             format="WAV", subtype="PCM_16")
    buf.seek(0)

    audio_b64 = base64.b64encode(buf.read()).decode()
    log.info(
        "[LocalTTS] voice=%s text_len=%d → %.1f KB WAV",
        voice, len(text), len(audio_b64) * 3 / 4 / 1024,
    )
    return audio_b64, "wav"
