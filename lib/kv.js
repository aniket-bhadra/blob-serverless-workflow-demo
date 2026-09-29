const base = () => `${process.env.SUPABASE_URL}/rest/v1/kv_store`;
const headers = () => ({
  apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`,
  "Content-Type": "application/json",
});

export async function kvSet(key, value) {
  const res = await fetch(base(), {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok)
    throw new Error(`kvSet failed: ${res.status} ${await res.text()}`);
}

export async function kvGet(key) {
  const res = await fetch(
    `${base()}?key=eq.${encodeURIComponent(key)}&select=value`,
    {
      headers: headers(),
      cache: "no-store",
    },
  );
  if (!res.ok)
    throw new Error(`kvGet failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

// read-modify-write: updates some fields, keeps the rest
export async function kvMerge(key, patch) {
  const current = (await kvGet(key)) ?? {};
  await kvSet(key, { ...current, ...patch });
}
