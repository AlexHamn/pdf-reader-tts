import { PDFUpload } from "@/components/pdf-upload";
import { DocumentList } from "@/components/document-list";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          PDF Reader with TTS
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          Upload PDFs, listen to them read aloud, and ask questions about the
          content.
        </p>

        <PDFUpload />
        <DocumentList />
      </main>
    </div>
  );
}
