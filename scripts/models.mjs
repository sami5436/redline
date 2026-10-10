// Lists the NVIDIA models available on your Nebius Token Factory account.
// Usage: NEBIUS_API_KEY=... node scripts/models.mjs
const base = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1";
const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}` } });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const { data } = await res.json();
for (const m of data.filter((m) => /nvidia|nemotron/i.test(m.id))) console.log(m.id);
