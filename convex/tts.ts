import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================================================
// Playback State
// ============================================================================

export const getPlaybackState = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playbackState")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .unique();
  },
});

export const updatePlaybackState = mutation({
  args: {
    documentId: v.id("documents"),
    currentChunkIndex: v.optional(v.number()),
    isPlaying: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("playbackState")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .unique();

    const updates: {
      currentChunkIndex?: number;
      isPlaying?: boolean;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.currentChunkIndex !== undefined) {
      updates.currentChunkIndex = args.currentChunkIndex;
    }
    if (args.isPlaying !== undefined) {
      updates.isPlaying = args.isPlaying;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    } else {
      return await ctx.db.insert("playbackState", {
        documentId: args.documentId,
        currentChunkIndex: args.currentChunkIndex ?? 0,
        isPlaying: args.isPlaying ?? false,
        updatedAt: Date.now(),
      });
    }
  },
});

export const initPlaybackState = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("playbackState")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("playbackState", {
      documentId: args.documentId,
      currentChunkIndex: 0,
      isPlaying: false,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Audio Chunks
// ============================================================================

export const listAudioChunks = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("audioChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    // Sort by chunkIndex and add URLs
    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return Promise.all(
      sortedChunks.map(async (chunk) => ({
        ...chunk,
        audioUrl: await ctx.storage.getUrl(chunk.audioFileId),
      }))
    );
  },
});

export const getAudioChunk = query({
  args: {
    documentId: v.id("documents"),
    chunkIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const chunk = await ctx.db
      .query("audioChunks")
      .withIndex("by_document_chunk", (q) =>
        q.eq("documentId", args.documentId).eq("chunkIndex", args.chunkIndex)
      )
      .unique();

    if (!chunk) return null;

    return {
      ...chunk,
      audioUrl: await ctx.storage.getUrl(chunk.audioFileId),
    };
  },
});

export const getAudioChunkCount = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("audioChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    return chunks.length;
  },
});

// ============================================================================
// Text Chunking for TTS
// ============================================================================

interface TTSChunk {
  text: string;
  startCharIndex: number;
  endCharIndex: number;
}

/**
 * Split text into TTS-friendly chunks (300-500 chars, sentence boundaries, NO overlap).
 * This is different from RAG chunks which use overlap for context.
 */
