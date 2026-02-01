"use node";

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { createRag, EMBEDDING_DIMENSION } from "./rag";
import { Doc, Id } from "./_generated/dataModel";

const CHUNK_SIZE = 1000; // characters per chunk
const CHUNK_OVERLAP = 200; // overlap between chunks
const BATCH_SIZE = 50; // chunks per Modal request

/**
 * Split text into overlapping chunks while trying to preserve sentence boundaries.
 */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE;

    // If we're not at the end, try to find a good break point
    if (end < text.length) {
      // Look for sentence boundaries (. ! ?) within the last 100 chars of the chunk
      const searchStart = Math.max(end - 100, start);
      const searchText = text.slice(searchStart, end);

      // Find the last sentence ending
      const sentenceEndings = [". ", "! ", "? ", ".\n", "!\n", "?\n"];
      let bestBreak = -1;

      for (const ending of sentenceEndings) {
        const idx = searchText.lastIndexOf(ending);
        if (idx > bestBreak) {
          bestBreak = idx + ending.length;
        }
      }

      if (bestBreak > 0) {
        end = searchStart + bestBreak;
      }
    } else {
      end = text.length;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start position, accounting for overlap
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;

    // Avoid infinite loop if chunk is too small
    if (start >= end - CHUNK_OVERLAP) {
      start = end;
    }
  }

  return chunks;
}

/**
 * Process a document's text into embeddings and store in RAG.
 */
export const processDocumentEmbeddings = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    console.log(`Starting embedding processing for document ${args.documentId}`);

    try {
      // Get the document
      const document = await ctx.runQuery(internal.documents.getInternal, {
        id: args.documentId,
      });

      if (!document) {
        throw new Error(`Document not found: ${args.documentId}`);
      }

      if (!document.extractedText) {
        throw new Error(`Document has no extracted text: ${args.documentId}`);
      }

      // Chunk the text
      const chunks = chunkText(document.extractedText);
      console.log(`Document ${args.documentId}: ${chunks.length} chunks created`);

      if (chunks.length === 0) {
        throw new Error("No chunks created from document text");
      }

      // Create RAG instance
      const rag = createRag();

      // Add document to RAG with chunks
      // Use documentId as namespace to keep each document's embeddings separate
      const result = await rag.add(ctx, {
        namespace: args.documentId,
        key: args.documentId,
        title: document.title,
        text: chunks.join("\n\n"), // RAG will use its own chunker on this
        // Alternative: provide pre-chunked text
        // chunks: chunks.map(text => ({ text })),
      });

      console.log(`Document ${args.documentId}: Embeddings stored, status: ${result.status}`);

      // Update document status
      await ctx.runMutation(internal.documents.updateEmbeddingStatus, {
        id: args.documentId,
        embeddingStatus: "ready",
        chunkCount: chunks.length,
      });

      console.log(`Document ${args.documentId}: Embedding processing complete`);
    } catch (error) {
      console.error(`Embedding processing failed for document ${args.documentId}:`, error);

      await ctx.runMutation(internal.documents.updateEmbeddingStatus, {
        id: args.documentId,
        embeddingStatus: "error",
        embeddingError: error instanceof Error ? error.message : "Unknown error during embedding",
      });
    }
  },
});

/**
 * Search a document's embeddings for relevant content.
 */
export const searchDocument = action({
  args: {
    documentId: v.id("documents"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rag = createRag();

    const results = await rag.search(ctx, {
      namespace: args.documentId,
      query: args.query,
      limit: args.limit ?? 5,
      chunkContext: { before: 1, after: 1 }, // Include surrounding chunks for context
    });

    return {
      text: results.text,
      entries: results.entries.map((e) => ({
        entryId: e.entryId,
        title: e.title,
        text: e.text,
      })),
      resultCount: results.results.length,
    };
  },
});

/**
 * Get embedding status for a document.
 * Uses the public documents.get query to avoid circular reference issues.
 */
export const getEmbeddingStatus = action({
  args: { documentId: v.id("documents") },
  returns: v.union(
    v.null(),
    v.object({
      embeddingStatus: v.optional(v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("ready"),
        v.literal("error")
      )),
      embeddingError: v.optional(v.string()),
      chunkCount: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args): Promise<{
    embeddingStatus?: "pending" | "processing" | "ready" | "error";
    embeddingError?: string;
    chunkCount?: number;
  } | null> => {
    const document = await ctx.runQuery(api.documents.get, {
      id: args.documentId,
    });

    if (!document) {
      return null;
    }

    return {
      embeddingStatus: document.embeddingStatus,
      embeddingError: document.embeddingError,
      chunkCount: document.chunkCount,
    };
  },
});
