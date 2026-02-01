"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface AudioPlayerProps {
  documentId: Id<"documents">;
  onChunkChange?: (chunkIndex: number, startChar: number, endChar: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function AudioPlayer({ documentId, onChunkChange, onPlayStateChange }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasTriggeredAutoPlay = useRef(false);
  const hasTriggeredGeneration = useRef(false);
  const shouldContinuePlaying = useRef(false); // Track intent to continue between chunks

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);

  // Convex queries and mutations
  const playbackState = useQuery(api.tts.getPlaybackState, { documentId });
  const audioChunks = useQuery(api.tts.listAudioChunks, { documentId });
  const updatePlaybackState = useMutation(api.tts.updatePlaybackState);
  const generateAudio = useAction(api.tts.generateDocumentAudio);

  const currentChunkIndex = playbackState?.currentChunkIndex ?? 0;
  const currentChunk = audioChunks?.[currentChunkIndex];
  const totalChunks = audioChunks?.length ?? 0;
  const hasAudio = totalChunks > 0;

  // Auto-generate audio for documents that don't have it yet (e.g., processed before TTS was added)
  useEffect(() => {
    if (audioChunks === undefined) return; // Wait for query to load
    if (hasTriggeredGeneration.current) return; // Only trigger once
    if (audioChunks.length > 0) return; // Already has audio
    if (isGenerating) return; // Already generating

    hasTriggeredGeneration.current = true;
    setIsGenerating(true);
    setError(null);

    generateAudio({
      documentId,
      language: "es",
      exaggeration: 0.5,
      cfgWeight: 0.5,
    })
      .catch((err) => {
        console.error("Failed to generate audio:", err);
        setError(err instanceof Error ? err.message : "Failed to generate audio");
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [audioChunks, isGenerating, generateAudio, documentId]);

  // Auto-play when audio becomes available
  useEffect(() => {
    if (!hasAudio || !autoPlay || hasTriggeredAutoPlay.current) return;
    if (!currentChunk?.audioUrl || !audioRef.current) return;

    hasTriggeredAutoPlay.current = true;
    shouldContinuePlaying.current = true; // Enable continuous playback
    const audio = audioRef.current;
    audio.src = currentChunk.audioUrl;
    audio.playbackRate = playbackSpeed;
    audio.load();

    // Small delay to ensure audio is loaded
    setTimeout(() => {
      audio.play().catch(console.error);
      updatePlaybackState({ documentId, isPlaying: true });
    }, 100);
  }, [hasAudio, currentChunk?.audioUrl, autoPlay]);

  // Notify parent of chunk changes
  useEffect(() => {
    if (currentChunk && onChunkChange) {
      onChunkChange(
        currentChunkIndex,
        currentChunk.startCharIndex,
        currentChunk.endCharIndex
      );
    }
  }, [currentChunkIndex, currentChunk, onChunkChange]);

  // Notify parent of play state changes
  useEffect(() => {
    onPlayStateChange?.(localIsPlaying);
  }, [localIsPlaying, onPlayStateChange]);

  // Sync with external playback state changes (e.g., when user clicks a text chunk)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentChunk?.audioUrl) return;

    // If playback state says play but audio is actually paused, start playing
    // Using audio.paused directly avoids stale closure issues with localIsPlaying
    if (playbackState?.isPlaying && audio.paused) {
      shouldContinuePlaying.current = true;
      audio.play().catch(console.error);
    }
  }, [playbackState?.isPlaying, currentChunk?.audioUrl]);

  // Load audio when chunk changes (after initial auto-play)
  useEffect(() => {
    if (!hasTriggeredAutoPlay.current) return;
    if (!currentChunk?.audioUrl || !audioRef.current) return;

    const audio = audioRef.current;
    audio.src = currentChunk.audioUrl;
    audio.playbackRate = playbackSpeed;
    audio.load();

    // Play if we should continue (from previous chunk ending) or if currently playing
    // Note: external play requests (e.g., clicking text chunks) are handled by the sync effect
    if (shouldContinuePlaying.current || !audio.paused) {
      shouldContinuePlaying.current = false; // Reset flag
      audio.play().catch(console.error);
    }
  }, [currentChunk?.audioUrl]);

  // Set up audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      // Auto-advance to next chunk
      if (currentChunkIndex < totalChunks - 1) {
        shouldContinuePlaying.current = true; // Signal to continue playing next chunk
        updatePlaybackState({
          documentId,
          currentChunkIndex: currentChunkIndex + 1,
        });
      } else {
        // Reached the end
        shouldContinuePlaying.current = false;
        setLocalIsPlaying(false);
        updatePlaybackState({ documentId, isPlaying: false });
      }
    };
    const handlePlay = () => setLocalIsPlaying(true);
    const handlePause = () => setLocalIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [currentChunkIndex, totalChunks, documentId, updatePlaybackState]);

  // Preload next chunk
  useEffect(() => {
    if (currentChunkIndex < totalChunks - 1) {
      const nextChunk = audioChunks?.[currentChunkIndex + 1];
      if (nextChunk?.audioUrl) {
        const preloadAudio = new Audio();
        preloadAudio.preload = "auto";
        preloadAudio.src = nextChunk.audioUrl;
      }
    }
  }, [currentChunkIndex, audioChunks, totalChunks]);

  const handleGenerateAudio = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await generateAudio({
        documentId,
        language: "es",
        exaggeration: 0.5,
        cfgWeight: 0.5,
      });
    } catch (err) {
      console.error("Failed to generate audio:", err);
      setError(err instanceof Error ? err.message : "Failed to generate audio");
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (localIsPlaying) {
      shouldContinuePlaying.current = false; // User paused, don't auto-continue
      audio.pause();
      updatePlaybackState({ documentId, isPlaying: false });
    } else {
      shouldContinuePlaying.current = true; // User started playing
      audio.play().catch(console.error);
      updatePlaybackState({ documentId, isPlaying: true });
    }
  }, [localIsPlaying, documentId, updatePlaybackState]);

  const skipBack = () => {
    const audio = audioRef.current;
    if (!audio) return;

    // If more than 2 seconds in, restart current chunk
    if (audio.currentTime > 2) {
      audio.currentTime = 0;
      return;
    }

    // Otherwise go to previous chunk
    if (currentChunkIndex > 0) {
      updatePlaybackState({
        documentId,
        currentChunkIndex: currentChunkIndex - 1,
      });
    }
  };

  const skipForward = () => {
    if (currentChunkIndex < totalChunks - 1) {
      updatePlaybackState({
        documentId,
        currentChunkIndex: currentChunkIndex + 1,
      });
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * duration;
  };

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Show generating state
  if (!hasAudio) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40">
            {isGenerating ? (
              <Loader2 className="h-7 w-7 animate-spin text-violet-600 dark:text-violet-400" />
            ) : (
              <Volume2 className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {isGenerating ? "Generating Audio..." : "Read Aloud"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isGenerating
                ? "Preparing text-to-speech for this document"
                : "Starting audio generation..."}
            </p>
          </div>
          {error && (
            <>
              <p className="text-sm text-destructive">{error}</p>
              <Button
                onClick={handleGenerateAudio}
                disabled={isGenerating}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </>
          )}
          {isGenerating && (
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 rounded-full bg-violet-400 dark:bg-violet-500"
                  style={{
                    animation: "pulse 1.4s ease-in-out infinite",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Audio player UI
  return (
    <div data-audio-player className="rounded-2xl border border-border/50 bg-card/95 backdrop-blur-md shadow-lg p-4">
      <audio ref={audioRef} preload="auto" />

      {/* Track info */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium text-foreground">
            Reading Aloud
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Chunk {currentChunkIndex + 1} of {totalChunks}
          </span>
          {/* Auto-play toggle */}
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              autoPlay
                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                : "bg-muted text-muted-foreground"
            }`}
            title={autoPlay ? "Auto-play enabled" : "Auto-play disabled"}
          >
            {autoPlay ? (
              <Volume2 className="h-3 w-3" />
            ) : (
              <VolumeX className="h-3 w-3" />
            )}
            Auto
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="mb-3 cursor-pointer"
        onClick={handleProgressClick}
        role="progressbar"
        aria-valuenow={currentTime}
        aria-valuemax={duration}
      >
        <Progress value={duration ? (currentTime / duration) * 100 : 0} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        {/* Time display */}
        <span className="w-16 text-xs tabular-nums text-muted-foreground">
          {formatTime(currentTime)}
        </span>

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBack}
            disabled={currentChunkIndex === 0}
            className="h-9 w-9"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="default"
            size="icon"
            onClick={togglePlayPause}
            className="h-10 w-10 rounded-full"
          >
            {localIsPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 translate-x-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            disabled={currentChunkIndex >= totalChunks - 1}
            className="h-9 w-9"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Speed and duration */}
        <div className="flex w-16 items-center justify-end gap-2">
          <button
            onClick={cyclePlaybackSpeed}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>
    </div>
  );
}
