"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const processDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(internal.documents.getInternal, {
      id: args.documentId,
    });

    if (!document) {
      console.error(`Document not found: ${args.documentId}`);
      return;
    }

    try {
      // Get the PDF file URL from Convex storage
      const fileUrl = await ctx.storage.getUrl(document.fileId);
      if (!fileUrl) {
        throw new Error("Failed to get file URL from storage");
      }

      // Call the Modal OCR endpoint
      const modalEndpoint = process.env.MODAL_OCR_ENDPOINT;
      if (!modalEndpoint) {
        throw new Error("MODAL_OCR_ENDPOINT environment variable not set");
      }

      const response = await fetch(modalEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pdf_url: fileUrl }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OCR endpoint error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(`OCR error: ${result.error}`);
      }

      if (!result.text) {
        throw new Error("OCR endpoint returned no text");
      }

      // Update document with extracted text
      await ctx.runMutation(internal.documents.updateFromAction, {
        id: args.documentId,
        status: "ready",
        extractedText: result.text,
      });

      console.log(
        `OCR completed for document ${args.documentId}: ${result.page_count} pages processed`
      );

      // Trigger embedding generation
      await ctx.runMutation(internal.documents.updateEmbeddingStatus, {
        id: args.documentId,
        embeddingStatus: "processing",
      });

      await ctx.scheduler.runAfter(0, internal.embeddings.processDocumentEmbeddings, {
        documentId: args.documentId,
      });

      console.log(`Embedding processing scheduled for document ${args.documentId}`);
    } catch (error) {
      console.error(`OCR processing failed for document ${args.documentId}:`, error);

      await ctx.runMutation(internal.documents.updateFromAction, {
        id: args.documentId,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error during OCR processing",
      });
    }
  },
});
