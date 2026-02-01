"""
Modal Embedding Endpoint using nomic-embed-text-v1.5 for semantic search.

Provides text embedding capabilities for the RAG pipeline:
- Batch document embedding with "search_document:" prefix
- Query embedding with "search_query:" prefix
"""

import modal

app = modal.App("text-embeddings")

MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5"
EMBEDDING_DIM = 768
GPU_TYPE = "A10G"
MINUTES = 60

volume = modal.Volume.from_name("embedding-model-cache", create_if_missing=True)
MODEL_DIR = "/model-cache"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.6.0",
        "transformers==4.46.3",
        "sentence-transformers>=2.2.0",
        "einops",
        "fastapi[standard]",
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
class EmbeddingModel:
    @modal.enter()
    def load_model(self):
        import os
        from sentence_transformers import SentenceTransformer

        cache_dir = f"{MODEL_DIR}/hf_cache"
        os.makedirs(cache_dir, exist_ok=True)

        print(f"Loading model {MODEL_NAME}...")
        self.model = SentenceTransformer(
            MODEL_NAME,
            trust_remote_code=True,
            cache_folder=cache_dir,
        )
        self.model = self.model.to("cuda")

        # Commit volume so model is cached for next cold start
        volume.commit()
        print(f"Model loaded on GPU! Embedding dimension: {EMBEDDING_DIM}")

    @modal.fastapi_endpoint(method="POST", docs=True)
    async def embed(self, request: dict) -> dict:
        """
        Embed a batch of document texts.

        Args:
            request: JSON with "texts" field (list of strings, max 100)

        Returns:
            JSON with "embeddings" (list of 768-dim vectors)
        """
        texts = request.get("texts", [])

        if not texts:
            return {"error": "texts is required", "embeddings": []}

        if len(texts) > 100:
            return {"error": "Maximum 100 texts per request", "embeddings": []}

        try:
            # Add document prefix for semantic search
            prefixed_texts = [f"search_document: {text}" for text in texts]

            embeddings = self.model.encode(
                prefixed_texts,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )

            return {
                "embeddings": embeddings.tolist(),
                "dimension": EMBEDDING_DIM,
                "count": len(embeddings),
            }
        except Exception as e:
            import traceback
            return {
                "error": f"Embedding failed: {str(e)}\n{traceback.format_exc()}",
                "embeddings": [],
            }

    @modal.fastapi_endpoint(method="POST", docs=True)
    async def embed_query(self, request: dict) -> dict:
        """
        Embed a search query.

        Args:
            request: JSON with "query" field (string)

        Returns:
            JSON with "embedding" (768-dim vector)
        """
        query = request.get("query", "")

        if not query:
            return {"error": "query is required", "embedding": []}

        try:
            # Add query prefix for semantic search
            prefixed_query = f"search_query: {query}"

            embedding = self.model.encode(
                prefixed_query,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )

            return {
                "embedding": embedding.tolist(),
                "dimension": EMBEDDING_DIM,
            }
        except Exception as e:
            import traceback
            return {
                "error": f"Query embedding failed: {str(e)}\n{traceback.format_exc()}",
                "embedding": [],
            }

    @modal.fastapi_endpoint(method="GET", docs=True)
    def health(self) -> dict:
        """Health check endpoint."""
        import torch
        return {
            "status": "healthy",
            "model": MODEL_NAME,
            "dimension": EMBEDDING_DIM,
            "gpu_available": torch.cuda.is_available(),
        }


@app.local_entrypoint()
def main():
    """Test the embedding endpoint."""
    print("Warming up embedding model...")
    model = EmbeddingModel()
    result = model.health.remote()
    print(f"Health check: {result}")

    # Test embedding
    test_result = model.embed.remote({"texts": ["Hello, this is a test document."]})
    print(f"Test embedding shape: {len(test_result.get('embeddings', [[]])[0])} dimensions")
