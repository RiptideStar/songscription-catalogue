import { NextRequest, NextResponse } from "next/server";
import {
  getTranscription,
  updateTranscription,
  deleteTranscription,
  publicMidiUrl,
} from "@/lib/storage";
import type { Transcription } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/transcriptions/[id]
// Returns the row + a midiUrl for streaming/playback.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const row = await getTranscription(id);
    if (!row) {
      return NextResponse.json(
        { error: "Transcription not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ...row,
      midiUrl: publicMidiUrl(row.file_path),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch transcription: ${message}` },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/transcriptions/[id]
// Body JSON: { is_favorite?: boolean; title?: string }
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Partial<Pick<Transcription, "is_favorite" | "title">>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Only accept known mutable fields from the client.
  const patch: Partial<Pick<Transcription, "is_favorite" | "title">> = {};
  if (typeof body.is_favorite === "boolean") patch.is_favorite = body.is_favorite;
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No patchable fields provided (accepted: is_favorite, title)." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateTranscription(id, patch);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update transcription: ${message}` },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/transcriptions/[id]
// Returns 204 No Content.
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await deleteTranscription(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete transcription: ${message}` },
      { status: 500 },
    );
  }
}
