# Scaling to 100+ Pages: Implementation Guide

This guide provides detailed implementation instructions for scaling the PDF reader to handle documents with 100+ pages.

## Overview

| Component | Current Bottleneck | Solution | Expected Improvement |
|-----------|-------------------|----------|---------------------|
| TTS Generation | Sequential, `max_inputs=1` | Parallel with Workpool | 10x faster |
| OCR Processing | Sequential pages, single call | Parallel batches with `.map()` | 3-4x faster |
| Frontend Rendering | All chunks in DOM | react-window virtualization | Constant memory |
| Playback UX | Wait for all chunks | Progressive playback | Immediate start |

---

## Epic 6: TTS Parallel Processing

### Step 1: Update Modal TTS Endpoint

**File:** `modal/tts_endpoint.py`

Change the concurrent inputs limit:

```python
# Before
@modal.concurrent(max_inputs=1)

# After
@modal.concurrent(max_inputs=10)
```

This single change allows 10 concurrent TTS requests per container. Modal's official Chatterbox example uses this exact configuration on A10G GPU.

### Step 2: Install Convex Workpool

```bash
npm install @convex-dev/workpool
```

### Step 3: Configure Workpool Component

**File:** `convex/convex.config.ts`

```typescript
import { defineApp } from "convex/server";
import rag from "@convex-dev/rag/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp();
app.use(rag);
app.use(workpool);

export default app;
```

### Step 4: Create TTS Workpool

**File:** `convex/ttsWorkpool.ts`

```typescript
import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

// TTS pool with parallelism matching Modal endpoint
export const ttsPool = new Workpool(components.workpool, {
  maxParallelism: 10,

  // Retry transient failures with backoff
  retries: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 10000,
  },
});
```

### Step 5: Refactor TTS Generation

**File:** `convex/tts.ts`

Replace the sequential loop with Workpool batch enqueueing:

```typescript
import { ttsPool } from "./ttsWorkpool";

export const processDocumentTTS = action({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const chunks = await getChunksToProcess(ctx, args.documentId);

    // Batch enqueue all chunks for parallel processing
    const jobs = chunks.map((chunk, index) => ({
      action: internal.tts.generateSingleChunk,
      args: {
        documentId: args.documentId,
        chunkIndex: index,
        text: chunk.text,
      },
      // Optional: callback when each chunk completes
      onComplete: internal.tts.onChunkComplete,
    }));

    await ttsPool.enqueueActionBatch(ctx, jobs);
  },
});

// Called when each chunk finishes (success or failure)
export const onChunkComplete = internalMutation({
  args: {
    documentId: v.id("documents"),
    chunkIndex: v.number(),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Update progress, enable progressive playback
    await updateChunkStatus(ctx, args);
  },
});
```

### Step 6: Deploy and Test

```bash
# Deploy Modal endpoint
cd modal && modal deploy tts_endpoint.py

# Deploy Convex
npx convex deploy

# Test with a 50+ page document
```

---

## Epic 7: OCR Parallelization

### Step 1: Refactor OCR Endpoint for Page Batches

**File:** `modal/ocr_endpoint.py`

