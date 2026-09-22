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

GitHub repository
       ↓
Vercel project
       ↓
Vercel Blob
       ↓
Next.js app
       ↓
Workflow