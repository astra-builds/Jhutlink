---
name: vercelskill
description: "Deploy JhutLink (Vite + FastAPI) to Vercel. GitHub: astra-builds. Commands: deploy, set-env, open, list, logs, link, pull, build, dev."
---

# Vercel Deployment — JhutLink

Deploys the **JhutLink** marketplace to Vercel. Project has two parts:

| Part | Directory | Tech |
|------|-----------|------|
| Frontend | `app/` | Vite + React + TypeScript |
| Backend | `backend/` | FastAPI + Python + JSON storage |

> **Note:** The backend uses JSON file storage + background threads — not ideal for Vercel's serverless. For production, migrate to PostgreSQL.

## Prerequisites

- Node.js 18+
- Vercel CLI (`npm i -g vercel`)
- Vercel account connected to GitHub (`astra-builds`)

## Quick Deploy

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login with GitHub (astra-builds)
vercel login

# 3. Deploy frontend from project root
vercel --prod
```

## Project Setup

### 1. Root `vercel.json`

Place this at the project root:

```json
{
  "git": {
    "repository": "https://github.com/astra-builds/jhutlink"
  },
  "buildCommand": "cd app && npm run build",
  "outputDirectory": "app/dist",
  "installCommand": "cd app && npm install",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 2. Environment Variables

Configure in Vercel dashboard or via CLI:

```bash
vercel env add VITE_API_BASE
# → https://jhutlink-api.vercel.app

vercel env add JWT_SECRET
# → production-secret-key
```

### 3. Backend Deployment

The FastAPI backend can be deployed as a **separate Vercel project** or on Railway/Render:

```bash
cd backend
vercel --prod
```

Create `backend/vercel.json`:

```json
{
  "builds": [
    { "src": "api/main.py", "use": "@vercel/python" }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "api/main.py" }
  ]
}
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `vercel` | Deploy preview |
| `vercel --prod` | Deploy to production |
| `vercel env add <key>` | Add environment variable |
| `vercel env pull` | Pull env vars locally |
| `vercel logs` | View deployment logs |
| `vercel list` | List deployments |
| `vercel open` | Open deployment in browser |
| `vercel link` | Link project to Vercel |
| `vercel pull` | Pull latest environment |

## Architecture Notes

- **SPA rewrite**: All routes rewrite to `index.html` for client-side routing
- **API URL**: Set `VITE_API_BASE` to your backend's production URL
- **Storage**: JSON files won't persist across serverless invocations — migrate to PostgreSQL
