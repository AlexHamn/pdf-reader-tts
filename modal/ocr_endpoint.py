"""
Modal OCR Endpoint using DeepSeek-OCR-2 for document text extraction.

Converts PDF pages to images and uses DeepSeek-OCR-2 to extract text.
"""

import modal

app = modal.App("pdf-ocr")

MODEL_NAME = "deepseek-ai/DeepSeek-OCR-2"
GPU_TYPE = "A10G"
MINUTES = 60

volume = modal.Volume.from_name("ocr-model-cache", create_if_missing=True)
MODEL_DIR = "/model-cache"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "git",
        "poppler-utils",
        "libgl1-mesa-glx",
        "libglib2.0-0",
    )
    .pip_install(
        "torch==2.6.0",
        "torchvision",
        "transformers==4.46.3",
        "tokenizers==0.20.3",
        "einops",
        "addict",
        "easydict",
        "accelerate",
        "safetensors",
        "pdf2image",
        "pillow",
        "fastapi[standard]",
        "httpx",
        "huggingface_hub",
    )
)


@app.cls(
    gpu=GPU_TYPE,
    timeout=10 * MINUTES,
    image=image,
    volumes={MODEL_DIR: volume},
    scaledown_window=5 * MINUTES,
)
class OCRModel:
    @modal.enter()
    def load_model(self):
        import torch
        import os
        from transformers import AutoModel, AutoTokenizer

        cache_dir = f"{MODEL_DIR}/hf_cache"
        os.makedirs(cache_dir, exist_ok=True)

        print(f"Loading model {MODEL_NAME}...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME,
            trust_remote_code=True,
            cache_dir=cache_dir,
        )
        self.model = AutoModel.from_pretrained(
            MODEL_NAME,
            trust_remote_code=True,
            use_safetensors=True,
            attn_implementation="eager",
            cache_dir=cache_dir,
        )
        self.model = self.model.eval().cuda().to(torch.bfloat16)

        # Commit volume so model is cached for next cold start
        volume.commit()
        print("Model loaded on GPU!")

    def _extract_text_from_image(self, image_bytes: bytes) -> str:
        """Extract text from image bytes."""
        import tempfile
        import os
        import shutil
        import sys
        from io import StringIO

        prompt = "<image>\n<|grounding|>Convert the document to markdown."

        # Create temp directory for input and output
        tmpdir = tempfile.mkdtemp()
        temp_path = os.path.join(tmpdir, "input.png")

        try:
            with open(temp_path, "wb") as f:
                f.write(image_bytes)

            # Capture stdout - model prints results instead of returning them
            old_stdout = sys.stdout
            sys.stdout = captured_output = StringIO()

            try:
                result = self.model.infer(
                    self.tokenizer,
                    prompt=prompt,
                    image_file=temp_path,
                    output_path=tmpdir,
                    base_size=1024,
                    image_size=768,
                    crop_mode=True,
                    save_results=False,
                )
            finally:
                sys.stdout = old_stdout

            # Get captured stdout
            stdout_text = captured_output.getvalue()

            # Check if result is a valid string first
            if result and isinstance(result, str) and result.strip() and result.strip() != "None":
                return result

            # Use captured stdout if available
            if stdout_text and stdout_text.strip():
                return stdout_text.strip()

            return str(result) if result else ""
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    @modal.fastapi_endpoint(method="POST", docs=True)
    async def extract_text(self, request: dict) -> dict:
        """
        Extract text from a PDF document. Runs on GPU.

        Args:
            request: JSON with "pdf_url" field pointing to the PDF file

        Returns:
            JSON with "text" (extracted text) and "page_count" fields
        """
        import httpx
        from pdf2image import convert_from_bytes
        from io import BytesIO

        pdf_url = request.get("pdf_url")
        if not pdf_url:
            return {"error": "pdf_url is required", "text": "", "page_count": 0}

        try:
            # Download the PDF
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(pdf_url)
                response.raise_for_status()
                pdf_bytes = response.content

            # Convert PDF pages to images
            images = convert_from_bytes(pdf_bytes, dpi=150)
            page_count = len(images)

            if page_count == 0:
                return {"error": "No pages found in PDF", "text": "", "page_count": 0}

            # Process each page with OCR (runs on same GPU container)
            all_text = []
            for i, img in enumerate(images):
                buffer = BytesIO()
                img.save(buffer, format="PNG")
                image_bytes = buffer.getvalue()

                page_text = self._extract_text_from_image(image_bytes)
                if page_text:
                    all_text.append(f"--- Page {i + 1} ---\n{page_text}")

            extracted_text = "\n\n".join(all_text)

            return {
                "text": extracted_text,
                "page_count": page_count,
            }

        except httpx.HTTPError as e:
            return {"error": f"Failed to download PDF: {str(e)}", "text": "", "page_count": 0}
        except Exception as e:
            import traceback
            return {"error": f"OCR processing failed: {str(e)}\n{traceback.format_exc()}", "text": "", "page_count": 0}

    @modal.fastapi_endpoint(method="GET", docs=True)
    def health(self) -> dict:
        """Health check endpoint."""
        import torch
        return {
            "status": "healthy",
            "model": MODEL_NAME,
            "gpu_available": torch.cuda.is_available(),
        }


@app.local_entrypoint()
def main():
    """Test the OCR endpoint."""
    print("Warming up OCR model...")
    model = OCRModel()
    result = model.health.remote()
    print(f"Health check: {result}")
