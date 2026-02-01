import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("documents").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    fileName: v.string(),
    fileId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      title: args.title,
      fileName: args.fileName,
      fileId: args.fileId,
      status: "uploading",
      createdAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("documents"),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    extractedText: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const triggerOCR = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "processing" });
    await ctx.scheduler.runAfter(0, internal.ocr.processDocument, {
      documentId: args.id,
    });
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateFromAction = internalMutation({
  args: {
    id: v.id("documents"),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    extractedText: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const updateEmbeddingStatus = internalMutation({
  args: {
    id: v.id("documents"),
    embeddingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    embeddingError: v.optional(v.string()),
    chunkCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});
