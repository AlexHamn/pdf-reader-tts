import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    fileName: v.string(),
    fileId: v.id("_storage"),
    extractedText: v.optional(v.string()),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    error: v.optional(v.string()),
    embeddingStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    )),
    embeddingError: v.optional(v.string()),
    chunkCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_embedding_status", ["embeddingStatus"]),

  playbackState: defineTable({
    documentId: v.id("documents"),
    currentChunkIndex: v.number(),
    isPlaying: v.boolean(),
    updatedAt: v.number(),
  }).index("by_document", ["documentId"]),

  chatMessages: defineTable({
    documentId: v.id("documents"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_document", ["documentId"]),
});
