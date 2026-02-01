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

## Development Commands

```bash
# Run Next.js dev server
npm run dev

# Run Convex dev server (separate terminal)
npx convex dev

# Build for production
npm run build

# Lint
npm run lint

# Deploy Convex
CONVEX_DEPLOY_KEY='dev:elegant-snake-131|...' npx convex deploy

# Deploy Modal OCR endpoint
cd modal && modal deploy ocr_endpoint.py

# Deploy to Vercel
vercel --prod
```

## Credentials

- **Modal**: Profile `alexhamn`, token at `/Users/alex/.modal.toml`
- **Convex URL**: `https://elegant-snake-131.convex.cloud`
- **Convex deploy key**: `dev:elegant-snake-131|eyJ2MiI6IjQ4MDA0ZTc4Yzk4NTRlOTFhNGQ0YTMyNGQ2Yjc0YjAxIn0=`
- **Vercel**: https://tts-lanpro.vercel.app

## Implementation Order

See `docs/epics.md` for detailed progress tracking.

1. ~~Foundation & PDF Upload~~ **DONE**
2. ~~OCR Pipeline~~ **DONE**
3. ~~Embeddings & Vector Search~~ **DONE**
4. Q&A Chat Interface
5. TTS Playback

## Important Notes

- Technologies like DeepSeek-OCR 2, Chatterbox TTS, and Convex RAG custom embeddings are recently released/updated. **Always search for latest documentation before implementing.**
- Use A10G or similar GPU on Modal
- Batch embedding requests to reduce latency during document ingestion
- Return embeddings in format expected by Convex RAG component
- Audio format: MP3 or WAV for web compatibility

## Modal Endpoints

### OCR Endpoint (`modal/ocr_endpoint.py`)
- **Model**: DeepSeek-OCR-2 (3B params)
- **GPU**: A10G
- **Endpoint**: Set `MODAL_OCR_ENDPOINT` env var in Convex dashboard
- **Notes**:
  - Uses `attn_implementation="eager"` (SDPA not supported)
  - Model cached in Modal Volume for faster cold starts
  - First request downloads ~6GB model weights
  - Output includes markup tags (`<|ref|>`, `<|det|>`) with bounding boxes - cleaned in frontend (`cleanOCRText` in document page)

### Embedding Endpoint (`modal/embedding_endpoint.py`)
- **Model**: nomic-ai/nomic-embed-text-v1.5 (768 dimensions)
- **GPU**: A10G
- **Endpoint**: Set `MODAL_EMBEDDING_ENDPOINT` env var in Convex dashboard
  - URL: `https://alexhamn--text-embeddings-embeddingmodel-embed.modal.run`
- **Notes**:
  - Uses sentence-transformers for embedding generation
  - Batch embedding up to 100 texts per request
  - Automatically adds `search_document:` prefix for documents
  - Model cached in Modal Volume for faster cold starts
  - Integrated with `@convex-dev/rag` component via custom EmbeddingModelV3 wrapper in `convex/rag.ts`

### Convex RAG Integration
- **Component**: `@convex-dev/rag` registered in `convex/convex.config.ts`
- **Chunking**: 1000 chars with 200-char overlap, sentence boundary preservation
- **Flow**: OCR complete → embeddingStatus: "processing" → chunks generated → embeddings stored → embeddingStatus: "ready"
- **Search**: Use `searchDocument` action in `convex/embeddings.ts` for Q&A retrieval

## References

- Modal Chatterbox TTS: https://modal.com/docs/examples/chatterbox_tts
- Convex RAG component: https://www.convex.dev/components/rag
- Full project spec: `docs/master-prompt.md`
