"""
Modal TTS Endpoint using Chatterbox Multilingual for multi-language text-to-speech.

Supports 23 languages including Spanish, English, French, German, Chinese, etc.
Returns WAV audio via streaming response.
"""

import modal
import io
import re

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
    # Remove unusual unicode characters that might cause issues
    # Keep letters, numbers, basic punctuation, and accented characters
    text = re.sub(r'[^\w\s.,;:!?¿¡\'"()\-áéíóúüñÁÉÍÓÚÜÑ]', ' ', text)

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Ensure minimum length to avoid tensor issues
    # Chatterbox needs enough tokens to generate properly
    MIN_LENGTH = 20
    if len(text) < MIN_LENGTH:
        # Pad with a neutral phrase that won't affect meaning much
        text = text + "." if not text.endswith('.') else text

    return text


@app.cls(
    gpu=GPU_TYPE,
    timeout=10 * MINUTES,
    image=image,
    volumes={MODEL_DIR: volume},
    scaledown_window=5 * MINUTES,
)
@modal.concurrent(max_inputs=1)  # Process one at a time to avoid GPU memory conflicts
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

        # Retry logic for transient tensor errors
        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                print(f"Synthesizing (attempt {attempt + 1}): '{processed_text[:50]}...' lang={language}")

                # Clear CUDA cache before generation to avoid memory fragmentation
                torch.cuda.empty_cache()

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

                # Check if it's a tensor shape error that might be transient
                if "stack expects each tensor to be equal size" in error_str:
                    print(f"Tensor shape error on attempt {attempt + 1}, retrying...")
                    torch.cuda.empty_cache()

                    # Try with slightly modified parameters on retry
                    if attempt == 1:
                        exaggeration = max(0.3, exaggeration - 0.1)
                        cfg_weight = max(0.3, cfg_weight - 0.1)
                    continue
                else:
                    # For other errors, don't retry
                    break

            except Exception as e:
                last_error = e
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
