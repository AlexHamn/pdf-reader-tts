"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";

const MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct";

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about documents.
You will be provided with relevant excerpts from the document as context.

Guidelines:
- Base your answers only on the provided document context
- If the context doesn't contain enough information to answer, say so clearly
- Be concise but thorough in your responses
- Quote relevant parts of the document when helpful
- If asked about something not in the document, politely explain that you can only answer questions about the document content`;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call the Modal LLM endpoint directly using OpenAI-compatible API.
 */
async function callLLM(messages: ChatMessage[]): Promise<string> {
  const endpoint = process.env.MODAL_LLM_ENDPOINT;
  if (!endpoint) {
    throw new Error("MODAL_LLM_ENDPOINT environment variable not set");
  }

  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.choices?.[0]?.message?.content) {
    throw new Error("Invalid response from LLM");
  }

  return data.choices[0].message.content;
}

/**
 * Send a message and get an AI response with RAG context.
 */
export const sendMessage = action({
  args: {
    documentId: v.id("documents"),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<{ response: string }> => {
    // Fetch previous messages for conversation history
    const previousMessages = await ctx.runQuery(
      internal.chatQueries.listMessagesInternal,
      {
        documentId: args.documentId,
        limit: 20,
      }
    );

    // Search for relevant context using RAG
    const ragResults = await ctx.runAction(api.embeddings.searchDocument, {
      documentId: args.documentId,
      query: args.message,
      limit: 5,
    });

    // Build context-augmented prompt for the current user message
    const userPrompt = ragResults.text
      ? `Here is relevant context from the document:\n\n---\n${ragResults.text}\n---\n\nUser question: ${args.message}`
      : args.message;

    // Build full message array with conversation history
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...previousMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userPrompt },
    ];

    // Generate response using direct LLM call
    const response = await callLLM(messages);

    // Save the message exchange
    await ctx.runMutation(internal.chatQueries.saveMessage, {
      documentId: args.documentId,
      role: "user",
      content: args.message,
    });

    await ctx.runMutation(internal.chatQueries.saveMessage, {
      documentId: args.documentId,
      role: "assistant",
      content: response,
    });

    return { response };
  },
});
