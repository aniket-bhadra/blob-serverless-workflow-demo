import { getUserId } from "@/lib/dummy-auth";
import { kvSet } from "@/lib/kv";
import { NextResponse } from "next/server";

export async function POST(request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pdfPathname, coverUrl } = await request.json();
  if (!pdfPathname?.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 403 });
  }

  const bookId = crypto.randomUUID(); // stands in for Mongo's _id
  await kvSet(`book:${bookId}`, {
    userId,
    pdfPathname,
    coverUrl: coverUrl ?? "/default-cover.png",
    status: "processing",
  });

  return NextResponse.json({ bookId, status: "processing" });
}
