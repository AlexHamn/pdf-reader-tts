# Project Epics

Progress tracker for the Interactive PDF Reader with TTS and Q&A.

---

## Epic 1: Foundation & PDF Upload
**Status:** Complete

### Tasks
- [x] Next.js project setup with Convex integration
- [x] Basic UI shell (layout, navigation)
- [x] PDF upload to Convex file storage
- [x] Document list/library view

### Deliverable
Users can upload and view their PDF library

---

## Epic 2: OCR Pipeline
**Status:** Complete

### Tasks
- [x] Modal OCR endpoint (DeepSeek-OCR 2)
- [x] Convex action to trigger OCR on upload
- [x] Store extracted text in Convex DB
- [x] Basic PDF viewer showing extracted text

### Deliverable
Uploaded PDFs are processed and text is viewable

---

## Epic 3: Embeddings & Vector Search
**Status:** Complete

### Tasks
- [x] Modal embedding endpoint (nomic-embed-text-v1.5, 768 dimensions)
- [x] Convex RAG component integration with custom embeddings
- [x] Chunk text and generate embeddings on document processing
- [x] Vector storage in Convex

### Deliverable
Documents are indexed and searchable

### Implementation Notes
- **Embedding Endpoint**: `modal/embedding_endpoint.py` using sentence-transformers
- **RAG Config**: `convex/rag.ts` with custom EmbeddingModelV3 wrapper for Modal
- **Embeddings Logic**: `convex/embeddings.ts` with chunking (1000 chars, 200 overlap)
- **Schema Updates**: Added `embeddingStatus`, `embeddingError`, `chunkCount` to documents
- **Auto-trigger**: OCR completion automatically schedules embedding generation

---

## Epic 4: Q&A Chat Interface
**Status:** Complete

### Tasks
- [x] Chat UI component per document
- [x] RAG retrieval for context
- [x] LLM integration for answers (Modal vLLM + Qwen2.5-7B-Instruct)
- [x] Chat history persistence

### Deliverable
Users can ask questions about their documents

### Implementation Notes
- **LLM Endpoint**: `modal/llm_endpoint.py` using vLLM with Qwen/Qwen2.5-7B-Instruct on A10G GPU
- **Chat Actions**: `convex/chat.ts` - sends messages with RAG context to LLM, includes full conversation history (up to 20 messages)
- **Chat Queries**: `convex/chatQueries.ts` - message retrieval and storage, includes `listMessagesInternal` for fetching history within actions
- **Chat UI**: `src/components/chat-panel.tsx` - chat interface integrated into document page
- **Schema**: Uses existing `chatMessages` table for message persistence
- **Conversation Context**: Full message history is sent to the LLM, enabling follow-up questions with pronoun references (e.g., "What does she do?" after asking about a character)

### Technical Debt / Future Improvements
> **TODO: Revisit @convex-dev/agent integration**
>
> Currently using direct HTTP calls to the LLM instead of the Convex Agent component.
> This is due to a peer dependency conflict:
> - `@convex-dev/rag` requires `ai@^6.0.0`
> - `@convex-dev/agent` requires `ai@^5.0.29`
>
> When these packages become compatible (likely when agent supports ai SDK v6),
> consider migrating to use the Agent component for:
> - Built-in thread management
> - Streaming deltas over WebSocket
> - ~~Message history context~~ (now implemented manually)
> - Rate limiting
> - Usage tracking

---

## Epic 5: TTS Playback
**Status:** Complete

### Tasks
- [x] Modal TTS endpoint (Chatterbox)
- [x] Audio player component
- [x] Text-to-audio segment mapping
- [x] Synchronized text highlighting during playback
- [x] Click-to-play text chunks

### Deliverable
Full read-aloud experience with highlighting

### Implementation Notes
- **TTS Endpoint**: `modal/tts_endpoint.py` using Chatterbox TTS on A10G GPU
- **Convex TTS Module**: `convex/tts.ts` - audio chunk storage, playback state management, and generation actions
- **Audio Player**: `src/components/audio-player.tsx` - full-featured player with play/pause, skip, speed control, auto-advance
- **Schema Updates**: Added `audioChunks` and `playbackState` tables for chunk storage and real-time playback sync
- **Text Highlighting**: Active chunk is highlighted in violet during playback with smooth scroll-into-view
- **Click-to-Play**: Clicking any text chunk starts playback from that chunk
- **Auto-generation**: Audio is automatically generated when viewing a document without audio

---

## Epic 6: TTS Parallel Processing
**Status:** Complete

### Background
Current TTS generation is sequential with `max_inputs=1`, causing 100-page documents to take 60-80+ minutes. Modal's official Chatterbox example uses `max_inputs=10` on A10G GPU.

### Tasks
- [x] Install and configure `@convex-dev/workpool` component
- [x] Register workpool in `convex/convex.config.ts`
- [x] Create `convex/ttsWorkpool.ts` with pool configuration
- [x] Refactor `convex/tts.ts` to use Workpool for parallel chunk generation
- [x] Implement `onChunkComplete` callback for progress tracking
- [x] Configure Modal for container scaling (`max_containers=10`)
- [x] Improve text cleaning to prevent TTS errors (OCR artifacts, bounding boxes)

### Deliverable
TTS generation runs in parallel through container scaling

### Implementation Notes
- **Key Finding**: Chatterbox TTS cannot handle concurrent GPU requests on the same container. Attempts with `max_inputs=5-10` caused tensor conflicts ("stack expects each tensor to be equal size", "got NoneType").
- **Solution**: Parallelism via container scaling, not concurrent GPU access
  - `max_containers=10` - Modal scales up to 10 containers under load
  - No `min_containers` - no idle costs, accepts cold starts
  - Each container processes 1 request at a time with its own GPU
