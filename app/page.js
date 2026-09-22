"use client";

export default function Home() {
  async function handleSubmit(event) {
    event.preventDefault();

    const file = event.target.file.files[0];

    const response = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pathname: file.name,
      }),
    });

    const { presignedUrl } = await response.json();

    await fetch(presignedUrl, {
      method: "PUT",
      body: file,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="file" name="file" />
      <button type="submit">Upload</button>
    </form>
  );
}