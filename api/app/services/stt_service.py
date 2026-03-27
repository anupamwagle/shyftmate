import asyncio
import logging
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)


class TranscribeSession:
    """
    Manages a single AWS Transcribe Streaming session.
    Uses the amazon-transcribe-streaming-sdk when available,
    with a graceful fallback for local development.
    """

    def __init__(self):
        self.session_id: Optional[str] = None
        self._transcript_client = None
        self._stream = None
        self._handler = None
        self._partial_transcript: str = ""
        self._final_transcript: str = ""
        self._result_queue: asyncio.Queue = asyncio.Queue()
        self._running = False

    async def start(self, session_id: str) -> None:
        self.session_id = session_id
        settings = get_settings()

        try:
            from amazon_transcribe.client import TranscribeStreamingClient
            from amazon_transcribe.handlers import TranscriptResultStreamHandler
            from amazon_transcribe.model import TranscriptEvent

            class _ResultHandler(TranscriptResultStreamHandler):
                def __init__(self, stream, queue: asyncio.Queue):
                    super().__init__(stream)
                    self._queue = queue

                async def handle_transcript_event(self, transcript_event: TranscriptEvent):
                    results = transcript_event.transcript.results
                    for result in results:
                        if not result.is_partial:
                            for alt in result.alternatives:
                                await self._queue.put(alt.transcript)

            self._transcript_client = TranscribeStreamingClient(
                region=settings.AWS_TRANSCRIBE_REGION,
            )
            self._stream = await self._transcript_client.start_stream_transcription(
                language_code="en-AU",
                media_sample_rate_hz=8000,
                media_encoding="pcm",
            )
            self._handler = _ResultHandler(self._stream.output_stream, self._result_queue)
            self._running = True
            logger.info("TranscribeSession started: %s", session_id)

        except ImportError:
            logger.warning(
                "amazon-transcribe SDK not installed. Transcription will return empty strings. "
                "Install with: pip install amazon-transcribe"
            )
            self._running = False

    async def send_audio(self, audio_chunk: bytes) -> Optional[str]:
        """Send audio chunk and return any finalized transcript text."""
        if not self._running or self._stream is None:
            return None

        try:
            await self._stream.input_stream.send_audio_event(audio_chunk=audio_chunk)
        except Exception as e:
            logger.error("TranscribeSession send_audio error: %s", e)
            return None

        # Return any finalized transcript available
        try:
            transcript = self._result_queue.get_nowait()
            return transcript
        except asyncio.QueueEmpty:
            return None

    async def close(self) -> None:
        if not self._running:
            return
        try:
            if self._stream is not None:
                await self._stream.input_stream.end_stream()
            if self._handler is not None:
                await self._handler.handle_events()
        except Exception as e:
            logger.error("TranscribeSession close error: %s", e)
        finally:
            self._running = False
            logger.info("TranscribeSession closed: %s", self.session_id)
