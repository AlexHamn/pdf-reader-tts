"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, FileText, X } from "lucide-react";

export function PDFUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);
  const triggerOCR = useMutation(api.documents.triggerOCR);

  const validateFile = (file: File): boolean => {
    if (file.type !== "application/pdf") {
      toast.error("Invalid file type", {
        description: "Please upload a PDF file.",
      });
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large", {
        description: "Please upload a file smaller than 50MB.",
      });
      return false;
    }
    return true;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && validateFile(droppedFile)) {
      setFile(droppedFile);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile && validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    },
    []
  );

  const clearFile = useCallback(() => {
    setFile(null);
    setUploadProgress(0);
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Get upload URL
      setUploadProgress(10);
      const uploadUrl = await generateUploadUrl();

      // Step 2: Upload file to Convex storage
      setUploadProgress(30);
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file to storage");
      }

      const { storageId } = await response.json();
      setUploadProgress(60);

      // Step 3: Create document record
      const title = file.name.replace(/\.pdf$/i, "");
      const documentId = await createDocument({
        title,
        fileName: file.name,
        fileId: storageId,
      });
      setUploadProgress(80);

      // Step 4: Trigger OCR processing
      await triggerOCR({ id: documentId });
      setUploadProgress(100);

      toast.success("PDF uploaded successfully", {
        description: "OCR processing has started.",
      });

      // Reset state
      setFile(null);
      setUploadProgress(0);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed", {
        description:
          error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative rounded-lg border-2 border-dashed p-8 text-center transition-colors
            ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
            ${isUploading ? "pointer-events-none opacity-50" : ""}
          `}
        >
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div className="text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {!isUploading && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  className="ml-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 font-medium">
                Drag and drop your PDF here, or{" "}
                <label className="cursor-pointer text-primary hover:underline">
                  browse
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                PDF files up to 50MB
              </p>
            </>
          )}
        </div>

        {isUploading && (
          <div className="mt-4 space-y-2">
            <Progress value={uploadProgress} />
            <p className="text-center text-sm text-muted-foreground">
              {uploadProgress < 30
                ? "Preparing upload..."
                : uploadProgress < 60
                  ? "Uploading file..."
                  : uploadProgress < 80
                    ? "Creating document..."
                    : "Starting OCR processing..."}
            </p>
          </div>
        )}

        {file && !isUploading && (
          <div className="mt-4 flex justify-center">
            <Button onClick={handleUpload}>
              <Upload className="mr-2 h-4 w-4" />
              Upload PDF
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