```python
import modal

# New function to process a batch of pages
@app.function(
    gpu="A10G",
    timeout=900,  # 15 minutes
    retries=modal.Retries(max_retries=2, initial_delay=1.0),
)
def process_page_batch(
    pdf_bytes: bytes,
    start_page: int,
    end_page: int,
) -> dict:
    """Process a range of pages from a PDF."""
    from pdf2image import convert_from_bytes

    # Convert only the specified page range
    images = convert_from_bytes(
        pdf_bytes,
        first_page=start_page + 1,  # pdf2image is 1-indexed
        last_page=end_page + 1,
        dpi=150,
    )

    results = []
    for i, image in enumerate(images):
        page_num = start_page + i
        text = run_ocr_on_image(image)
        results.append({
            "page": page_num,
            "text": text,
        })

    return {
        "start_page": start_page,
        "end_page": end_page,
        "pages": results,
    }


@app.function(gpu="A10G", timeout=60)
def get_page_count(pdf_bytes: bytes) -> int:
    """Quick function to get PDF page count."""
    from pdf2image import pdfinfo_from_bytes
    info = pdfinfo_from_bytes(pdf_bytes)
    return info["Pages"]


# Main orchestrator using .map() for parallelism
@app.function(timeout=1800)  # 30 minutes for orchestration
def process_pdf_parallel(pdf_url: str, batch_size: int = 25) -> dict:
    """Process PDF in parallel batches."""
    import requests

    # Download PDF
    response = requests.get(pdf_url, timeout=180)
    pdf_bytes = response.content

    # Get page count
    total_pages = get_page_count.remote(pdf_bytes)

    # Create batch ranges
    batches = []
    for start in range(0, total_pages, batch_size):
        end = min(start + batch_size, total_pages)
        batches.append((pdf_bytes, start, end))

    # Process batches in parallel using .map()
    # Modal will automatically scale containers
    results = list(process_page_batch.starmap(batches))

    # Combine results in order
    all_pages = []
    for batch_result in sorted(results, key=lambda x: x["start_page"]):
        all_pages.extend(batch_result["pages"])

    full_text = "\n\n".join(page["text"] for page in all_pages)

    return {
        "text": full_text,
        "page_count": total_pages,
        "pages": all_pages,  # Individual page texts for granular storage
    }
```

### Step 2: Update Convex OCR Action

**File:** `convex/ocr.ts`

```typescript
export const processOCR = action({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.documents.get, { id: args.documentId });

    // Call parallel OCR endpoint
    const response = await fetch(process.env.MODAL_OCR_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdf_url: doc.fileUrl,
        batch_size: 25,  // Pages per batch
      }),
    });

    const result = await response.json();

    // Store full text
    await ctx.runMutation(internal.documents.updateOCRResult, {
      documentId: args.documentId,
      text: result.text,
      pageCount: result.page_count,
    });

    // Optionally store per-page text for granular access
    if (result.pages) {
      await ctx.runMutation(internal.documents.storePageTexts, {
        documentId: args.documentId,
        pages: result.pages,
      });
    }
  },
});
```

### Step 3: Add Progress Tracking (Optional)

For real-time progress updates during OCR, use webhooks or polling:

```python
# In Modal endpoint - call webhook after each batch
@app.function(gpu="A10G", timeout=900)
def process_page_batch_with_progress(
    pdf_bytes: bytes,
    start_page: int,
    end_page: int,
    webhook_url: str,
    document_id: str,
) -> dict:
    result = process_pages(pdf_bytes, start_page, end_page)

    # Notify Convex of progress
    requests.post(webhook_url, json={
        "documentId": document_id,
        "completedPages": end_page,
        "batchResult": result,
    })

    return result
```

---

## Epic 8: Frontend Virtualization

### Step 1: Install Dependencies

```bash
npm install react-window react-virtualized-auto-sizer
npm install -D @types/react-window
```

### Step 2: Create Virtualized Text Component

**File:** `src/components/virtualized-text-content.tsx`

