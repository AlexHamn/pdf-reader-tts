# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive PDF Reader with TTS and Q&A - an MVP that allows users to upload PDFs, have them read aloud via text-to-speech, and ask questions about the content using RAG.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui → Vercel
- **Backend**: Convex (database, vector search, file storage, serverless functions)
- **AI Infrastructure**: Modal (GPU-hosted OCR, TTS, and embedding models)

## Architecture

```
Next.js Frontend (Vercel)
        ↓
   Convex Backend
    ↓         ↓
Convex DB   Modal AI (GPU)
            - OCR (DeepSeek-OCR 2)
            - Embeddings (nomic-embed-text/mxbai-embed-large/bge-m3)
            - TTS (Chatterbox or Fish Speech)
```

Three Modal endpoints to implement:
1. `ocr_endpoint` - PDF → extracted text (DeepSeek-OCR 2)
2. `embedding_endpoint` - text → vectors (open-source embedding model)
3. `tts_endpoint` - text → audio stream (Chatterbox TTS)

Convex handles:
- File storage for PDFs
- Document text and metadata
- Vector database via `@convex-dev/rag` with custom Modal embeddings
- Playback state (real-time position sync)
- Chat history per document
- Authentication

## Credentials

- **Modal**: Profile `alexhamn`, token at `/Users/alex/.modal.toml`
- **Convex URL**: `https://elegant-snake-131.convex.cloud`
- **Convex deploy key**: `dev:elegant-snake-131|eyJ2MiI6IjQ4MDA0ZTc4Yzk4NTRlOTFhNGQ0YTMyNGQ2Yjc0YjAxIn0=`

## Implementation Order

1. PDF upload flow + OCR integration (Modal + Convex)
2. Modal embedding endpoint + Convex RAG setup with custom embeddings
3. TTS playback with synchronized text highlighting
4. Q&A chat interface using RAG retrieval

## Important Notes

- Technologies like DeepSeek-OCR 2, Chatterbox TTS, and Convex RAG custom embeddings are recently released/updated. **Always search for latest documentation before implementing.**
- Use A10G or similar GPU on Modal
- Batch embedding requests to reduce latency during document ingestion
- Return embeddings in format expected by Convex RAG component
- Audio format: MP3 or WAV for web compatibility

## References

- Modal Chatterbox TTS: https://modal.com/docs/examples/chatterbox_tts
- Convex RAG component: https://www.convex.dev/components/rag
- Full project spec: `docs/master-prompt.md`
