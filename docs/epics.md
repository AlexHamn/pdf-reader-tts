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
**Status:** Not Started

### Tasks
- [ ] Modal TTS endpoint (Chatterbox)
- [ ] Audio player component
- [ ] Text-to-audio segment mapping
- [ ] Synchronized text highlighting during playback

### Deliverable
Full read-aloud experience with highlighting

---

## Progress Summary

| Epic | Status | Completion |
|------|--------|------------|
| 1. Foundation & PDF Upload | Complete | 100% |
| 2. OCR Pipeline | Complete | 100% |
| 3. Embeddings & Vector Search | Complete | 100% |
| 4. Q&A Chat Interface | Complete | 100% |
| 5. TTS Playback | Not Started | 0% |
