# Recall — People Memory App

## Quick Start
```bash
npm install
npm run dev
```
Open http://localhost:5173

## Setup
1. Open `.env` → paste your Anthropic API key
2. Run `npm install` then `npm run dev`

## Features
- Add people: name, date met, location, company, connection
- Physical feature & character tags
- Voice capture with AI auto-fill (EN + Bahasa Melayu)
- Meetup diary with editable timestamps
- Smart multi-filter & full-text search
- Dark / light mode toggle
- Export & import JSON backup

## Deploy
- **Netlify**: drag `dist/` after `npm run build`
- **Vercel**: `vercel` CLI or connect GitHub
- **Cloudflare Pages**: connect GitHub repo

## API Key
Voice auto-fill uses Anthropic API client-side (personal use).
For public apps, proxy the key through a serverless function.
