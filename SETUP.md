# Setup Guide - Website Threat Surface Monitor

This guide matches the current runtime behavior of the project.

## 1. Environment Files

Create environment files for both apps:

```bash
cd frontend
cp .env.example .env

cd ..\backend
copy NUL .env
```

Recommended frontend value:

```env
VITE_API_URL=http://127.0.0.1:8000/api/v1
```

Recommended backend starter values:

```env
DEBUG=false
SERVE_FRONTEND=false
SECRET_KEY=change-me-in-production
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_KEY=
SOLA_MCP_ENDPOINT=https://api.sola.security/mcp
SOLA_MCP_CLIENT_ID=
SOLA_MCP_CLIENT_SECRET=
```

## 2. Install Dependencies

Frontend:

```bash
cd frontend
npm install
```

Backend:

```bash
cd backend
.venv\Scripts\Activate.ps1  
pip install -r requirements.txt
```

`apscheduler` is required for recurring scan jobs. If it is missing, the backend will start but scheduled scans will not run.

## 3. Run Locally

Start the backend:

```bash
cd backend
\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Expected local URLs:

- Frontend UI: `http://127.0.0.1:3000`
- Backend API root: `http://127.0.0.1:8000/`
- Backend health: `http://127.0.0.1:8000/health`
- Backend docs: `http://127.0.0.1:8000/docs`

Important:

- `http://127.0.0.1:8000/` is now API-only in local mode.
- `http://127.0.0.1:3000/` is the React app during local development.
- Seeing the same UI on both ports was caused by backend static-file mounting; that behavior is now disabled unless `SERVE_FRONTEND=true`.

## 4. Supabase Setup

Supabase is optional for local demo mode and required for persistent cloud-backed data.

Set these in `backend/.env` when you want Supabase enabled:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

If these values are empty or invalid, the backend falls back to the in-memory demo store.

## 5. Prisma Schema Push

If you are using Supabase and want to apply the Prisma schema:

```bash
cd backend
npx prisma@6 db push --schema=prisma/schema.prisma
```

## 6. Optional Integrations

Cloudflare:

```env
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

Google Sheets:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SHEETS_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}
```

SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
```

Chat webhooks:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## 7. Unified Deployment Mode

Use this only when you want FastAPI to serve the built frontend itself.

1. Build the frontend:

```bash
cd frontend
npm run build
```

2. Set this in `backend/.env`:

```env
SERVE_FRONTEND=true
```

3. Start the backend:

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

With `SERVE_FRONTEND=true`:

- `http://127.0.0.1:8000/` serves the compiled frontend
- unknown non-API routes fall back to `index.html`
- API routes still live under `/api/v1`

## 8. Verification

- `GET http://127.0.0.1:8000/health` returns a healthy JSON response
- `http://127.0.0.1:8000/docs` loads Swagger UI
- `http://127.0.0.1:3000` loads the React app in local mode
- demo login works with `demo@threatmonitor.io` / `demo1234`
- `POST /api/v1/auth/login` returns `200`
