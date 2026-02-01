"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import Link from "next/link";

type DocumentStatus = "uploading" | "processing" | "ready" | "error";

const statusConfig: Record<
  DocumentStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  uploading: {
    label: "Uploading",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  processing: {
    label: "Processing",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  ready: {
    label: "Ready",
    icon: <CheckCircle className="h-3 w-3" />,
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  error: {
    label: "Error",
    icon: <AlertCircle className="h-3 w-3" />,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

export function DocumentList() {
  const documents = useQuery(api.documents.list);

  if (documents === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No documents yet. Upload a PDF to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => {
              const isReady = doc.status === "ready";
              const content = (
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    isReady
                      ? "cursor-pointer hover:bg-accent"
                      : "cursor-default"
                  }`}
                >
                  <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{doc.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                    {doc.status === "error" && doc.error && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {doc.error}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={doc.status} />
                </div>
              );

              return (
                <li key={doc._id}>
                  {isReady ? (
                    <Link href={`/document/${doc._id}`}>{content}</Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
