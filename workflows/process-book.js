import { get } from "@vercel/blob";
import { FatalError, RetryableError } from "workflow";
import { kvMerge } from "../lib/kv.js";

export async function processBook(pdfPathname, bookId) {
  "use workflow";

  try {
    const result = await parseBookPdf(pdfPathname);
    await setStatus(bookId, "ready", result);
    return result;
  } catch (err) {
    await setStatus(bookId, "failed", { error: err.message });
    throw err; // rethrow so the run itself is marked failed
  }
}

async function parseBookPdf(pdfPathname) {
  "use step";

  let blobResult;
  try {
    // storeId is required: without it, get() would look in the public store
    blobResult = await get(pdfPathname, {
      access: "private",
      storeId: process.env.privateBlob_STORE_ID,
    });
  } catch (err) {
    throw new RetryableError(`Blob fetch failed: ${err.message}`);
  }
  if (!blobResult || blobResult.statusCode !== 200) {
    throw new FatalError(`PDF not found in private blob: ${pdfPathname}`);
  }

  const fileBuffer = Buffer.from(
    await new Response(blobResult.stream).arrayBuffer(),
  );
  console.log("Downloaded PDF, bytes:", fileBuffer.length);

  let parsed;
  try {
   
    const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
    parsed = await pdf(fileBuffer);
  } catch (err) {
    throw new FatalError(`PDF parsing failed: ${err.message}`);
  }

  console.log(
    "Parsed PDF, pages:",
    parsed.numpages,
    "| text length:",
    parsed.text.length,
  );
  return { pages: parsed.numpages, textLength: parsed.text.length };
}

async function setStatus(bookId, status, extra = {}) {
  "use step";
  await kvMerge(`book:${bookId}`, { status, ...extra });
  return { status };
}


// `const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;`

// This dynamic import means that instead of importing the module at the top, we import it when this line executes inside the step. `await` waits for the module to load, and `.default` accesses its default export, which we store in the `pdf` variable.



// foundation:


// `get()` returns a Blob result object containing the Blob information and a `ReadableStream` object in its `.stream` property. So, `get()` does not return the stream directly; it returns an object that contains the ReadableStream object, which we can use later to read the PDF data.

// When we access `blobResult.stream`, we get the actual ReadableStream, which provides the PDF data in chunks as we consume it.

// Now, we need a way to collect all these chunks into a single Buffer because `pdf-parse` needs a Buffer to process the PDF.

// There are two ways to do this:

// ### 1. Using a loop and `Buffer.concat()`

// We can use a loop to read each chunk from the stream and push it into an array. Once all the chunks are collected, we use `Buffer.concat()` to combine them into a single Buffer.

// ### 2. Using `arrayBuffer()`

// Instead of manually looping through each chunk, we can use `arrayBuffer()`, which automatically reads the entire stream and collects all the chunks into one complete ArrayBuffer.

// However, `arrayBuffer()` is available on the Response object, not directly on the ReadableStream. So, we first create a Response object by passing the ReadableStream to it, and then call `.arrayBuffer()` on that Response object.


// ```
// const fileBuffer = Buffer.from(
//   await new Response(blobResult.stream).arrayBuffer(),
// );
// ```

// Here, `.arrayBuffer()` reads the entire stream, collects all the chunks, and returns one complete ArrayBuffer. `await` waits until the entire stream has been read.

// This way, we don't need to manually loop through each chunk because `arrayBuffer()` automatically collects all the chunks and returns one complete ArrayBuffer.

// Then, we convert that ArrayBuffer into a Node.js Buffer using `Buffer.from()`, since `pdf-parse` needs a Buffer to process the PDF further.

// ### Note

// When we read a file using `fs.readFileSync()`, this method reads the file from disk, loads its contents into memory, and automatically returns a Buffer object representing that binary data. So, there is no need for any additional conversion.

// But in our example, `get()` provides a stream instead of a complete Buffer. We need to consume the stream and collect all its chunks.

// To avoid manually looping through each chunk, we use `arrayBuffer()`. However, `arrayBuffer()` only exists on the Response object, so we first create a Response object by passing the ReadableStream to it. Then, we call `.arrayBuffer()` on that Response object.

// Once it returns a complete ArrayBuffer, we convert it into a Buffer using `Buffer.from()`.
