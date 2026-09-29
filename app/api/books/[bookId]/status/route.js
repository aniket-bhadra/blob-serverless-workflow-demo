import { getUserId } from "@/lib/dummy-auth";
import { kvGet } from "@/lib/kv";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const userId = await getUserId();
  const { bookId } = await params;

  const book = await kvGet(`book:${bookId}`);
  if (!book || book.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 403 });
  }
  return NextResponse.json({ status: book.status });
}
