import { NextRequest, NextResponse } from "next/server";
import {
  listTranscriptions,
  createTranscription,
} from "@/lib/storage";
import { parseMidi } from "@/lib/midi";
import type { SortKey } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = new Set(["mid", "midi"]);
// Browsers and OSes are wildly inconsistent about the MIME they attach to a
// .mid file — Chrome/Finder often send "application/octet-stream", some send
// nothing at all. So we trust the extension for the gate and let parseMidi() be
// the real validator (a non-MIDI file throws there → clean 400). We only reject
// MIME types that are clearly something else (an image, a pdf, etc).
const ACCEPTED_MIMES = new Set([
  "audio/midi",
  "audio/x-midi",
  "audio/mid",
  "audio/sp-midi",
  "application/x-midi",
  "application/octet-stream", // the common real-world case
  "", // browser omitted it
]);

// ---------------------------------------------------------------------------
// GET /api/transcriptions
// Query params: search, sort, favorites (boolean string), key
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const search = searchParams.get("search") ?? undefined;
  const sortRaw = searchParams.get("sort") ?? undefined;
  const favoritesRaw = searchParams.get("favorites");
  const key = searchParams.get("key") ?? undefined;

  const validSortKeys: SortKey[] = [
    "recent",
    "title",
    "difficulty",
    "duration",
    "played",
  ];
  const sort =
    sortRaw && validSortKeys.includes(sortRaw as SortKey)
      ? (sortRaw as SortKey)
      : undefined;

  const favoritesOnly =
    favoritesRaw === "true" || favoritesRaw === "1" ? true : undefined;

  try {
    const rows = await listTranscriptions({ search, sort, favoritesOnly, key });
    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to list transcriptions: ${message}` },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/transcriptions
// Body: multipart/form-data  { file: File, title?: string }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data." },
      { status: 400 },
    );
  }

  const fileField = formData.get("file");
  if (!fileField || !(fileField instanceof File)) {
    return NextResponse.json(
      { error: "Missing required field: file." },
      { status: 400 },
    );
  }

  const file = fileField as File;

  // Empty file check
  if (file.size === 0) {
    return NextResponse.json(
      { error: "Uploaded file is empty." },
      { status: 400 },
    );
  }

  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum allowed size is 5 MB.` },
      { status: 400 },
    );
  }

  // Extension check
  const originalName = file.name ?? "";
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Only .mid and .midi files are accepted." },
      { status: 400 },
    );
  }

  // MIME check: the extension is the real gate; we only block a MIME that's
  // obviously a different file type. parseMidi() catches anything that slips by.
  const mime = file.type.toLowerCase();
  if (mime && !ACCEPTED_MIMES.has(mime) && !mime.startsWith("audio/")) {
    return NextResponse.json(
      {
        error: `This doesn't look like a MIDI file (type "${file.type}"). Upload a .mid or .midi.`,
      },
      { status: 400 },
    );
  }

  // Derive title: explicit override > filename without extension
  const titleParam = (formData.get("title") as string | null) ?? "";
  const filenameWithoutExt = originalName.replace(/\.[^.]+$/, "") || "Untitled";
  const title = titleParam.trim() || filenameWithoutExt;

  // Read into ArrayBuffer for parseMidi
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return NextResponse.json(
      { error: "Failed to read uploaded file." },
      { status: 400 },
    );
  }

  // Parse MIDI — corrupt or invalid files throw here
  let parsed;
  try {
    parsed = parseMidi(arrayBuffer, title);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not parse MIDI data.";
    return NextResponse.json(
      { error: `Invalid MIDI file: ${message}` },
      { status: 400 },
    );
  }

  // Persist
  try {
    const row = await createTranscription({
      title,
      fileBytes: Buffer.from(arrayBuffer),
      fileSize: file.size,
      parsed,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to save transcription: ${message}` },
      { status: 500 },
    );
  }
}
