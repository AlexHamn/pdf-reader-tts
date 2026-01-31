"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Home() {
  const documents = useQuery(api.documents.list);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="mb-8 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          PDF Reader with TTS
        </h1>
        <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
          Upload PDFs, listen to them read aloud, and ask questions about the
          content.
        </p>

        <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Your Documents
          </h2>
          {documents === undefined ? (
            <p className="text-zinc-500">Loading...</p>
          ) : documents.length === 0 ? (
            <p className="text-zinc-500">
              No documents yet. Upload a PDF to get started.
            </p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc._id}
                  className="rounded border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <span className="font-medium">{doc.title}</span>
                  <span className="ml-2 text-sm text-zinc-500">
                    ({doc.status})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
