This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## The CADENCE agent loop

The agent runs unprompted on a schedule through three Bearer-gated endpoints
(`Authorization: Bearer ${CRON_SECRET}`):

1. `POST /api/signal/poll` — WATCH + DETECT: pull Songstats momentum, raise new opportunities.
2. `POST /api/agent/run` — ANALYZE → GENERATE → PACKAGE → SURFACE for the newest `new` opportunity (or a specific `{ opportunityId }`).
3. `POST /api/agent/weekly` — compile each artist's week into a `weekly_plans` row and push a digest to their Discord webhook.

Every stage writes to `agent_log`; the **Agent control room** (`/agent`) streams it live and can trigger a run manually (signed-in users are scoped to their own opportunities).

### Driving the loop

**n8n (primary):** import `n8n/cadence-agent.json` into a hosted n8n instance and set two environment variables — `APP_BASE_URL` and `CRON_SECRET` (matching the app). The workflow chains the three endpoints on a 6-hour schedule.

**Vercel Cron (fallback):** if n8n isn't available, schedule the same endpoints via cron in `vercel.ts` / `vercel.json`. Vercel cron requests are automatically sent with the project's `CRON_SECRET` as the Bearer token:

```jsonc
{
  "crons": [
    { "path": "/api/signal/poll", "schedule": "0 */6 * * *" },
    { "path": "/api/agent/run",   "schedule": "5 */6 * * *" },
    { "path": "/api/agent/weekly", "schedule": "0 9 * * 1" }
  ]
}
```
