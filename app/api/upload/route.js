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
        // no auth yet in this toy project — fine for now
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          validUntil: Date.now() + 60 * 60 * 1000,
        });

        return {
          token,
          urlOptions: {
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