```typescript
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useCallback, useRef, useEffect } from 'react';

interface VirtualizedTextContentProps {
  chunks: Array<{
    chunkIndex: number;
    textContent: string;
    isReady: boolean;
  }>;
  activeChunkIndex: number | null;
  onChunkClick: (index: number) => void;
}

const ITEM_HEIGHT = 120; // Consistent height for each chunk
const OVERSCAN_COUNT = 5; // Render 5 items outside viewport

export function VirtualizedTextContent({
  chunks,
  activeChunkIndex,
  onChunkClick,
}: VirtualizedTextContentProps) {
  const listRef = useRef<List>(null);

  // Scroll to active chunk when it changes
  useEffect(() => {
    if (activeChunkIndex !== null && listRef.current) {
      listRef.current.scrollToItem(activeChunkIndex, 'center');
    }
  }, [activeChunkIndex]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const chunk = chunks[index];
    const isActive = index === activeChunkIndex;

    return (
      <div
        style={style}
        className={`p-4 cursor-pointer border-b transition-colors ${
          isActive ? 'bg-violet-100 border-violet-300' : 'hover:bg-gray-50'
        }`}
        onClick={() => onChunkClick(index)}
      >
        <p className="text-sm leading-relaxed">
          {chunk.textContent}
        </p>
        {!chunk.isReady && (
          <span className="text-xs text-gray-400 mt-1">
            Generating audio...
          </span>
        )}
      </div>
    );
  }, [chunks, activeChunkIndex, onChunkClick]);

  return (
    <AutoSizer>
      {({ height, width }) => (
        <List
          ref={listRef}
          height={height}
          width={width}
          itemCount={chunks.length}
          itemSize={ITEM_HEIGHT}
          overscanCount={OVERSCAN_COUNT}
        >
          {Row}
        </List>
      )}
    </AutoSizer>
  );
}
```

### Step 3: Add Custom Search

Since virtualization breaks Ctrl+F, implement custom search:

**File:** `src/components/text-search.tsx`

```typescript
import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';

interface TextSearchProps {
  chunks: Array<{ textContent: string }>;
  onNavigateToChunk: (index: number) => void;
}

export function TextSearch({ chunks, onNavigateToChunk }: TextSearchProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<number[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);

  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      setMatches([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const found = chunks
      .map((chunk, index) => ({ index, hasMatch: chunk.textContent.toLowerCase().includes(lowerQuery) }))
      .filter(item => item.hasMatch)
      .map(item => item.index);

    setMatches(found);
    setCurrentMatch(0);

    if (found.length > 0) {
      onNavigateToChunk(found[0]);
    }
  }, [query, chunks, onNavigateToChunk]);

  const navigateMatch = (direction: 'prev' | 'next') => {
    if (matches.length === 0) return;

    const newIndex = direction === 'next'
      ? (currentMatch + 1) % matches.length
      : (currentMatch - 1 + matches.length) % matches.length;

    setCurrentMatch(newIndex);
    onNavigateToChunk(matches[newIndex]);
  };

  return (
    <div className="flex items-center gap-2 p-2 border-b">
      <Search className="w-4 h-4 text-gray-400" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        placeholder="Search in document..."
        className="flex-1"
      />
      {matches.length > 0 && (
        <>
          <span className="text-sm text-gray-500">
            {currentMatch + 1} of {matches.length}
          </span>
          <Button variant="ghost" size="sm" onClick={() => navigateMatch('prev')}>
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigateMatch('next')}>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}
```

### Step 4: Paginate Chunk Queries

**File:** `convex/tts.ts`

```typescript
// Add paginated query for large documents
export const getAudioChunksPaginated = query({
  args: {
    documentId: v.id("documents"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    let query = ctx.db
      .query("audioChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId));

    if (args.cursor) {
      query = query.filter((q) => q.gt(q.field("_id"), args.cursor));
    }

    const chunks = await query.take(limit + 1);

    const hasMore = chunks.length > limit;
    const items = hasMore ? chunks.slice(0, -1) : chunks;
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  },
});
```

---

## Epic 9: Progressive Playback

### Key Concept

With parallel TTS generation, chunks complete out of order. The frontend should:
1. Allow playback as soon as the first chunk is ready
2. Show which chunks are ready vs generating
3. Buffer ahead of playback position

### Step 1: Track Chunk Readiness

**File:** `convex/schema.ts`

Ensure `audioChunks` table has status field:

```typescript
audioChunks: defineTable({
  documentId: v.id("documents"),
  chunkIndex: v.number(),
  textContent: v.string(),
  audioFileId: v.optional(v.id("_storage")),
  status: v.union(
    v.literal("pending"),
    v.literal("generating"),
    v.literal("ready"),
    v.literal("failed")
  ),
  durationMs: v.optional(v.number()),
  // ...
})
```

