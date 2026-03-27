import audioop
import base64
import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

logger = logging.getLogger(__name__)


async def synthesize_speech(text: str) -> Optional[bytes]:
    """
    Synthesizes text using AWS Polly (Olivia, en-AU, generative engine).
    Returns base64-encoded mulaw 8000Hz audio bytes suitable for
    SignalWire Media Streams JSON payload, or None on failure.
    """
    settings = get_settings()
    try:
        polly = boto3.client(
            "polly",
            region_name=settings.AWS_POLLY_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )

        response = polly.synthesize_speech(
            Text=text,
            VoiceId=settings.POLLY_VOICE_ID,
            Engine=settings.POLLY_ENGINE,
            LanguageCode=settings.POLLY_LANGUAGE_CODE,
            OutputFormat="pcm",
            SampleRate="8000",
        )

        pcm_audio = response["AudioStream"].read()

        # Convert PCM (16-bit linear) to mulaw 8-bit
        mulaw_audio = audioop.lin2ulaw(pcm_audio, 2)

        # Base64-encode for SignalWire Media Streams
        return base64.b64encode(mulaw_audio)

    except ClientError as e:
        logger.error("Polly synthesis failed: %s", e.response["Error"]["Message"])
        return None
    except Exception as e:
        logger.error("TTS service unexpected error: %s", str(e))
        return None
