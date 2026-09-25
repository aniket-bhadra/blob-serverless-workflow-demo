// import { auth } from "@clerk/nextjs/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { processUploadedFile } from "@/workflows/process-uploaded-file";

export async function POST(request) {
  // for clerk
  // const { userId } = await auth();

  // if (!userId) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  const body = await request.json();

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
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
      onUploadCompleted: async ({ blob }) => {
        console.log("Upload completed:", blob.url);
        await start(processUploadedFile, [blob.url]); // ← trigger point
        console.log("workflow started...!!!");
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
