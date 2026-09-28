import { getUserId } from "@/lib/dummy-auth";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.json();
  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        const userId = await getUserId();
        if (!userId) throw new Error("Unauthorized");
        if (!pathname.startsWith(`${userId}/`))
          throw new Error("Invalid pathname");

        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          validUntil: Date.now() + 60 * 60 * 1000,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
            maximumSizeInBytes: 2 * 1024 * 1024, // 2MB
            addRandomSuffix: true,
            validUntil: Date.now() + 10 * 60 * 1000,
          },
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
