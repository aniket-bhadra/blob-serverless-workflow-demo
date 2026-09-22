## blob flow

Browser
   │
   │ ① request upload authorization
   ▼
Next.js serverless route
   │
   │ ② authorize upload
   ▼
Browser
   │
   │ ③ upload actual file
   ▼
Vercel Blob

The important part: the file itself does not travel through your Next.js server.


## flow
Vercel's own guidance recommends deploying the project first and then attaching the Blob store

GitHub repository
       ↓
Vercel project
       ↓
Vercel Blob
       ↓
Next.js app
       ↓
Workflow



Signed upload URL → temporary permission for the browser to upload the file.
After upload, the file can be public or private, depending on how the Blob is configured/accessed.

the server authenticates with Blob using OIDC, creates a short-lived upload URL, and the browser sends the file directly to Blob using that url


The serverless function:

Receives the filename, not the file.
Uses OIDC to authenticate with Blob.
Creates a URL that permits only a PUT to that specific file.
Returns that temporary URL to the browser.