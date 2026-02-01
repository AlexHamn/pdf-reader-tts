import { components } from "./_generated/api";
import { RAG } from "@convex-dev/rag";
import type { EmbeddingModelV3 } from "@ai-sdk/provider";

const EMBEDDING_DIMENSION = 768;

/**
 * Custom embedding model that calls our Modal endpoint.
 * Implements the EmbeddingModelV3 interface from @ai-sdk/provider.
 */
function createModalEmbeddingModel(endpointUrl: string): EmbeddingModelV3 {
  return {
    specificationVersion: "v3",
    provider: "modal",
    modelId: "nomic-embed-text-v1.5",
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,

    async doEmbed(options) {
      const { values } = options;

      // Call the Modal embedding endpoint (URL is the full endpoint path)
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: values }),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Modal embedding error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(`Modal embedding error: ${result.error}`);
      }

      return {
        embeddings: result.embeddings as number[][],
        usage: { tokens: Math.round(values.reduce((sum, v) => sum + v.length / 4, 0)) },
        warnings: [],
      };
    },
  };
}

/**
 * Create the RAG instance with our Modal embedding model.
 * This must be called from an action context where we have access to env vars.
 */
export function createRag() {
  const embeddingEndpoint = process.env.MODAL_EMBEDDING_ENDPOINT;
  if (!embeddingEndpoint) {
    throw new Error("MODAL_EMBEDDING_ENDPOINT environment variable not set");
  }

  return new RAG(components.rag, {
    embeddingDimension: EMBEDDING_DIMENSION,
    textEmbeddingModel: createModalEmbeddingModel(embeddingEndpoint),
  });
}

export { EMBEDDING_DIMENSION };
