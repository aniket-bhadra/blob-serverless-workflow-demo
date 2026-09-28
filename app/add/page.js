"use client";

import { DUMMY_USER_ID } from "@/lib/dummy-auth";
import { uploadPresigned } from "@vercel/blob/client";
import { useRef } from "react";

export default function AddBook() {
  const userId = DUMMY_USER_ID; // production: const { userId } = useAuth();
  const coverRef = useRef(null);
  const pdfRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const pdf = pdfRef.current?.files?.[0];
    const cover = coverRef.current?.files?.[0];
    if (!pdf) return;

    let coverUrl = null;
    if (cover) {
      try {
        const coverBlob = await uploadPresigned(
          `${userId}/${cover.name}`,
          cover,
          {
            access: "public",
            handleUploadUrl: "/api/upload-cover",
          },
        );
        coverUrl = coverBlob.url;
      } catch (err) {
        console.warn("Cover upload failed, continuing without it:", err);
      }
    }

    const pdfBlob = await uploadPresigned(`${userId}/${pdf.name}`, pdf, {
      access: "private",
      handleUploadUrl: "/api/upload-pdf",
    });

    console.log({ coverUrl, pdfPathname: pdfBlob.pathname });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input ref={coverRef} type="file" accept="image/*" />
      <input ref={pdfRef} type="file" accept="application/pdf" required />
      <button type="submit">Upload</button>
    </form>
  );
}
