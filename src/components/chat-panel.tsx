"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, Loader2, AlertCircle } from "lucide-react";

interface ChatPanelProps {
  documentId: Id<"documents">;
  isReady: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel({ documentId, isReady }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useAction(api.chat.sendMessage);
  const storedMessages = useQuery(api.chatQueries.listMessages, { documentId });

  // Update local messages when stored messages change
  useEffect(() => {
    if (storedMessages) {
      const formattedMessages: Message[] = storedMessages.map((msg) => ({
        id: msg._id,
        role: msg.role,
        content: msg.content,
      }));
      setLocalMessages(formattedMessages);
    }
  }, [storedMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isReady) return;

    const userMessageContent = input.trim();
    setInput("");
    setIsLoading(true);
    setError(null);

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: userMessageContent,
    };
    setLocalMessages((prev) => [...prev, tempUserMessage]);

    try {
      const result = await sendMessage({
        documentId,
        message: userMessageContent,
      });

      // Optimistically add assistant message (it will be overwritten by the query)
      const tempAssistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
      };
      setLocalMessages((prev) => [...prev, tempAssistantMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      // Remove the optimistic user message on error
      setLocalMessages((prev) =>
        prev.filter((m) => m.id !== tempUserMessage.id)
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isReady) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
            <Loader2 className="mb-3 h-8 w-8 animate-spin" />
            <p className="font-medium">Processing document...</p>
            <p className="mt-1 text-sm">
              Chat will be available once embeddings are ready.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Ask about this document
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Messages area */}
        <div className="h-[400px] overflow-y-auto p-4">
          {localMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <MessageSquare className="mb-3 h-12 w-12 opacity-20" />
              <p className="font-medium">No messages yet</p>
              <p className="mt-1 text-sm">
                Ask a question about the document to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {localMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      Thinking...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t p-4"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this document..."
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-50"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
