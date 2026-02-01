"""
Modal LLM Endpoint using vLLM with Qwen2.5-7B-Instruct for document Q&A.

Provides an OpenAI-compatible chat completions endpoint.

Based on Modal's official vLLM inference example:
https://modal.com/docs/examples/vllm_inference
"""

import modal

app = modal.App("qwen-llm")

# Using Qwen2.5-7B-Instruct - excellent for Q&A tasks
MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct"
MODEL_REVISION = "bb46c15ee4bb56c5b63245ef50fd7637234d6f75"  # Pin for reproducibility
GPU_TYPE = "A10G"
MINUTES = 60
VLLM_PORT = 8000

# Cache volumes for faster cold starts
hf_cache_vol = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)

# Use Modal's recommended vLLM image configuration
image = (
    modal.Image.from_registry("nvidia/cuda:12.8.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .pip_install(
        "vllm==0.7.3",
        "huggingface-hub>=0.27.0",
        "hf_transfer",
        "transformers==4.48.2",  # Pin transformers for vLLM compatibility
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)


@app.function(
    image=image,
    gpu=GPU_TYPE,
    timeout=15 * MINUTES,
    scaledown_window=5 * MINUTES,
    volumes={
        "/root/.cache/huggingface": hf_cache_vol,
        "/root/.cache/vllm": vllm_cache_vol,
    },
)
@modal.concurrent(max_inputs=16)
@modal.web_server(port=VLLM_PORT, startup_timeout=10 * MINUTES)
def serve():
    """
    Start the vLLM server with OpenAI-compatible API.

    The server will be available at:
    - /v1/chat/completions - Chat completions endpoint
    - /v1/models - List available models
    - /health - Health check
    """
    import subprocess

    cmd = [
        "vllm", "serve", MODEL_NAME,
        "--revision", MODEL_REVISION,
        "--served-model-name", MODEL_NAME,
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        "--tensor-parallel-size", "1",
        "--max-model-len", "8192",
        "--enforce-eager",  # Faster startup
        "--trust-remote-code",
    ]

    subprocess.Popen(cmd)


@app.local_entrypoint()
def main():
    """Test the LLM endpoint."""
    print("Deploying vLLM server...")
    print(f"Model: {MODEL_NAME}")
    print(f"GPU: {GPU_TYPE}")
    print("\nOnce deployed, the endpoint will be available at:")
    print("https://alexhamn--qwen-llm-serve.modal.run/v1/chat/completions")
    print("\nTest with:")
    print('curl -X POST "https://alexhamn--qwen-llm-serve.modal.run/v1/chat/completions" \\')
    print('  -H "Content-Type: application/json" \\')
    print('  -d \'{"model": "Qwen/Qwen2.5-7B-Instruct", "messages": [{"role": "user", "content": "Hello!"}]}\'')
