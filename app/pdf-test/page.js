"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { useRef } from "react";

export default function PdfTest() {
  const inputRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const result = await uploadPresigned(file.name, file, {
      access: "private",
      handleUploadUrl: "/api/upload-pdf",
    });

    console.log("Upload result:", result);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input ref={inputRef} type="file" name="file" accept="application/pdf" />
      <button type="submit">Upload PDF</button>
    </form>
  );
}
