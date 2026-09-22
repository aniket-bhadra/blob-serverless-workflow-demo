import { issueSignedToken, presignUrl } from "@vercel/blob";

export async function POST(request) {
  const { pathname } = await request.json();

  const token = await issueSignedToken({
    pathname,
    operations: ["put"],
    oidcToken: process.env.VERCEL_OIDC_TOKEN,
    storeId: process.env.BLOB_STORE_ID,
  });

  const { presignedUrl } = await presignUrl(token, {
    pathname,
    operation: "put",
    validUntil: Date.now() + 15 * 60 * 1000,
  });

  return Response.json({ presignedUrl });
}