"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { useRef, useState } from "react";

export default function Home() {
  const inputRef = useRef(null);
  const [blob, setBlob] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const result = await uploadPresigned(file.name, file, {
      access: "public", // must match the access mode you picked for the store
      handleUploadUrl: "/api/upload",
    });

    setBlob(result);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input ref={inputRef} type="file" name="file" />
      <button type="submit">Upload</button>
      {blob ? <a href={blob.url}>{blob.url}</a> : null}
    </form>
  );
}