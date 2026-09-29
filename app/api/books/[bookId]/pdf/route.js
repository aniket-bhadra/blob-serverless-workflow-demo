import { getUserId } from "@/lib/dummy-auth";
import { kvGet } from "@/lib/kv";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const userId = await getUserId();
  const { bookId } = await params;

  // ownership check (production: same logic with the Clerk userId and Mongo)
  const book = await kvGet(`book:${bookId}`);
  if (!book || book.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 403 });
  }

  const result = await get(book.pdfPathname, {
    access: "private",
    storeId: process.env.privateBlob_STORE_ID,
  });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // pass the stream straight through, no buffering
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
