CoopTrack
A co-op application tracker built for Drexel students: a kanban pipeline for applications, an interview calendar with Google Calendar sync, salary comparison, and an MCP server so AI assistants can manage applications on your behalf.
Live app: https://cooptrack.lovable.app
<!-- Add a screenshot of the kanban board here: ![CoopTrack board](docs/board.png) -->
Features
Kanban pipeline: Applied, Phone Screen, Interview, Offer, Rejected, plus an Accepted strip for signed offers. Drag and drop cards between stages.
Application cards: company, role, location (opens Google Maps), salary, star rating, remote/hybrid/on-site label, and notes.
AI job-description summarizer: paste a posting and the app autofills role details.
Interview calendar: month view with scheduling, meeting links, and an upcoming-interviews sidebar.
Google Calendar integration: push interviews to Google Calendar, remove them when deleted, and import the next 90 days of events.
Salary comparison: annualizes pay across applications and shows average, median, high/low, and the difference from average.
Stage timeline: every stage change is recorded automatically so you can see when an application moved.
Import / export: JSON and CSV.
Accounts: email and Google sign-in; data syncs across devices.
How it works
Piece	What it does
React + TypeScript + TanStack Start	UI and server functions
Supabase (Postgres)	Auth and data, with row-level security so each user only sees their own rows
Database trigger	Writes a row to application_stage_history whenever an application's stage changes
Google OAuth + Calendar API	Sign-in and two-way calendar sync
Encrypted credentials	Calendar connection keys are encrypted server-side with AES-256-GCM before storage
Google Gemini	Powers the job-description summarizer, called from server functions so the key never reaches the browser
MCP server
CoopTrack exposes an OAuth-protected Model Context Protocol server at /mcp. A connected AI assistant acts as the signed-in user after they approve it on a consent screen.
Tools:
List applications
Create an application
Update an application's stage
List interviews
Schedule an interview
There is deliberately no delete tool.
How it was built
I built CoopTrack with Lovable and AI assistance. I designed the product, the data model and the feature set, tested each feature, and iterated on the results. I completed Anthropic's Introduction to Model Context Protocol course while working on the MCP server.
Running locally
bash
npm install
npm run dev
(Check package.json for the exact scripts.) Server-side secrets, such as the AI key and the encryption key, are configured in the hosting environment and are not stored in this repository. The .env file contains only the public Supabase project URL and publishable key.
Known limitations / next steps
No delete tool in the MCP server (intentional).
Google Calendar sync is one-way push plus a 90-day import, not continuous two-way sync.
Next: reminders before interviews and per-company notes history.
Author
Riya Bansal, Computer Science at Drexel University. GitHub | LinkedIn