- **Workpool Config**: `convex/ttsWorkpool.ts` with `maxParallelism: 10`, retry with exponential backoff
- **Text Cleaning**: Enhanced `cleanOCRText` in `convex/tts.ts` and `preprocess_text` in Modal endpoint to remove OCR artifacts (`<|ref|>`, `<|det|>` tags, bounding boxes, technical codes like `LSL-901A`)
- **Progress Tracking**: `onChunkComplete` mutation counts completed chunks and marks document ready when all finish

### References
- [Modal Chatterbox Example](https://modal.com/docs/examples/chatterbox_tts)
- [Convex Workpool](https://www.convex.dev/components/workpool)

---

## Epic 7: OCR Parallelization & Streaming
**Status:** Not Started

### Background
Current OCR processes pages sequentially in a single Modal function call. For 100+ pages, this risks timeout and provides no progress feedback until complete.

### Tasks
- [ ] Refactor OCR endpoint to process page ranges (batches of 20-30 pages)
- [ ] Implement Modal `.map()` for parallel page batch processing
- [ ] Add progressive result storage (save after each batch completes)
- [ ] Increase PDF download timeout from 60s to 180s
- [ ] Add page-level progress tracking in Convex
- [ ] Implement checkpointing for resume on failure
- [ ] Test with 100+ page PDFs

### Deliverable
OCR handles large documents reliably with progress feedback

### Technical Notes
- **Batch Size**: 20-30 pages per batch (balances parallelism vs memory)
- **Parallel Workers**: 4-6 optimal (more causes system churn per research)
- **Memory**: Process pages incrementally, don't hold all in memory
- **Timeout**: Increase Modal function timeout to 15 minutes

### References
- [Modal Scaling Out](https://modal.com/docs/guide/scale)
- [Modal Job Processing](https://modal.com/docs/guide/job-queue)

---

## Epic 8: Frontend Virtualization
**Status:** Not Started

### Background
Current frontend renders all text chunks as DOM nodes. For 100+ page documents (400+ chunks), this causes performance issues and memory pressure.

### Tasks
- [ ] Install `react-window` and `react-virtualized-auto-sizer`
- [ ] Refactor `TextContent` component to use `FixedSizeList`
- [ ] Implement `AutoSizer` for responsive container sizing
- [ ] Add `overscanCount` buffer (5-10 items)
- [ ] Implement custom search to replace broken Ctrl+F
- [ ] Paginate `audioChunks` query (fetch 100 at a time)
- [ ] Add lazy loading for audio chunk data
- [ ] Test scrolling performance with 500+ chunks

### Deliverable
Smooth scrolling and low memory usage for large documents

### Technical Notes
- **Item Height**: Calculate consistent height for `FixedSizeList`
- **Search**: Custom search component that finds text, calculates position, scrolls to match
- **Highlight Sync**: Ensure active chunk highlighting works with virtualization
- **Click-to-Play**: Maintain click handler functionality on virtualized items

### References
- [react-window Guide](https://web.dev/articles/virtualize-long-lists-react-window)
- [React Virtualization Patterns](https://www.patterns.dev/vanilla/virtual-lists/)

---

## Epic 9: Progressive Playback & UX
**Status:** Not Started

### Background
Currently, users must wait for all TTS chunks to generate before playback. With parallelization, chunks complete out of order, enabling early playback.

### Tasks
- [ ] Allow playback to start when first N chunks are ready
- [ ] Show generation progress (X of Y chunks complete)
- [ ] Handle out-of-order chunk completion gracefully
- [ ] Add "generating..." indicator for pending chunks
- [ ] Implement smart pre-buffering (generate chunks ahead of playback position)
- [ ] Add estimated time remaining for full generation
- [ ] Test playback continuity during active generation

### Deliverable
Users can start listening immediately while generation continues

### Technical Notes
- **Buffer Strategy**: Keep 5-10 chunks ahead of current playback position
- **Priority Queue**: Generate chunks near playback position first
- **UI States**: Playing, buffering, generating, ready
- **Error Handling**: Skip failed chunks, retry in background

---

## Epic 10: Configuration & Optimization
**Status:** Not Started

### Background
Various configuration tweaks to optimize for large documents.

### Tasks
- [ ] Increase embedding batch size from 50 to 100
- [ ] Increase OCR Modal timeout from 10 to 15 minutes
- [ ] Add configurable TTS chunk size (larger for long docs)
- [ ] Implement document size detection and adaptive processing
- [ ] Add memory monitoring and cleanup for Modal endpoints
- [ ] Performance benchmarking suite for regression testing

### Deliverable
Optimized configuration for documents of all sizes

### Technical Notes
- **Adaptive Processing**: Detect page count, adjust batch sizes accordingly
- **Chunk Size Trade-off**: Larger TTS chunks = fewer chunks but less granular playback

---

## Progress Summary

| Epic | Status | Completion |
|------|--------|------------|
| 1. Foundation & PDF Upload | Complete | 100% |
| 2. OCR Pipeline | Complete | 100% |
| 3. Embeddings & Vector Search | Complete | 100% |
| 4. Q&A Chat Interface | Complete | 100% |
| 5. TTS Playback | Complete | 100% |
| 6. TTS Parallel Processing | Complete | 100% |
| 7. OCR Parallelization & Streaming | Not Started | 0% |
| 8. Frontend Virtualization | Not Started | 0% |
| 9. Progressive Playback & UX | Not Started | 0% |
| 10. Configuration & Optimization | Not Started | 0% |