### Step 2: Playback Logic with Buffering

**File:** `src/hooks/use-progressive-playback.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';

interface Chunk {
  chunkIndex: number;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  audioUrl?: string;
}

export function useProgressivePlayback(chunks: Chunk[]) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const currentChunk = chunks[currentIndex];
  const canPlay = currentChunk?.status === 'ready';

  // Check buffer ahead
  const BUFFER_SIZE = 5;
  const bufferStatus = useCallback(() => {
    const upcoming = chunks.slice(currentIndex, currentIndex + BUFFER_SIZE);
    const readyCount = upcoming.filter(c => c.status === 'ready').length;
    return {
      buffered: readyCount,
      needed: Math.min(BUFFER_SIZE, chunks.length - currentIndex),
      isBuffering: readyCount < 2 && currentIndex < chunks.length - 1,
    };
  }, [chunks, currentIndex]);

  // Auto-advance when chunk finishes
  const onChunkEnd = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < chunks.length) {
      setCurrentIndex(nextIndex);

      // Check if next chunk is ready
      if (chunks[nextIndex]?.status !== 'ready') {
        setIsBuffering(true);
      }
    } else {
      setIsPlaying(false);
    }
  }, [currentIndex, chunks]);

  // Resume when buffering completes
  useEffect(() => {
    if (isBuffering && currentChunk?.status === 'ready') {
      setIsBuffering(false);
    }
  }, [isBuffering, currentChunk?.status]);

  return {
    currentIndex,
    setCurrentIndex,
    isPlaying,
    setIsPlaying,
    isBuffering,
    canPlay,
    bufferStatus: bufferStatus(),
    onChunkEnd,
  };
}
```

### Step 3: Generation Progress UI

**File:** `src/components/generation-progress.tsx`

```typescript
interface GenerationProgressProps {
  total: number;
  ready: number;
  generating: number;
  failed: number;
}

export function GenerationProgress({ total, ready, generating, failed }: GenerationProgressProps) {
  const percent = Math.round((ready / total) * 100);

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-gray-600 whitespace-nowrap">
        {ready}/{total} chunks ready
      </span>
      {generating > 0 && (
        <span className="text-blue-500 animate-pulse">
          {generating} generating...
        </span>
      )}
      {failed > 0 && (
        <span className="text-red-500">
          {failed} failed
        </span>
      )}
    </div>
  );
}
```

---

## Deployment Checklist

### Modal Deployments

```bash
# Deploy updated TTS endpoint (Epic 6)
cd modal && modal deploy tts_endpoint.py

# Deploy updated OCR endpoint (Epic 7)
cd modal && modal deploy ocr_endpoint.py
```

### Convex Deployments

```bash
# After installing workpool and updating schema
npx convex deploy
```

### Environment Variables

Ensure these are set in Convex dashboard:
- `MODAL_TTS_ENDPOINT` - Updated TTS endpoint URL
- `MODAL_OCR_ENDPOINT` - Updated OCR endpoint URL

### Testing Checklist

- [ ] Test TTS with 50-page document (should complete in ~5-8 min vs 25-40 min)
- [ ] Test OCR with 100-page document (should complete in ~3-5 min)
- [ ] Test frontend scrolling with 500+ chunks (should be smooth)
- [ ] Test progressive playback (should start within 30s of generation start)
- [ ] Test search functionality in virtualized list
- [ ] Monitor Modal GPU memory usage under load
- [ ] Verify Workpool retry behavior on transient failures

---

## Performance Benchmarks

Track these metrics before and after implementation:

| Metric | Current (Sequential) | Target (Parallel) |
|--------|---------------------|-------------------|
| 100-page TTS generation | ~80 min | <10 min |
| 100-page OCR processing | ~8 min | <3 min |
| Time to first playback | ~80 min | <1 min |
| Frontend memory (500 chunks) | ~200MB | <50MB |
| Scroll FPS (500 chunks) | ~15 FPS | 60 FPS |
