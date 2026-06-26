"use client";

import React, {
  useRef,
  useState,
  useCallback,
  DragEvent,
  ChangeEvent,
} from "react";
import type { Transcription } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileStatus = "pending" | "uploading" | "done" | "error";

interface FileEntry {
  /** Stable key — name + size is good enough for the UI queue */
  key: string;
  file: File;
  status: FileStatus;
  /** 0–100, only meaningful when status === "uploading" */
  progress: number;
  errorMessage?: string;
}

export interface UploadDropzoneProps {
  onUploaded: (row: Transcription) => void;
  /** Render a slimmer version suitable for page headers */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMidiFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "mid" || ext === "midi";
}

function fileKey(file: File): string {
  return `${file.name}-${file.size}`;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-amber-400"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// StatusIcon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "uploading") return <Spinner />;
  if (status === "done") {
    return (
      <svg
        className="h-4 w-4 text-emerald-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg
        className="h-4 w-4 text-red-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  // pending
  return (
    <svg
      className="h-4 w-4 text-neutral-500"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// FileRow — a single item in the upload queue
// ---------------------------------------------------------------------------

function FileRow({
  entry,
  onRetry,
  onDismiss,
}: {
  entry: FileEntry;
  onRetry: (entry: FileEntry) => void;
  onDismiss: (key: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2 px-3 rounded-lg bg-neutral-800/50 border border-neutral-700/40">
      <StatusIcon status={entry.status} />

      <span className="flex-1 min-w-0 text-sm text-neutral-300 truncate">
        {entry.file.name}
      </span>

      {entry.status === "uploading" && (
        <span className="text-xs text-neutral-500 tabular-nums">
          {entry.progress}%
        </span>
      )}

      {entry.status === "error" && entry.errorMessage && (
        <span className="text-xs text-red-400 max-w-[140px] truncate" title={entry.errorMessage}>
          {entry.errorMessage}
        </span>
      )}

      {entry.status === "error" && (
        <button
          onClick={() => onRetry(entry)}
          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
          aria-label={`Retry uploading ${entry.file.name}`}
        >
          Retry
        </button>
      )}

      {(entry.status === "done" || entry.status === "error") && (
        <button
          onClick={() => onDismiss(entry.key)}
          className="text-neutral-600 hover:text-neutral-400 transition-colors"
          aria-label={`Dismiss ${entry.file.name}`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      {/* Progress bar — only shown while uploading */}
      {entry.status === "uploading" && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-200"
            style={{ width: `${entry.progress}%` }}
          />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UploadDropzone({ onUploaded, compact = false }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [queue, setQueue] = useState<FileEntry[]>([]);

  // ---- Helpers -----------------------------------------------------------------

  const updateEntry = useCallback(
    (key: string, updates: Partial<FileEntry>) => {
      setQueue((prev) =>
        prev.map((e) => (e.key === key ? { ...e, ...updates } : e)),
      );
    },
    [],
  );

  const uploadFile = useCallback(
    async (entry: FileEntry) => {
      updateEntry(entry.key, { status: "uploading", progress: 0 });

      const fd = new FormData();
      fd.append("file", entry.file);

      // XHR lets us track real upload progress; fetch does not.
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/transcriptions");

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            updateEntry(entry.key, { progress: pct });
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 201) {
            try {
              const row = JSON.parse(xhr.responseText) as Transcription;
              updateEntry(entry.key, { status: "done", progress: 100 });
              onUploaded(row);
            } catch {
              updateEntry(entry.key, {
                status: "error",
                errorMessage: "Unexpected server response.",
              });
            }
          } else {
            let msg = "Upload failed.";
            try {
              const body = JSON.parse(xhr.responseText) as { error?: string };
              if (body.error) msg = body.error;
            } catch {
              // ignore parse failure
            }
            updateEntry(entry.key, { status: "error", errorMessage: msg });
          }
          resolve();
        });

        xhr.addEventListener("error", () => {
          updateEntry(entry.key, {
            status: "error",
            errorMessage: "Network error. Check your connection.",
          });
          resolve();
        });

        xhr.addEventListener("abort", () => {
          updateEntry(entry.key, {
            status: "error",
            errorMessage: "Upload cancelled.",
          });
          resolve();
        });

        xhr.send(fd);
      });
    },
    [updateEntry, onUploaded],
  );

  const enqueueFiles = useCallback(
    (files: File[]) => {
      const newEntries: FileEntry[] = [];
      const rejected: string[] = [];

      for (const file of files) {
        if (!isMidiFile(file)) {
          rejected.push(file.name);
          continue;
        }
        const key = fileKey(file);
        // Skip duplicates already in the queue
        setQueue((prev) => {
          if (prev.some((e) => e.key === key)) return prev;
          const entry: FileEntry = {
            key,
            file,
            status: "pending",
            progress: 0,
          };
          newEntries.push(entry);
          return [...prev, entry];
        });
      }

      if (rejected.length > 0) {
        // Surface client-side rejection as a synthetic error entry so users
        // get feedback without a network round-trip.
        for (const name of rejected) {
          const key = `rejected-${name}-${Date.now()}`;
          const syntheticFile = new File([], name); // placeholder
          const entry: FileEntry = {
            key,
            file: syntheticFile,
            status: "error",
            progress: 0,
            errorMessage: "Only .mid and .midi files are accepted.",
          };
          setQueue((prev) => [...prev, entry]);
        }
      }

      // Kick off uploads for newly enqueued files (after state settles)
      setTimeout(() => {
        for (const entry of newEntries) {
          uploadFile(entry);
        }
      }, 0);
    },
    [uploadFile],
  );

  // ---- Drag handlers -----------------------------------------------------------

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) enqueueFiles(files);
    },
    [enqueueFiles],
  );

  // ---- Input change handler ----------------------------------------------------

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) enqueueFiles(files);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [enqueueFiles],
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // ---- Retry / dismiss ---------------------------------------------------------

  const handleRetry = useCallback(
    (entry: FileEntry) => {
      updateEntry(entry.key, {
        status: "pending",
        progress: 0,
        errorMessage: undefined,
      });
      uploadFile({ ...entry, status: "pending", progress: 0, errorMessage: undefined });
    },
    [updateEntry, uploadFile],
  );

  const handleDismiss = useCallback((key: string) => {
    setQueue((prev) => prev.filter((e) => e.key !== key));
  }, []);

  // ---- Render ------------------------------------------------------------------

  const isIdle = queue.length === 0;

  const zoneClasses = [
    "relative flex flex-col items-center justify-center",
    "rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer",
    "select-none",
    compact ? "px-4 py-3 gap-1.5" : "px-6 py-8 gap-3",
    isDragOver
      ? "border-amber-500/70 bg-amber-500/10 scale-[1.01]"
      : "border-neutral-700/60 bg-neutral-900/40 hover:border-amber-500/40 hover:bg-amber-500/5",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Drop zone */}
      <div
        className={zoneClasses}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openPicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        aria-label="Upload MIDI file. Click or drag and drop."
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          multiple
          className="sr-only"
          onChange={handleInputChange}
          aria-hidden
        />

        {/* Music note icon */}
        <div
          className={[
            "flex items-center justify-center rounded-full transition-colors",
            compact ? "w-8 h-8" : "w-12 h-12",
            isDragOver ? "bg-amber-500/20 text-amber-400" : "bg-neutral-800 text-neutral-400",
          ].join(" ")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={compact ? "w-4 h-4" : "w-6 h-6"}
            aria-hidden
          >
            <path d="M9 3v10.55A4 4 0 1 0 11 17V7h4V3H9z" />
          </svg>
        </div>

        {!compact && (
          <>
            <p className="text-sm font-medium text-neutral-300 text-center">
              {isDragOver ? "Drop your MIDI file here" : "Drop .mid files here"}
            </p>
            <p className="text-xs text-neutral-500 text-center">
              or{" "}
              <span className="text-amber-400/80 underline-offset-2 hover:text-amber-400 transition-colors">
                click to browse
              </span>
              <span className="mx-1.5 text-neutral-700">·</span>
              .mid and .midi only
              <span className="mx-1.5 text-neutral-700">·</span>
              max 5 MB
            </p>
          </>
        )}

        {compact && (
          <p className="text-xs text-neutral-400">
            {isDragOver ? "Drop to upload" : "Drop .mid or click to upload"}
          </p>
        )}
      </div>

      {/* Queue list — only shown when there are files */}
      {!isIdle && (
        <ul className="flex flex-col gap-1.5">
          {queue.map((entry) => (
            <FileRow
              key={entry.key}
              entry={entry}
              onRetry={handleRetry}
              onDismiss={handleDismiss}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
