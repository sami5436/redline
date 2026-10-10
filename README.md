# Redline: due diligence with receipts

Redline is an AI due-diligence agent. You give it a company, vendor, or counterparty, plus your reason for vetting it. It researches the live web, extracts every verifiable claim, and returns a risk verdict in which **every red flag links to the claim and source behind it**.

Built for the **Nebius x NVIDIA Global AI Hackathon**, Best Apps & Agents track. Powered by **NVIDIA Nemotron on Nebius Token Factory** and **Tavily**.

> Live demo: _TBD_ · Demo video: _TBD_

## Why

Before you wire money to a vendor, sign with a banking partner, or join a startup, you are supposed to do diligence. Professionals pay for Bloomberg, LexisNexis, and analysts. Everyone else googles for ten minutes and hopes for the best. When a counterparty fails, as in the 2024 Synapse collapse that froze end-user funds across a network of fintech apps, the people downstream usually find out last.

Generic chatbots don't fix this. They summarize confidently and invent sources. Redline is built to do the reverse: **no claim without a citation, and no flag without evidence.**

## How it works

```
 subject + purpose
        │
        ▼
 ① PLAN      Nemotron Super  ─ 7 targeted queries across litigation, regulatory, financial,
        │                      leadership, security, customer, and news dimensions
        ▼
 ② SEARCH    Tavily (advanced) ─ parallel search, news topic for recency, deduped and
        │                        interleaved across dimensions → ~24 sources
        ▼
 ③ EXTRACT   Nemotron Nano × N ─ one call per source, 6 in parallel. Pulls atomic
        │                       claims tagged red/amber/green, and rejects
        │                       same-name entities ("about_subject": false)
        ▼
 ④ JUDGE     Nemotron Ultra  ─ weighs severity, recency, and corroboration against your
        │                      stated purpose → risk score, verdict, flags, open questions
        ▼
 ⑤ VERIFY    deterministic   ─ strips any claim ID the judge cited that doesn't exist
                               and drops flags left with no evidence
```

Everything streams to the browser as NDJSON, so you watch the plan, sources, and claims arrive live.

### Model tiering on Token Factory

| Stage | Model | Why this tier |
|---|---|---|
| Plan | Nemotron Super | Needs world knowledge for disambiguation and query craft; one call |
| Extract | Nemotron Nano | High volume (~24 calls/run), narrow task, latency-sensitive. Nano keeps a run fast and cheap |
| Judge | Nemotron Ultra | One long-context reasoning call over the full claims file, where the quality matters |

A typical run is about 26 model calls, and around 90% of them are Nano. The UI shows the calls, tokens, and latency for each tier.

Model IDs are **auto-resolved** from Token Factory's `/v1/models` list (newest Nemotron 3 Nano, Super, and Ultra) or pinned with env vars.

## Run it locally

Requirements: Node 22+, a [Nebius Token Factory](https://tokenfactory.nebius.com) API key, and a [Tavily](https://app.tavily.com) API key.

```bash
git clone https://github.com/sami5436/redline.git
cd redline
npm install
cp .env.example .env.local     # add NEBIUS_API_KEY and TAVILY_API_KEY
npm run models                 # optional: list the Nemotron models your key can access
npm run dev                    # http://localhost:3000
```

The API can also be called directly:

```bash
curl -N localhost:3000/api/diligence -H 'content-type: application/json' \
  -d '{"subject":"Evolve Bank & Trust","context":"BaaS partner for our fintech"}'
```

## Deploy

The app is a standard Next.js app with a single streaming route handler (`maxDuration = 300`). Deploy it to Vercel, or to Nebius Serverless Endpoints with `npm run build && npm start` in a Node container, and set the same env vars.

## Project layout

```
src/lib/pipeline.ts      the agent: plan → search → extract → judge → verify
src/lib/nebius.ts        Token Factory client, model auto-resolution, JSON-mode calls
src/lib/tavily.ts        Tavily search client
src/app/api/diligence    streaming NDJSON endpoint
src/app/page.tsx         UI: live pipeline, report, evidence ledger, markdown export
```

## Feedback on Nebius, NVIDIA, and Tavily

_To be filled in during the hackathon. Running notes:_

- Token Factory:
- Nemotron models:
- Tavily:

## License

MIT. See [LICENSE](LICENSE). Redline is a research aid, not legal or financial advice.
