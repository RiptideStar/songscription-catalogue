import { NextRequest, NextResponse } from "next/server";
import { recordPlay } from "@/lib/storage";

// ---------------------------------------------------------------------------
// POST /api/transcriptions/[id]/play
// Records a practice play (increments play_count, stamps last_played_at).
// Returns the updated Transcription row.
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const updated = await recordPlay(id);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // recordPlay throws "not found" if the id doesn't exist.
    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Transcription not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: `Failed to record play: ${message}` },
      { status: 500 },
    );
  }
}
