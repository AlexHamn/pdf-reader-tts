"""
Modal TTS Endpoint using Chatterbox Multilingual for multi-language text-to-speech.

Supports 23 languages including Spanish, English, French, German, Chinese, etc.
Returns WAV audio via streaming response.
"""

import modal
import io
import re
import time

app = modal.App("chatterbox-tts")

MINUTES = 60
GPU_TYPE = "A10G"

volume = modal.Volume.from_name("tts-model-cache", create_if_missing=True)
MODEL_DIR = "/model-cache"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "chatterbox-tts>=0.1.6",
        "torch>=2.0.0",
        "torchaudio>=2.0.0",
        "fastapi[standard]",
        "peft",
    )
)


def preprocess_text(text: str) -> str:
    """
    Preprocess text to avoid TTS errors.
    - Remove or replace problematic characters
    - Ensure minimum length
    - Normalize whitespace
    """
    # Remove any remaining HTML/XML-like tags
    text = re.sub(r'<[^>]*>', '', text)

    # Remove bounding box coordinates
    text = re.sub(r'\[\[\d+,\s*\d+,\s*\d+,\s*\d+\]\]', '', text)

    # Remove technical codes (e.g., LSL-901A, PLC-123)
    text = re.sub(r'\b[A-Z]{2,}-\d+[A-Z]?\b', '', text)

    # Keep only letters, numbers, basic punctuation, and common accented characters
    # Extended to include more Latin characters
    text = re.sub(r'[^\w\s.,;:!?¿¡\'"()\-àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ]', ' ', text)

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Remove isolated single characters (often OCR artifacts)
    text = re.sub(r'\s+[a-zA-Z]\s+', ' ', text)

    # Ensure minimum length to avoid tensor/kernel issues
    MIN_LENGTH = 30
    if len(text) < MIN_LENGTH:
        # Don't pad - just return what we have, TTS will handle short text
        # The chunker should ensure reasonable length
        pass

    return text.strip()


@app.cls(
    gpu=GPU_TYPE,
    timeout=10 * MINUTES,
    image=image,
    volumes={MODEL_DIR: volume},
    scaledown_window=5 * MINUTES,
    max_containers=10,  # Scale up to 10 under load, no warm containers
)
class TTSModel:
    @modal.enter()
    def load_model(self):
        import os
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        os.environ["HF_HOME"] = f"{MODEL_DIR}/hf_cache"
        os.makedirs(os.environ["HF_HOME"], exist_ok=True)

        print("Loading Chatterbox Multilingual TTS model...")
        self.model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")

        # Commit volume to cache the model for faster cold starts
        volume.commit()
        print(f"Model loaded! Sample rate: {self.model.sr}")

    @modal.fastapi_endpoint(method="POST", docs=True)
    def synthesize(self, request: dict):
        """
        Synthesize speech from text.

        Args:
            request: JSON with:
                - text (str): Text to synthesize
                - language (str, optional): Language code (default: "es" for Spanish)
                  Supported: ar, da, de, el, en, es, fi, fr, he, hi, it, ja, ko,
                  ms, nl, no, pl, pt, ru, sv, sw, tr, zh
                - exaggeration (float, optional): Emotion intensity 0.0-1.0 (default: 0.5)
                  Higher = more expressive and slightly faster
                - cfg_weight (float, optional): Guidance weight 0.0-1.0 (default: 0.5)
                  Lower = slower, more deliberate pacing

        Returns:
            WAV audio as streaming response
        """
        import torchaudio as ta
        import torch
        from fastapi.responses import StreamingResponse, JSONResponse

        text = request.get("text", "")
        language = request.get("language", "es")
        exaggeration = request.get("exaggeration", 0.5)
        cfg_weight = request.get("cfg_weight", 0.5)

        if not text:
            return JSONResponse(
                status_code=400,
                content={"error": "text is required"}
            )

        # Preprocess text to avoid common TTS errors
        processed_text = preprocess_text(text)

        if not processed_text:
            return JSONResponse(
                status_code=400,
                content={"error": "text is empty after preprocessing"}
            )

        # Log what we're about to synthesize for debugging
        print(f"TTS input ({len(processed_text)} chars): '{processed_text[:100]}...'")

        # Retry logic for transient tensor errors
        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                print(f"Synthesizing (attempt {attempt + 1})")

                # Clear CUDA cache and synchronize before generation
                torch.cuda.empty_cache()
                torch.cuda.synchronize()

                # Generate audio with cadence controls
                wav = self.model.generate(
                    processed_text,
                    language_id=language,
                    exaggeration=exaggeration,
                    cfg_weight=cfg_weight,
                )

                # Convert to WAV bytes
                buffer = io.BytesIO()
                ta.save(buffer, wav, self.model.sr, format="wav")
                buffer.seek(0)

                return StreamingResponse(
                    buffer,
                    media_type="audio/wav",
                    headers={
                        "Content-Disposition": "attachment; filename=speech.wav"
                    }
                )

            except RuntimeError as e:
                last_error = e
                error_str = str(e)

                # Check if it's a tensor/kernel error that might be transient
                transient_errors = [
                    "stack expects each tensor to be equal size",
                    "got NoneType",
                    "Kernel size can't be greater than actual input size",
                    "Sizes of tensors must match",
                ]
                if any(err in error_str for err in transient_errors):
                    print(f"Tensor error on attempt {attempt + 1}: {error_str[:100]}")
                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()
                    # Small delay before retry
                    time.sleep(0.5)
                    continue
                else:
                    # For other errors, don't retry
                    break

            except Exception as e:
                last_error = e
                error_str = str(e)
                # Also retry tensor/kernel errors caught here
                transient_errors = [
                    "got NoneType",
                    "expected Tensor",
                    "Kernel size",
                    "Sizes of tensors",
                    "stack expects",
                ]
                if any(err in error_str for err in transient_errors):
                    print(f"Tensor error on attempt {attempt + 1}: {error_str[:100]}")
                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()
                    time.sleep(0.5)
                    continue
                break

        # All retries failed
        import traceback
        print(f"TTS Error after {max_retries} attempts: {last_error}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": f"TTS failed: {str(last_error)}"}
        )

    @modal.fastapi_endpoint(method="GET", docs=True)
    def health(self) -> dict:
        """Health check endpoint."""
        import torch
        return {
            "status": "healthy",
            "model": "ChatterboxMultilingualTTS",
            "sample_rate": self.model.sr,
            "gpu_available": torch.cuda.is_available(),
            "supported_languages": [
                "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi",
                "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv",
                "sw", "tr", "zh"
            ]
        }


@app.local_entrypoint()
def main():
    """Test the TTS endpoint locally."""
    print("Testing TTS endpoint...")
    model = TTSModel()

    # Health check
    health = model.health.remote()
    print(f"Health: {health}")

    # Test synthesis
    print("Testing Spanish synthesis...")
    response = model.synthesize.remote({
        "text": "Hola, este es un documento en espanol.",
        "language": "es"
    })
    print(f"Response type: {type(response)}")
    print("TTS test complete!")
