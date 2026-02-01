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

Four Modal endpoints:
1. `ocr_endpoint` - PDF → extracted text (DeepSeek-OCR 2) ✓
2. `embedding_endpoint` - text → vectors (nomic-embed-text-v1.5) ✓
3. `llm_endpoint` - Q&A chat completions (Qwen2.5-7B-Instruct via vLLM) ✓
4. `tts_endpoint` - text → audio stream (Chatterbox TTS) ✓

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

# Deploy Modal endpoints
cd modal && modal deploy ocr_endpoint.py
cd modal && modal deploy embedding_endpoint.py
cd modal && modal deploy llm_endpoint.py

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

**MVP (Complete):**
1. ~~Foundation & PDF Upload~~ **DONE**
2. ~~OCR Pipeline~~ **DONE**
3. ~~Embeddings & Vector Search~~ **DONE**
4. ~~Q&A Chat Interface~~ **DONE**
5. ~~TTS Playback~~ **DONE**

**Scaling for 100+ Pages (Planned):**
6. TTS Parallel Processing - Use Workpool + `max_inputs=10`
7. OCR Parallelization - Modal `.map()` for page batches
8. Frontend Virtualization - react-window for large documents
9. Progressive Playback - Start playback before all chunks ready
10. Configuration & Optimization - Batch sizes, timeouts

See `docs/scaling-implementation-guide.md` for detailed implementation instructions.

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

### LLM Endpoint (`modal/llm_endpoint.py`)
- **Model**: Qwen/Qwen2.5-7B-Instruct
- **GPU**: A10G
- **Framework**: vLLM with OpenAI-compatible API
- **Endpoint**: Set `MODAL_LLM_ENDPOINT` env var in Convex dashboard
  - URL: `https://alexhamn--qwen-llm-serve.modal.run`
- **API**: OpenAI-compatible `/v1/chat/completions`
- **Notes**:
  - Model weights cached in Modal Volume (`huggingface-cache`, `vllm-cache`)
  - Max context: 8192 tokens
  - Supports concurrent requests (max 16)

### TTS Endpoint (`modal/tts_endpoint.py`)
- **Model**: Chatterbox TTS (multilingual, 23 languages)
- **GPU**: A10G
- **Endpoint**: Set `MODAL_TTS_ENDPOINT` env var in Convex dashboard
- **API**: POST with `text`, `language`, `exaggeration`, `cfg_weight` parameters
- **Output**: WAV audio (streamed)
- **Concurrency**: Currently `max_inputs=1` (sequential) - **change to 10 for large docs**
- **Notes**:
  - Model cached in Modal Volume (`tts-model-cache`)
  - Text preprocessing to handle problematic characters
  - Minimum text length padding to avoid tensor issues
  - Supports Spanish, English, French, German, Chinese, and more
  - Modal's official Chatterbox example uses `max_inputs=10` on A10G

### TTS Integration
- **Convex Module**: `convex/tts.ts` - audio chunk management and playback state
- **Audio Player**: `src/components/audio-player.tsx` - playback controls, speed adjustment, auto-advance
- **Schema**: `audioChunks` (per-chunk audio storage), `playbackState` (real-time sync)
- **Flow**: Document ready → auto-generate audio → chunks stored with URLs → player loads chunks sequentially
- **Features**:
  - Click-to-play: Click any text chunk to start playback from that position
  - Text highlighting: Active chunk highlighted during playback with auto-scroll
  - Continuous playback: Auto-advances through chunks
  - Playback speed: 0.75x, 1x, 1.25x, 1.5x, 2x

### Q&A Chat Integration
- **Chat Actions**: `convex/chat.ts` - sends user message with RAG context and conversation history to LLM
- **Chat Queries**: `convex/chatQueries.ts` - message list and storage (includes `listMessagesInternal` for fetching history within actions)
- **Chat UI**: `src/components/chat-panel.tsx` - integrated into document page
- **Flow**: User question → fetch conversation history (up to 20 messages) → RAG search for context → LLM generates answer with full context → save to chatMessages table
- **Note**: Currently uses direct HTTP to LLM instead of `@convex-dev/agent` due to ai SDK version conflict (see `docs/epics.md` for details)

### Convex RAG Integration
- **Component**: `@convex-dev/rag` registered in `convex/convex.config.ts`
- **Chunking**: 1000 chars with 200-char overlap, sentence boundary preservation
- **Flow**: OCR complete → embeddingStatus: "processing" → chunks generated → embeddings stored → embeddingStatus: "ready"
- **Search**: Use `searchDocument` action in `convex/embeddings.ts` for Q&A retrieval

## References

- Modal Chatterbox TTS: https://modal.com/docs/examples/chatterbox_tts
- Modal Scaling Guide: https://modal.com/docs/guide/scale
- Convex RAG component: https://www.convex.dev/components/rag
- Convex Workpool (for parallel jobs): https://www.convex.dev/components/workpool
- react-window (virtualization): https://web.dev/articles/virtualize-long-lists-react-window
- Full project spec: `docs/master-prompt.md`
- Scaling guide: `docs/scaling-implementation-guide.md`
