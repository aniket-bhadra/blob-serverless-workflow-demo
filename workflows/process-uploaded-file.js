import { sleep } from "workflow";

export async function processUploadedFile(blobUrl) {
  "use workflow";

  const logResult = await logUpload(blobUrl);
  await sleep("3s");

  const validateResult = await validateFile(blobUrl);
  await sleep("6s");

  const notifyResult = await notifyServer(blobUrl, {
    logged: logResult,
    validated: validateResult,
  });

  return {
    blobUrl,
    steps: { logged: logResult, validated: validateResult, notified: notifyResult },
  };
}

async function logUpload(blobUrl) {
  "use step";
  console.log("Step 1 — received upload:", blobUrl);
  return { received: true };
}

async function validateFile(blobUrl) {
  "use step";
  console.log("Step 2 — validating file:", blobUrl);
  return { valid: true };
}

async function notifyServer(blobUrl, summary) {
  "use step";

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/workflow-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrl, summary }),
  });

  return { notified: res.ok };
}