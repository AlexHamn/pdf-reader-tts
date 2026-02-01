import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";

/**
 * Get messages for a document.
 */
export const listMessages = query({
  args: {
    documentId: v.id("documents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .take(args.limit ?? 50);

    return messages;
  },
});

/**
 * Internal query to get messages for use within actions.
 */
export const listMessagesInternal = internalQuery({
  args: {
    documentId: v.id("documents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .take(args.limit ?? 20);

    return messages;
  },
});

/**
 * Save a chat message.
 */
export const saveMessage = internalMutation({
  args: {
    documentId: v.id("documents"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", {
      documentId: args.documentId,
      role: args.role,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});
