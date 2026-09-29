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
      webhookPublicKey: process.env.privateBlob_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        const userId = await getUserId();
        if (!userId) throw new Error("Unauthorized");
        if (!pathname.startsWith(`${userId}/`))
          throw new Error("Invalid pathname");

        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          storeId: process.env.privateBlob_STORE_ID,
          validUntil: Date.now() + 60 * 60 * 1000,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: ["application/pdf"],
            maximumSizeInBytes: 50 * 1024 * 1024, //50 MB
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
