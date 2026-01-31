# Project: Interactive PDF Reader with TTS and Q&A

Build an MVP that allows users to upload a PDF, have it read aloud via text-to-speech, and ask questions about what was read.

**Important**: Some technologies in this stack (like DeepSeek-OCR 2, Chatterbox TTS, and updated Convex RAG components) have been released or updated very recently. You should search online for the latest documentation, setup guides, API specifications, and implementation examples before starting. Do not rely solely on existing knowledge—verify current best practices and breaking changes.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui, deployed to Vercel
- **Backend**: Convex (handles database, vector search, file storage, and serverless functions)
- **AI Infrastructure**: Modal AI (hosts OCR, TTS, and embedding models on GPU)

## Core Features

### 1. PDF Upload & Processing

- User uploads PDF in the Next.js UI
- Send PDF to Convex action which calls Modal endpoint running DeepSeek-OCR 2
- Extract text from PDF and return structured markdown/plain text
- Store the extracted text in Convex

### 2. RAG Implementation

- Use Convex's official `@convex-dev/rag` component for document indexing
- **Use an open-source embedding model (nomic-embed-text, mxbai-embed-large, or bge-m3) hosted on Modal instead of OpenAI embeddings**
- Create a Modal endpoint that accepts text and returns embeddings
- Configure Convex RAG component to use your custom Modal embedding endpoint
- Automatically chunk the extracted text into semantic segments
- Generate embeddings via Modal and store in Convex's built-in vector database
- Enable semantic search for Q&A functionality

### 3. Text-to-Speech Playback

- Create a Modal endpoint hosting Chatterbox TTS model (or Fish Speech V1.5 if easier)
- Frontend should display the text being read with synchronized highlighting
- Stream audio from Modal endpoint as user progresses through document
- Store playback position (current chunk/paragraph index) in Convex in real-time
- Add play/pause controls

### 4. Interactive Q&A

- While audio is playing or paused, user can ask questions in a chat interface
- Use Convex RAG component to retrieve relevant chunks based on the question
- Send retrieved context + question to an LLM (use OpenAI GPT-4, DeepSeek, or other provider via Convex action)
- Display answers in the chat interface with context awareness (knows which section is currently being read)
- Maintain conversation history within the current reading session

## Implementation Requirements

### Convex Setup

- Initialize Convex project with TypeScript
- Install and configure `@convex-dev/rag` component
- **Configure RAG component to use custom embedding endpoint instead of OpenAI**
- Create schema for: documents (PDF metadata, extracted text), playback state (current position, user session), chat history
- Write Convex actions for: PDF upload handling, Modal API calls (OCR + TTS + embeddings), Q&A retrieval
- Use Convex queries for real-time playback position sync
- Use Convex file storage for uploaded PDFs

### Modal Setup

- Create three Modal functions:
  1. `ocr_endpoint`: Accepts PDF, runs DeepSeek-OCR 2, returns extracted text
  2. `embedding_endpoint`: Accepts text strings, runs open-source embedding model (nomic-embed-text, mxbai-embed-large, or bge-m3), returns vector embeddings
  3. `tts_endpoint`: Accepts text chunk, generates audio with Chatterbox or similar open-source TTS, streams audio back
- Use Modal's GPU support (A10G or similar)
- Include proper error handling and timeouts
- Return audio in a web-friendly format (MP3 or WAV)
- **For embeddings, return vectors in the format expected by Convex RAG component**
- **Search for the latest Modal deployment patterns and DeepSeek-OCR 2 integration guides**

### Next.js Frontend

- **Initialize shadcn/ui with Tailwind CSS configuration**
- Use shadcn/ui components throughout the UI:
  - `Button` for all interactive controls
  - `Card` for document display and chat panels
  - `Input` and `Textarea` for chat interface
  - `Progress` for upload/processing indicators and audio progress bar
  - `ScrollArea` for document text display
  - `Separator` for panel dividers
  - `Skeleton` for loading states
  - `Toast` for notifications (upload success, errors)
  - `Dialog` or `Sheet` for any modals
  - `Slider` for audio volume control if implemented
- Create upload page with drag-and-drop PDF support
- Create reader page with three panels:
  1. Document text display with synchronized highlighting of current section
  2. Audio controls (play/pause, progress bar, section navigation)
  3. Chat interface for questions (positioned as sidebar or bottom panel)
- Use Convex React hooks for real-time data subscriptions
- Stream audio from Modal endpoint using HTML5 Audio API
- Implement smooth scrolling to keep current section visible
- Show loading states for OCR processing and TTS generation
- Follow shadcn/ui design patterns for consistent, polished UI

## User Flow

1. User uploads PDF → Shows processing indicator
2. OCR completes → Displays extracted text, enables playback button
3. User clicks play → Audio starts, text highlights current sentence/paragraph
4. User pauses and asks "What does X mean?" → System retrieves relevant chunks around current position → LLM answers using context
5. User resumes playback → Continues from same position

## Additional Considerations

- Handle multi-page PDFs (chunk by page or semantic sections)
- Add simple error handling for failed OCR/TTS/embedding calls
- Store chat history per document in Convex
- Make UI responsive for mobile/desktop
- Add basic authentication (Convex has built-in auth, use it)
- **Batch embedding requests to Modal to reduce latency during document ingestion**

## Credentials & Environment Setup

### Modal Authentication
- **Modal token location**: `/Users/alex/.modal.toml`
- **Profile name**: `alexhamn`
- Modal functions will use this profile for authentication

### Convex Deployment
- **Convex deploy key**: `dev:elegant-snake-131|eyJ2MiI6IjQ4MDA0ZTc4Yzk4NTRlOTFhNGQ0YTMyNGQ2Yjc0YjAxIn0=`
- **Convex Deployment URL**: `https://elegant-snake-131.convex.cloud`
- Add this to your environment for automated deployments

### Additional Environment Variables
- Create `.env.local` for Next.js with:
  - `NEXT_PUBLIC_CONVEX_URL` (provided by Convex after initialization)
  - Any LLM API keys needed for Q&A (if not using DeepSeek or other self-hosted option)
- Configure Modal secrets for any additional API keys needed

## Starting Point

Begin with the PDF upload flow and OCR integration. Once text extraction works, set up the Modal embedding endpoint and configure Convex RAG to use it. Then build TTS playback. Finally, add the Q&A feature. Focus on getting each piece working end-to-end before polishing the UI.

**Before implementing each component, search for:**
- Latest DeepSeek-OCR 2 API documentation and Modal deployment examples
- Current Convex RAG component usage patterns with custom embedding providers
- Open-source embedding model deployment on Modal (nomic-embed-text, mxbai-embed-large, or bge-m3)
- Most recent Chatterbox TTS or Fish Speech integration guides on Modal
- Any updates to Next.js 15 + Convex integration patterns

## References

- Modal Chatterbox TTS example: https://modal.com/docs/examples/chatterbox_tts
- Convex RAG component: https://www.convex.dev/components/rag
- Search online for: "DeepSeek-OCR 2 Modal deployment", "Convex RAG custom embeddings 2026", "nomic-embed-text Modal deployment", "Chatterbox TTS streaming implementation"

## Deliverables

- Working Next.js app with all features using shadcn/ui components
- Convex backend fully configured with custom embedding integration
- Modal functions deployed and callable (OCR, embeddings, TTS)
- README with setup instructions
- Basic documentation on how to run locally and deploy
