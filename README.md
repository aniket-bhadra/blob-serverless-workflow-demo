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


## two different signed URLs,

Upload-time signed token — the browser gets this from your server to upload directly to Blob (bypasses sending pdf to server)
Read-time signed URL — a separate one whose whole job is letting someone open the already-uploaded book's PDF (the #page=N citation feature) without exposing a permanent public link.

