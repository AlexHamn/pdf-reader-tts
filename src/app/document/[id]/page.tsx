"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  BookOpen,
} from "lucide-react";
import { ChatPanel } from "@/components/chat-panel";

type DocumentStatus = "uploading" | "processing" | "ready" | "error";

const statusConfig: Record<
  DocumentStatus,
  {
    label: string;
    description: string;
    icon: React.ReactNode;
    className: string;
    bgPattern: string;
  }
> = {
  uploading: {
    label: "Uploading",
    description: "Your document is being uploaded to the server...",
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    className: "text-sky-600 dark:text-sky-400",
    bgPattern: "from-sky-50 to-sky-100/50 dark:from-sky-950/30 dark:to-sky-900/20",
  },
  processing: {
    label: "Processing",
    description: "Extracting text from your PDF using OCR...",
    icon: <Clock className="h-5 w-5 animate-pulse" />,
    className: "text-amber-600 dark:text-amber-400",
    bgPattern: "from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20",
  },
  ready: {
    label: "Ready",
    description: "Your document has been processed successfully",
    icon: <CheckCircle className="h-5 w-5" />,
    className: "text-emerald-600 dark:text-emerald-400",
    bgPattern: "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20",
  },
  error: {
    label: "Error",
    description: "Something went wrong while processing your document",
    icon: <AlertCircle className="h-5 w-5" />,
    className: "text-rose-600 dark:text-rose-400",
    bgPattern: "from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20",
  },
};

function StatusCard({ status, error }: { status: DocumentStatus; error?: string }) {
  const config = statusConfig[status];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${config.bgPattern} border border-black/5 dark:border-white/5`}
    >
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative px-8 py-12 text-center">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/80 shadow-sm dark:bg-black/20 ${config.className}`}
        >
          {config.icon}
        </div>
        <h2 className={`text-lg font-semibold ${config.className}`}>{config.label}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{config.description}</p>
        {status === "error" && error && (
          <p className="mt-4 rounded-lg bg-rose-100/80 px-4 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </p>
        )}
        {status === "processing" && (
          <div className="mt-6 flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-500"
                style={{
                  animation: "pulse 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function cleanOCRText(raw: string): string {
  // Remove DeepSeek-OCR markup tags: <|ref|>...<|/ref|> and <|det|>...<|/det|>
  const cleaned = raw
    .replace(/<\|ref\|>[^<]*<\|\/ref\|>/g, "")
    .replace(/<\|det\|>[^<]*<\|\/det\|>/g, "")
    // Remove PyTorch debug output (e.g., "===== BASE: torch.Size([...]) PATCHES: torch.Size([...]) =====")
    .replace(/={3,}[^=]*torch\.Size[^=]*={3,}/g, "")
    // Remove page markers like "--- Page 1 ---"
    .replace(/---\s*Page\s*\d+\s*---/g, "")
    // Convert markdown headings to plain text
    .replace(/^#{1,6}\s+/gm, "")
    // Clean up extra whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

function TextContent({ text }: { text: string }) {
  // Clean OCR markup and split into paragraphs
  const cleanedText = cleanOCRText(text);
  const paragraphs = cleanedText.split(/\n\n+/).filter((p) => p.trim());

  return (
    <article className="prose-reader">
      {/* Reading header */}
      <div className="mb-8 flex items-center gap-3 border-b border-border/50 pb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 dark:from-emerald-900/40 dark:to-teal-900/40 dark:text-emerald-400">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Extracted Text</p>
          <p className="text-xs text-muted-foreground">
            {paragraphs.length} paragraph{paragraphs.length !== 1 ? "s" : ""} · {cleanedText.length.toLocaleString()} characters
          </p>
        </div>
      </div>

      {/* Content with refined typography */}
      <div className="space-y-6">
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className="text-pretty leading-relaxed text-foreground/90 first-letter:text-lg first-letter:font-medium"
            style={{
              animationDelay: `${Math.min(index * 30, 300)}ms`,
            }}
          >
            {paragraph.trim()}
          </p>
        ))}
      </div>

      {/* End mark */}
      <div className="mt-12 flex justify-center">
        <div className="flex items-center gap-2 text-muted-foreground/40">
          <span className="h-px w-8 bg-current" />
          <span className="text-xs tracking-widest">END</span>
          <span className="h-px w-8 bg-current" />
        </div>
      </div>
    </article>
  );
}

export default function DocumentPage() {
  const params = useParams();
  const documentId = params.id as Id<"documents">;

  const document = useQuery(api.documents.get, { id: documentId });

  // Loading state
  if (document === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Loading document...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Document not found
  if (document === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to library
          </Link>

          <div className="mt-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Document not found</h1>
            <p className="mt-2 text-muted-foreground">
              This document may have been deleted or the link is invalid.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const statusCfg = statusConfig[document.status];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Library</span>
          </Link>

          <div className={`flex items-center gap-2 ${statusCfg.className}`}>
            {statusCfg.icon}
            <span className="text-sm font-medium">{statusCfg.label}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Document title section */}
        <div className="mb-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm dark:from-slate-800 dark:to-slate-900">
              <FileText className="h-7 w-7 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                {document.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Uploaded {new Date(document.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Content area */}
        {document.status === "ready" && document.extractedText ? (
          <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-sm sm:p-10">
            <TextContent text={document.extractedText} />
          </div>
        ) : (
          <StatusCard status={document.status} error={document.error} />
        )}

        {/* Chat panel - show when document is ready */}
        {document.status === "ready" && (
          <div className="mt-8">
            <ChatPanel
              documentId={documentId}
              isReady={document.embeddingStatus === "ready"}
            />
          </div>
        )}
      </main>

      {/* Footer spacing */}
      <div className="h-16" />
    </div>
  );
}
