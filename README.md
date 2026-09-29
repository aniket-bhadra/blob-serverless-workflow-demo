## Table of Contents

1. [System Overview](#1-system-overview)
   - [Main components](#main-components)
   - [High-level flow](#high-level-flow)
2. [Book Upload Flow](#2-book-upload-flow)
   - [2.1 Upload the cover image (optional)](#21-upload-the-cover-image-optional)
   - [2.2 Upload the PDF](#22-upload-the-pdf)
   - [2.3 Create the book document](#23-create-the-book-document)
   - [2.4 Start the workflow](#24-start-the-workflow)
3. [Background Workflow: PDF Processing](#3-background-workflow-pdf-processing)
4. [Polling for Processing Status](#4-polling-for-processing-status)
5. [PDF Page-Open Flow](#5-pdf-page-open-flow)
   - [5.1 Step-by-step flow](#51-step-by-step-flow)
   - [5.2 Browser behavior](#52-browser-behavior)
6. [Private vs. Public Blob Storage](#6-private-vs-public-blob-storage)
   - [6.1 Public Blob](#61-public-blob)
   - [6.2 Private Blob](#62-private-blob)
   - [6.3 Key difference](#63-key-difference)
7. [Presigned Upload Flow](#7-presigned-upload-flow)
   - [7.1 Browser initiates the upload](#71-browser-initiates-the-upload)
   - [7.2 Server handles the presigned upload request](#72-server-handles-the-presigned-upload-request)
   - [7.3 Generate the signed token](#73-generate-the-signed-token)
   - [7.4 Return the upload response](#74-return-the-upload-response)
   - [7.5 Browser uploads directly to Blob](#75-browser-uploads-directly-to-blob)
   - [7.6 Upload completion webhook](#76-upload-completion-webhook)
8. [Signed Tokens and Signed URLs](#8-signed-tokens-and-signed-urls)
9. [Buffer, ArrayBuffer, and ReadableStream](#9-buffer-arraybuffer-and-readablestream)
   - [9.1 What is a Buffer?](#91-what-is-a-buffer)
   - [9.2 Why strings and numbers do not need a Buffer](#92-why-strings-and-numbers-do-not-need-a-buffer)
   - [9.3 Buffer vs. ArrayBuffer](#93-buffer-vs-arraybuffer)
   - [9.4 What is a ReadableStream?](#94-what-is-a-readablestream)
10. [Converting a ReadableStream into a Buffer](#10-converting-a-readablestream-into-a-buffer)
    - [10.1 Method 1: Read chunks manually](#101-method-1-read-chunks-manually)
    - [10.2 Method 2: Use `arrayBuffer()`](#102-method-2-use-arraybuffer)
    - [10.3 Why `fs.readFileSync()` does not need conversion](#103-why-fsreadfilesync-does-not-need-conversion)
11. [Database Schema and PDF Pathname](#11-database-schema-and-pdf-pathname)
    - [11.1 `pdfPathname`](#111-pdfpathname)
    - [11.2 Why `pdfPathname`, not `pdfUrl`?](#112-why-pdfpathname-not-pdfurl)
12. [Upload Progress and Cleanup](#12-upload-progress-and-cleanup)
    - [12.1 Upload progress indicator](#121-upload-progress-indicator)
    - [12.2 Prevent accidental navigation](#122-prevent-accidental-navigation)
    - [12.3 Polling timer cleanup](#123-polling-timer-cleanup)
13. [Security and Authorization](#13-security-and-authorization)
    - [13.1 Book ownership check](#131-book-ownership-check)
    - [13.2 Why the ownership check is necessary](#132-why-the-ownership-check-is-necessary)
    - [13.3 Cover image upload security](#133-cover-image-upload-security)
14. [Important Notes](#14-important-notes)
15. [Complete End-to-End Flow](#complete-end-to-end-flow)

---

## 1. System Overview

### Main components

| Component | Responsibility |
| --- | --- |
| **Browser/UI** | Uploads files, displays books, [polls processing status](#4-polling-for-processing-status), renders search results. |
| **Next.js API Routes** | Handles authentication, authorization, database operations, and [PDF streaming](#5-pdf-page-open-flow). |
| **Vercel Blob** | Stores PDFs privately and cover images publicly. See [Private vs. Public Blob Storage](#6-private-vs-public-blob-storage). |
| **Vercel Workflow** | Downloads PDFs, extracts text, creates chunks, upserts to Pinecone. See [Background Workflow](#3-background-workflow-pdf-processing). |
| **MongoDB** | Stores book metadata, ownership, PDF pathname, and processing status. See [Database Schema](#11-database-schema-and-pdf-pathname). |
| **Pinecone** | Stores vector embeddings and chunk metadata. |
| **Clerk** | Handles user authentication and session verification. |

### High-level flow

```text
Browser/UI
   |
   | Upload cover image (optional)
   | Upload PDF directly to Blob
   |
   v
Vercel Blob
   |
   | Return pathname
   v
Next.js API Route
   |
   | Save book metadata
   | Start workflow
   v
MongoDB + Vercel Workflow
   |
   | Download PDF and parse it
   | Create chunks and embeddings
   | Upsert chunks
   v
Pinecone
   |
   | Update status to "ready"
   v
MongoDB
   |
   | Browser polls status
   v
Book becomes available for chat
```

See the full diagram in [Complete End-to-End Flow](#complete-end-to-end-flow).

[⬆ Back to top](#table-of-contents)

---

## 2. Book Upload Flow

### 2.1 Upload the cover image (optional)

On the add/new book page, the user can optionally select a cover image.

If a cover image is selected:

1. The browser uploads the image to the **public** Blob store.
2. The upload completes successfully.
3. The browser receives the cover image's URL.

The cover image is uploaded directly from the browser to Blob storage.

If the cover upload fails, the book upload continues without it and the default cover image is used. See [Cover image upload security](#133-cover-image-upload-security) for the validation rules.

### 2.2 Upload the PDF

The browser uploads the PDF directly to the **private** Blob store (see [Presigned Upload Flow](#7-presigned-upload-flow)).

After the upload completes, the browser receives the Blob object, which includes:

- `pathname`
- `url`

The `pathname` is used later by the server to retrieve the PDF. The PDF bytes do not pass through the Next.js server during this direct upload.

### 2.3 Create the book document

After the PDF upload succeeds, the browser sends:

```http
POST /api/bookupload
```

The request contains:

- `blob.pathname`
- Book title
- Author
- Cover image URL, if uploaded
- Voice

Only the cover image URL is sent, not the image itself.

The server then:

1. Verifies the user's Clerk session.
2. Creates the MongoDB document with the book metadata.
3. Sets `_id` and `namespaceId` to the same value.
4. Saves the PDF's `blob.pathname` in the `pdfPathname` field (see [`pdfPathname`](#111-pdfpathname)).
5. Saves the uploaded cover URL as `coverUrl`, or the default cover image URL if no cover was uploaded.

Using a default cover URL means the UI can always read `coverUrl` without fallback logic.

### 2.4 Start the workflow

Once the MongoDB document is created, the route starts the workflow with:

```js
{
  pathname: blob.pathname,
  bookId: _id.toString()
}
```

The route then returns a `"workflow started"` response. The serverless function finishes, and the UI redirects the user to the home page, where the new book shows a `"processing"` status.

Next: [Background Workflow: PDF Processing](#3-background-workflow-pdf-processing).

[⬆ Back to top](#table-of-contents)

---

## 3. Background Workflow: PDF Processing

The Vercel Workflow handles PDF processing independently of the upload route.

### Processing steps

1. The workflow receives the PDF's `pathname` and the book's ID.
2. It downloads the PDF from private Blob storage using `get()` (see [Private Blob](#62-private-blob)).
3. It converts the returned stream into a Node.js `Buffer` (see [Converting a ReadableStream into a Buffer](#10-converting-a-readablestream-into-a-buffer)).
4. It passes the Buffer to `pdf-parse` to extract the PDF text.
5. It splits the extracted text into chunks.
6. Each chunk includes metadata:
   - Page number
   - Book ID (`bookId.toString()`)
7. It upserts the chunks to Pinecone in batches.
8. It sleeps between batches.
9. After the final batch is upserted, it updates the MongoDB document to `status: "ready"`.
10. The workflow terminates.

### Workflow diagram

```text
Workflow starts
      |
      v
Receive pathname + bookId
      |
      v
get(pathname)
      |
      v
ReadableStream
      |
      v
Convert stream to Buffer
      |
      v
pdf-parse
      |
      v
Extract text and page numbers
      |
      v
Create chunks + metadata
      |
      v
Upsert chunks to Pinecone in batches
      |
      v
Update MongoDB status: "ready"
      |
      v
Workflow terminates
```

### Buffer conversion inside the workflow

```js
const result = await get(pathname, { access: "private" });

const fileBuffer = Buffer.from(
  await new Response(result.stream).arrayBuffer()
);
```

The conversion is needed because `pdf-parse` expects a Buffer, not a ReadableStream. Details in [section 10](#10-converting-a-readablestream-into-a-buffer).

The browser tracks progress through [status polling](#4-polling-for-processing-status).

[⬆ Back to top](#table-of-contents)

---

## 4. Polling for Processing Status

The browser polls a separate API route to check the book's processing status.

### Flow

1. The browser sends a request to the status route.
2. The server checks the book's status in MongoDB.
3. The server returns the current status.
4. The browser keeps polling while status is `"processing"`.
5. Polling stops when status becomes `"ready"` or `"failed"`.

### Status handling

| Status | UI behavior |
| --- | --- |
| `processing` | Keep the processing fade and continue polling. |
| `ready` | Remove the processing fade and enable chat. |
| `failed` | Stop polling and display an appropriate failure state. |

Polling is separate from the workflow itself. Make sure to clear the timer on unmount: see [Polling timer cleanup](#123-polling-timer-cleanup).

[⬆ Back to top](#table-of-contents)

---

## 5. PDF Page-Open Flow

When the user clicks a PDF citation link, the browser requests the PDF from the server and opens it at the specified page.

### 5.1 Step-by-step flow

| Step | Action | Explicit or automatic |
| --- | --- | --- |
| 1 | User clicks `<a href="/api/books/BOOK_ID/pdf#page=12">`. | Explicit |
| 2 | Browser sends the request without the `#page=12` fragment. | Automatic |
| 3 | Server checks whether the logged-in user owns the book ([ownership check](#131-book-ownership-check)). | Explicit |
| 4 | Server calls `get()` to retrieve the private PDF. | Explicit |
| 5 | Blob authentication using the server's OIDC credentials. | Automatic |
| 6 | Server returns the PDF stream in a `Response`. | Explicit |
| 7 | HTTP runtime transmits the response stream to the browser. | Automatic |
| 8 | Browser handles the PDF response and opens its built-in viewer. | Automatic |
| 9 | Viewer navigates to page 12 using the fragment. | Automatic |

### 5.2 Browser behavior

Because the user clicks a regular `<a>` link instead of calling `fetch()`:

- The browser handles the HTTP request.
- The browser receives the PDF response.
- The browser's built-in PDF viewer processes the PDF.
- The viewer uses the `#page=12` fragment to jump to page 12.

No custom client-side JavaScript is needed for PDF streaming or the page jump.

See also: [Security and Authorization](#13-security-and-authorization).

[⬆ Back to top](#table-of-contents)

---

## 6. Private vs. Public Blob Storage

### 6.1 Public Blob

When a file is uploaded to a public Blob store, `put()` returns a `.url` that works as a direct link.

```text
https://xyz.public.blob.storage.com/book123.pdf
```

Anyone with the public URL can access the file. Used for cover images.

### 6.2 Private Blob

Private Blob storage requires authentication to retrieve file contents.

`put()` still returns a `.url` and a `.pathname`, but the private URL is **not** a directly accessible public link.

To retrieve the file, the server calls:

```js
const result = await get(pathname, {
  access: "private",
});
```

The server's OIDC credentials authenticate the request to Blob storage. `get()` returns a result object containing the Blob info and a ReadableStream (see [ReadableStream](#94-what-is-a-readablestream)).

### 6.3 Key difference

| Feature | Public Blob | Private Blob |
| --- | --- | --- |
| Returns `.url` | Yes | Yes |
| Returns `.pathname` | Yes | Yes |
| Directly accessible by anyone with the URL | Yes | No |
| Requires authenticated server retrieval | No | Yes |
| Used for cover images | Yes | Not in this flow |
| Used for private PDF storage | No | Yes |

[⬆ Back to top](#table-of-contents)

---

## 7. Presigned Upload Flow

`uploadPresigned()` lets the browser upload files directly to Vercel Blob without sending file bytes through the Next.js server.

The flow is the same for public and private Blob storage. The difference is how the file is accessed after upload (see [section 6](#6-private-vs-public-blob-storage)).

### 7.1 Browser initiates the upload

```js
uploadPresigned(pathname, file, {
  // Upload options
});
```

- `pathname` identifies the file path or name.
- `file` contains the actual file bytes.

The first argument is sent to the server as metadata in the upload request. The file bytes go directly from the browser to Blob storage.

### 7.2 Server handles the presigned upload request

The server route calls:

```js
handleUploadPresigned(request, body);
```

This function:

1. Parses and validates the request and body.
2. Preserves the request context, including headers, for things like webhook verification.
3. Calls the `getSignedToken` callback provided by the application.

### 7.3 Generate the signed token

The application provides the `getSignedToken` callback. It authenticates and authorizes the user, then generates the signed token.

Inside the callback, `issueSignedToken()` makes a request to Vercel's Blob control API. The server authenticates that request using its OIDC credentials (configured via environment variables, never committed to the repo). Vercel returns the signed token.

The callback returns:

```js
{
  token,
  urlOptions,
}
```

See [Signed Tokens and Signed URLs](#8-signed-tokens-and-signed-urls).

### 7.4 Return the upload response

`handleUploadPresigned()` formats the callback result into the response shape the client SDK expects and sends it back to the browser.

### 7.5 Browser uploads directly to Blob

`uploadPresigned()` uses the returned presigned info to send a `PUT` request directly to Blob storage. The file bytes bypass the application server.

Once done, the browser receives the Blob object with:

- `url`
- `pathname`

### 7.6 Upload completion webhook

If configured, Blob storage sends an `onUploadCompleted` webhook to the application's public URL.

The webhook contains Blob metadata like:

- `url`
- `pathname`
- `contentType`

The server can use this to save the uploaded file's metadata in the database.

Since the webhook is an actual HTTP request to the app's public URL, it cannot reach `localhost` directly. Testing it needs a deployed, publicly accessible URL.

> Note: `onUploadCompleted` is not used in the primary book upload flow (see [Important Notes](#14-important-notes)).

[⬆ Back to top](#table-of-contents)

---

## 8. Signed Tokens and Signed URLs

Two different signed mechanisms are involved.

| Mechanism | Purpose |
| --- | --- |
| Upload-time signed token | Authorizes the browser to upload a file directly to Blob storage. |
| Read-time signed URL | Gives time-limited access to an already-uploaded file, if the app uses a signed-read approach. |

### Upload-time signed token

The browser receives signed upload info from the server and uses it to upload directly to Blob storage. The server authenticates and authorizes the user before issuing the token. See [section 7.3](#73-generate-the-signed-token).

### Read-time signed URL

A read-time signed URL can grant temporary access to an already-uploaded PDF.

However, the PDF citation flow in this project does **not** expose a signed PDF URL to the browser. Instead, the browser requests the app's PDF route, and the server checks ownership before retrieving and streaming the private Blob. See [PDF Page-Open Flow](#5-pdf-page-open-flow) and [Book ownership check](#131-book-ownership-check).

[⬆ Back to top](#table-of-contents)

---

## 9. Buffer, ArrayBuffer, and ReadableStream

### 9.1 What is a Buffer?

A `Buffer` is a Node.js object for working with binary data (PDFs, images, videos, other file contents).

When a PDF is read, its raw bytes are loaded into memory so code can process them.

```js
const fileBuffer = fs.readFileSync("book.pdf");
```

`fs.readFileSync()` reads the file from disk and returns a Buffer containing its bytes.

A Buffer is not a separate section of memory. It is an object that gives access to binary data stored in memory.

### 9.2 Why strings and numbers do not need a Buffer

Strings, numbers, arrays, and objects use their own JavaScript types. A Buffer is specifically for raw binary data. You don't need to convert ordinary values into Buffers unless an API requires binary data.

### 9.3 Buffer vs. ArrayBuffer

An `ArrayBuffer` is a JavaScript object representing a fixed-length block of raw binary memory.

A Node.js `Buffer` is built on top of `Uint8Array` and adds extra methods for handling binary data.

| Feature | Buffer | ArrayBuffer |
| --- | --- | --- |
| Provided by | Node.js | JavaScript runtime |
| Represents binary data | Yes | Yes |
| Provides additional binary utility methods | Yes | Limited directly |
| Can hold PDF bytes | Yes | Yes |
| Used by `pdf-parse` | Yes | Requires conversion |

Both can represent the same PDF data in memory.

### 9.4 What is a ReadableStream?

A `ReadableStream` provides data incrementally in chunks as it is consumed. Instead of getting the whole PDF as one object, the app can read it progressively.

In this project, private Blob retrieval returns a result object with a ReadableStream in its `.stream` property. To use it with `pdf-parse`, [convert it into a Buffer](#10-converting-a-readablestream-into-a-buffer).

[⬆ Back to top](#table-of-contents)

---

## 10. Converting a ReadableStream into a Buffer

The [workflow](#3-background-workflow-pdf-processing) receives a stream from Blob storage, but `pdf-parse` needs a Buffer. Two ways to convert:

### 10.1 Method 1: Read chunks manually

Loop over the stream's chunks, store them in an array, then combine with `Buffer.concat()`.

```js
const reader = result.stream.getReader();
const chunks = [];

while (true) {
  const { done, value } = await reader.read();

  if (done) break;

  chunks.push(Buffer.from(value));
}

const fileBuffer = Buffer.concat(chunks);
```

This gives direct control over how the stream is consumed.

### 10.2 Method 2: Use `arrayBuffer()`

`arrayBuffer()` is available on the `Response` object, not directly on the ReadableStream. So first create a `Response` from the stream, then call `.arrayBuffer()`.

```js
const fileBuffer = Buffer.from(
  await new Response(result.stream).arrayBuffer()
);
```

How it works:

1. `new Response(result.stream)` creates a Response object containing the stream.
2. `.arrayBuffer()` consumes the entire stream into one complete ArrayBuffer.
3. `await` waits until the stream is fully consumed.
4. `Buffer.from()` converts the ArrayBuffer into a Node.js Buffer.

The resulting Buffer can be passed to `pdf-parse`. (Background: [Buffer vs. ArrayBuffer](#93-buffer-vs-arraybuffer).)

### 10.3 Why `fs.readFileSync()` does not need conversion

```js
const fileBuffer = fs.readFileSync("book.pdf");
```

It reads the file from disk and returns a Buffer automatically.

In the Blob workflow, `get()` returns a stream instead of a full Buffer, so the stream must be consumed and converted.

[⬆ Back to top](#table-of-contents)

---

## 11. Database Schema and PDF Pathname

### 11.1 `pdfPathname`

The `pdfPathname` field stores the private Blob file's pathname.

It is saved once, right after the PDF upload succeeds and the app creates the book document (see [Create the book document](#23-create-the-book-document)). The server uses it whenever it needs to retrieve the PDF.

```js
{
  _id: bookId,
  namespaceId: bookId,
  title: "Book Title",
  author: "Author Name",
  coverUrl: "https://example.com/cover.jpg",
  pdfPathname: "books/book123.pdf",
  status: "processing"
}
```

### 11.2 Why `pdfPathname`, not `pdfUrl`?

The app stores a pathname instead of a directly accessible link because:

- The PDF is stored privately.
- The browser doesn't use the Blob URL directly.
- The server uses the pathname to retrieve the PDF through `get()` (see [Private Blob](#62-private-blob)).
- The server checks ownership before returning the PDF (see [Book ownership check](#131-book-ownership-check)).

The pathname acts as the reference the server uses to locate the private file.

[⬆ Back to top](#table-of-contents)

---

## 12. Upload Progress and Cleanup

### 12.1 Upload progress indicator

While the PDF upload, cover upload, and book creation request are in progress, show a progress toast or overlay.

Suggested message:

> Uploading, please don't close this tab.

### 12.2 Prevent accidental navigation

Add a `beforeunload` listener while the upload or book creation is in progress. This lets the browser show its built-in confirmation prompt if the user tries to close or reload the tab.

Remove the listener as soon as:

1. The book document has been created.
2. The workflow has successfully started.
3. The app is ready to redirect the user to the home page.

Remove it **before** the redirect so it doesn't trigger the prompt during navigation. (Flow context: [Start the workflow](#24-start-the-workflow).)

### 12.3 Polling timer cleanup

`startPolling` uses `setInterval()` to poll the book's processing status (see [section 4](#4-polling-for-processing-status)).

If the component unmounts before polling finishes, the timer must be cleared. Add a cleanup function to the React effect:

```js
useEffect(() => {
  const intervalId = setInterval(startPolling, 3000);

  return () => {
    clearInterval(intervalId);
  };
}, []);
```

This stops the interval from running after unmount.

[⬆ Back to top](#table-of-contents)

---

## 13. Security and Authorization

### 13.1 Book ownership check

The PDF route must verify that the logged-in user owns the requested book.

```js
const book = await Book.findOne({
  _id: bookId,
  userId: userId,
});
```

If the book isn't found for that user, reject the request.

### 13.2 Why the ownership check is necessary

A user could copy a PDF citation link and share it with someone else.

The route must not return the private PDF just because someone knows the book ID or URL. The server checks the Clerk session and confirms ownership before retrieving the file (see [PDF Page-Open Flow](#5-pdf-page-open-flow)).

Requests without a valid session or authorization for the book must be rejected with an appropriate HTTP status, such as `401` or `403`.

### 13.3 Cover image upload security

The cover image upload route should include:

- Clerk authentication
- An image-only content-type restriction
- A file size limit

Since the cover image goes to a public Blob store, validate the upload carefully.

If the cover upload fails, continue with the default cover image (see [Upload the cover image](#21-upload-the-cover-image-optional)).

[⬆ Back to top](#table-of-contents)

---

## 14. Important Notes

- `onUploadCompleted` is not used in the primary book upload flow ([details](#76-upload-completion-webhook)).
- The PDF is uploaded directly from the browser to private Blob storage ([Upload the PDF](#22-upload-the-pdf)).
- The cover image is uploaded directly to public Blob storage ([Upload the cover image](#21-upload-the-cover-image-optional)).
- The book creation route receives the PDF's `blob.pathname`, not the PDF bytes ([Create the book document](#23-create-the-book-document)).
- The workflow receives `pathname` and `bookId.toString()` as arguments ([Start the workflow](#24-start-the-workflow)).
- The workflow converts the PDF stream into a Buffer before calling `pdf-parse` ([section 10](#10-converting-a-readablestream-into-a-buffer)).
- The PDF route checks ownership before retrieving and streaming the private PDF ([section 13](#13-security-and-authorization)).
- The browser uses a regular `<a>` link for PDF citations ([Browser behavior](#52-browser-behavior)).
- The browser's built-in PDF viewer handles the page fragment, such as `#page=12`.
- The PDF is never exposed as a permanent public Blob URL in the citation flow ([Signed Tokens and Signed URLs](#8-signed-tokens-and-signed-urls)).
- The server uses OIDC authentication to retrieve private Blob content ([Private Blob](#62-private-blob)).
- The PDF route and streaming mechanism are shared by normal RAG search and agentic search.

[⬆ Back to top](#table-of-contents)

---

## Complete End-to-End Flow

```text
USER UPLOADS A BOOK
        |
        v
Optional cover upload to public Blob
        |
        v
PDF upload to private Blob
        |
        v
Browser receives blob.pathname
        |
        v
POST /api/bookupload
        |
        v
Create MongoDB book document
        |
        v
Start Vercel Workflow
        |
        +-------------------------------+
        |                               |
        v                               v
Browser redirects                 Workflow downloads PDF
to home page                            |
        |                               v
        v                         Convert stream to Buffer
Poll processing status                  |
        |                               v
        |                         Extract PDF text
        |                               |
        |                               v
        |                         Create chunks + metadata
        |                               |
        |                               v
        |                         Upsert to Pinecone
        |                               |
        |                               v
        |                         Update status: ready
        |                               |
        +---------------+---------------+
                        |
                        v
                 Book is ready
                        |
                        v
                   RAG Search
                        |
                        v
              Retrieve relevant chunks
                        |
                        v
               Display PDF citation
                        |
                        v
            Click /api/books/[bookId]/pdf#page=12
                        |
                        v
                 Verify ownership
                        |
                        v
                 get(pdfPathname)
                        |
                        v
                Stream PDF to browser
                        |
                        v
              Browser PDF viewer opens
                        |
                        v
                     Page 12
```

[⬆ Back to top](#table-of-contents)