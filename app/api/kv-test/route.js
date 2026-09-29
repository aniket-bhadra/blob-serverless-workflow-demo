import { kvGet, kvSet } from "@/lib/kv";
import { NextResponse } from "next/server";

export async function GET() {
  await kvSet("test:1", { status: "pending", step: 1 });
  return NextResponse.json(await kvGet("test:1"));
}

// only for testing