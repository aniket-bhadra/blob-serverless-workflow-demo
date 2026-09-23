import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { processUploadedFile } from "@/workflows/process-uploaded-file";

export async function GET() {
  const fakeBlobUrl = "https://example.com/fake-file2.jpg";
  const run = await start(processUploadedFile, [fakeBlobUrl]); // ← trigger point
  return NextResponse.json({ started: true, runId: run.runId });
}
