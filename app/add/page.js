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

    const guard = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", guard);

    try {
      // 1. Upload cover to public Blob Storage
      if (cover) {
        const coverBlob = await uploadPresigned(
          `${userId}/${cover.name}`,
          cover,
          {
            access: "public",
            handleUploadUrl: "/api/upload-cover",
          },
        );

        coverUrl = coverBlob.url;
      }

      // 2. Upload PDF to private Blob Storage
      const pdfBlob = await uploadPresigned(`${userId}/${pdf.name}`, pdf, {
        access: "private",
        handleUploadUrl: "/api/upload-pdf",
      });

      // 3. Save book metadata in the database
      const res = await fetch("/api/bookupload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pdfPathname: pdfBlob.pathname,
          coverUrl,
        }),
      });

      // 4. Check API response
      if (!res.ok) {
        //         res.json() → Tries to parse the API response as JSON to get the error message.

        // .catch(() => null) → If parsing fails, it returns null instead of throwing another error.

        const errorData = await res.json().catch(() => null);

        throw new Error(
          errorData?.error || `Failed to save book (HTTP ${res.status})`,
        );
      }

      const { bookId } = await res.json();

      console.log("Book saved successfully:", {
        bookId,
        coverUrl,
        pdfPathname: pdfBlob.pathname,
      });
    } catch (err) {
      console.error("Book upload failed:", err);

      if (err instanceof Error) {
        console.error("Error message:", err.message);
      } else {
        console.error("Unknown error:", err);
      }
    } finally {
      // 5. Remove beforeunload listener
      window.removeEventListener("beforeunload", guard);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input ref={coverRef} type="file" accept="image/*" />
      <input ref={pdfRef} type="file" accept="application/pdf" required />
      <button type="submit">Upload</button>
    </form>
  );
}
