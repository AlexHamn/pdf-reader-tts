# PDF Reader with TTS

An interactive PDF reader that allows users to upload PDFs, have them read aloud via text-to-speech, and ask questions about the content using RAG.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Convex (database, vector search, file storage, serverless functions)
- **AI Infrastructure**: Modal (GPU-hosted OCR, TTS, and embedding models)

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Convex account
- Modal account (for AI endpoints)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd tts
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Update `.env.local` with your Convex deployment URL.

4. Run the Convex development server:
   ```bash
   npx convex dev
   ```

5. In a separate terminal, run the Next.js development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

```bash
# Run Next.js dev server
npm run dev

# Run Convex dev server (in separate terminal)
npx convex dev

# Build for production
npm run build

# Run linter
npm run lint
```

## Deployment

### Frontend (Vercel)

The Next.js app deploys automatically to Vercel when connected to the repository.

### Backend (Convex)

```bash
npx convex deploy
```

## Architecture

See `CLAUDE.md` for detailed architecture documentation.
