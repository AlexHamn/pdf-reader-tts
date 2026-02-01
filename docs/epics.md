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
**Status:** Not Started

### Tasks
- [ ] Chat UI component per document
- [ ] RAG retrieval for context
- [ ] LLM integration for answers
- [ ] Chat history persistence

### Deliverable
Users can ask questions about their documents

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
| 4. Q&A Chat Interface | Not Started | 0% |
| 5. TTS Playback | Not Started | 0% |