function chunkTextForTTS(text: string): TTSChunk[] {
  const TARGET_SIZE = 400;
  const MIN_SIZE = 200;
  const MAX_SIZE = 600;

  const chunks: TTSChunk[] = [];
  let currentChunk = "";
  let currentStart = 0;
  let position = 0;

  // Split by sentences (period, question mark, exclamation followed by space or end)
  const sentenceRegex = /[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g;
  const sentences: { text: string; start: number; end: number }[] = [];

  let match;
  while ((match = sentenceRegex.exec(text)) !== null) {
    sentences.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  for (const sentence of sentences) {
    const trimmedSentence = sentence.text.trim();
    if (!trimmedSentence) continue;

    // If adding this sentence exceeds max and we have enough content, finalize chunk
    if (
      currentChunk.length + trimmedSentence.length > MAX_SIZE &&
      currentChunk.length >= MIN_SIZE
    ) {
      chunks.push({
        text: currentChunk.trim(),
        startCharIndex: currentStart,
        endCharIndex: position,
      });
      currentChunk = "";
      currentStart = sentence.start;
    }

    // If single sentence is too long, split by clauses or just push it
    if (trimmedSentence.length > MAX_SIZE && !currentChunk) {
      // Push long sentence as its own chunk
      chunks.push({
        text: trimmedSentence,
        startCharIndex: sentence.start,
        endCharIndex: sentence.end,
      });
      currentStart = sentence.end;
      position = sentence.end;
      continue;
    }

    currentChunk += (currentChunk ? " " : "") + trimmedSentence;
    position = sentence.end;

    // If we've reached target size and this is a good break point, finalize
    if (currentChunk.length >= TARGET_SIZE) {
      chunks.push({
        text: currentChunk.trim(),
        startCharIndex: currentStart,
        endCharIndex: position,
      });
      currentChunk = "";
      currentStart = position;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      startCharIndex: currentStart,
      endCharIndex: text.length,
    });
  }

  return chunks;
}

// ============================================================================
// Audio Generation
// ============================================================================

// Internal action for scheduled/background TTS generation (called after OCR)
export const processDocumentTTS = internalAction({
  args: {
    documentId: v.id("documents"),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const language = args.language ?? "es";
    const exaggeration = 0.5;
    const cfgWeight = 0.5;

    console.log(`Starting TTS generation for document ${args.documentId}`);

    // Get the document
    const document = await ctx.runQuery(internal.tts.getDocumentInternal, {
      id: args.documentId,
    });

    if (!document) {
      console.error(`Document not found: ${args.documentId}`);
      return;
    }

    if (!document.extractedText) {
      console.error(`Document has no extracted text: ${args.documentId}`);
      return;
    }

    // Check if TTS is already processing or complete
    if (document.ttsStatus === "processing" || document.ttsStatus === "ready") {
      console.log(`TTS already ${document.ttsStatus} for document ${args.documentId}`);
      return;
    }

    // Check if audio already exists
    const existingChunks = await ctx.runQuery(internal.tts.listAudioChunksInternal, {
      documentId: args.documentId,
    });

    if (existingChunks.length > 0) {
      console.log(`Audio already exists for document ${args.documentId}`);
      await ctx.runMutation(internal.tts.updateTTSStatus, {
        id: args.documentId,
        ttsStatus: "ready",
      });
      return;
    }

    // Mark as processing to prevent duplicate generation
    await ctx.runMutation(internal.tts.updateTTSStatus, {
      id: args.documentId,
      ttsStatus: "processing",
    });

    // Clean OCR text
    const cleanedText = cleanOCRText(document.extractedText);

    // Chunk the text for TTS
    const chunks = chunkTextForTTS(cleanedText);
    console.log(`Generating audio for ${chunks.length} chunks`);

    // Initialize playback state
    await ctx.runMutation(internal.tts.initPlaybackStateInternal, {
      documentId: args.documentId,
    });

    let successCount = 0;

    // Generate audio for each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Generating chunk ${i + 1}/${chunks.length}: "${chunk.text.slice(0, 50)}..."`);

      try {
        await ctx.runAction(internal.tts.generateSingleChunk, {
          documentId: args.documentId,
          chunkIndex: i,
          text: chunk.text,
          startCharIndex: chunk.startCharIndex,
          endCharIndex: chunk.endCharIndex,
          language,
          exaggeration,
          cfgWeight,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to generate chunk ${i} for document ${args.documentId}:`, error);
        // Continue with remaining chunks even if one fails
      }
    }

    // Update status based on results
    if (successCount > 0) {
      await ctx.runMutation(internal.tts.updateTTSStatus, {
        id: args.documentId,
        ttsStatus: "ready",
      });
      console.log(`TTS generation completed for document ${args.documentId} (${successCount}/${chunks.length} chunks)`);
    } else {
      await ctx.runMutation(internal.tts.updateTTSStatus, {
        id: args.documentId,
        ttsStatus: "error",
        ttsError: "All chunks failed to generate",
      });
      console.error(`TTS generation failed for document ${args.documentId}`);
    }
  },
});

// Public action for manual/retry TTS generation (called from frontend)
export const generateDocumentAudio = action({
  args: {
    documentId: v.id("documents"),
    language: v.optional(v.string()),
    exaggeration: v.optional(v.number()), // 0.0-1.0, higher = more expressive/faster
    cfgWeight: v.optional(v.number()),    // 0.0-1.0, lower = slower pacing
  },
  handler: async (ctx, args): Promise<{ chunksGenerated: number; skipped: boolean }> => {
    const language = args.language ?? "es";
    const exaggeration = args.exaggeration ?? 0.5;
    const cfgWeight = args.cfgWeight ?? 0.5;

    // Get the document
    const document = await ctx.runQuery(internal.tts.getDocumentInternal, {
      id: args.documentId,
    });

    if (!document) {
      throw new Error("Document not found");
    }

    if (!document.extractedText) {
      throw new Error("Document has no extracted text");
    }

    // Check if TTS is already processing (prevent race condition with backend)
    if (document.ttsStatus === "processing") {
      console.log(`TTS already processing for document ${args.documentId}`);
      return { chunksGenerated: 0, skipped: true };
    }

    // Check if audio already exists
    const existingChunks = await ctx.runQuery(internal.tts.listAudioChunksInternal, {
      documentId: args.documentId,
    });

    if (existingChunks.length > 0) {
      console.log(`Audio already exists for document ${args.documentId}`);
      return { chunksGenerated: existingChunks.length, skipped: true };
    }

    // Mark as processing to prevent duplicate generation
    await ctx.runMutation(internal.tts.updateTTSStatus, {
      id: args.documentId,
      ttsStatus: "processing",
    });

    // Clean OCR text (same as frontend)
    const cleanedText = cleanOCRText(document.extractedText);

    // Chunk the text for TTS
    const chunks = chunkTextForTTS(cleanedText);
    console.log(`Generating audio for ${chunks.length} chunks`);

    // Initialize playback state
    await ctx.runMutation(internal.tts.initPlaybackStateInternal, {
      documentId: args.documentId,
    });

    // Generate audio for each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Generating chunk ${i + 1}/${chunks.length}: "${chunk.text.slice(0, 50)}..."`);

      await ctx.runAction(internal.tts.generateSingleChunk, {
        documentId: args.documentId,
        chunkIndex: i,
        text: chunk.text,
        startCharIndex: chunk.startCharIndex,
        endCharIndex: chunk.endCharIndex,
        language,
        exaggeration,
        cfgWeight,
      });
    }

    // Mark as ready
    await ctx.runMutation(internal.tts.updateTTSStatus, {
      id: args.documentId,
      ttsStatus: "ready",
    });

    return { chunksGenerated: chunks.length, skipped: false };
  },
});

export const generateSingleChunk = internalAction({
  args: {
    documentId: v.id("documents"),
    chunkIndex: v.number(),
    text: v.string(),
    startCharIndex: v.number(),
    endCharIndex: v.number(),
    language: v.string(),
    exaggeration: v.number(),
    cfgWeight: v.number(),
  },
  handler: async (ctx, args) => {
    const endpoint = process.env.MODAL_TTS_ENDPOINT;
    if (!endpoint) {
      throw new Error("MODAL_TTS_ENDPOINT environment variable not set");
    }

    // Call Modal TTS endpoint
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: args.text,
        language: args.language,
        exaggeration: args.exaggeration,
        cfg_weight: args.cfgWeight,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS API error: ${response.status} - ${errorText}`);
    }

    // Get the audio data
    const audioBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });

    // Store in Convex storage
    const audioFileId = await ctx.storage.store(audioBlob);

    // Estimate duration (rough: WAV is ~176KB per second at 44.1kHz 16-bit mono)
    // More accurate: parse WAV header, but this is a reasonable estimate
    const estimatedDurationMs = Math.round((audioBuffer.byteLength / 88200) * 1000);

    // Save chunk metadata
    await ctx.runMutation(internal.tts.saveAudioChunk, {
      documentId: args.documentId,
      chunkIndex: args.chunkIndex,
      audioFileId,
      durationMs: estimatedDurationMs,
      textContent: args.text,
      startCharIndex: args.startCharIndex,
      endCharIndex: args.endCharIndex,
      language: args.language,
    });
  },
});

export const saveAudioChunk = internalMutation({
  args: {
    documentId: v.id("documents"),
    chunkIndex: v.number(),
    audioFileId: v.id("_storage"),
    durationMs: v.number(),
    textContent: v.string(),
    startCharIndex: v.number(),
    endCharIndex: v.number(),
    language: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("audioChunks", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ============================================================================
// Internal Queries/Mutations
// ============================================================================

export const getDocumentInternal = internalQuery({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listAudioChunksInternal = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("audioChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const initPlaybackStateInternal = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("playbackState")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("playbackState", {
      documentId: args.documentId,
      currentChunkIndex: 0,
      isPlaying: false,
      updatedAt: Date.now(),
    });
  },
});

export const updateTTSStatus = internalMutation({
  args: {
    id: v.id("documents"),
    ttsStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    ttsError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

// ============================================================================
// Helpers
// ============================================================================

function cleanOCRText(raw: string): string {
  return raw
    .replace(/<\|ref\|>[^<]*<\|\/ref\|>/g, "")
    .replace(/<\|det\|>[^<]*<\|\/det\|>/g, "")
    .replace(/={3,}[^=]*torch\.Size[^=]*={3,}/g, "")
    .replace(/---\s*Page\s*\d+\s*---/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
