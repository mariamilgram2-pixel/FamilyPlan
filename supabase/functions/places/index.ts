// Place search for "Add where", through Google Places (New), so the API key
// stays on the server. Only signed-in users can call it: Supabase checks the
// caller's JWT before this runs.
//
//   { action: 'search', input: 'via carota', session }  → { results: [{ id, name, address }] }
//   { action: 'details', id, session }                   → { place: { name, address } }
//
// `session` groups one search's keystrokes and the pick that ends it, which
// is how Google bills them. Set up once:
//   supabase secrets set GOOGLE_PLACES_KEY=<key with Places API (New) enabled>
//   supabase functions deploy places

const KEY = Deno.env.get('GOOGLE_PLACES_KEY');
const API = 'https://places.googleapis.com/v1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!KEY) return json({ error: 'Place search isn’t set up' }, 503);

  const body = await req.json().catch(() => null);
  const session = typeof body?.session === 'string' && /^[\w-]{8,64}$/.test(body.session) ? body.session : undefined;

  if (body?.action === 'search') {
    const input = String(body.input ?? '').trim().slice(0, 120);
    if (input.length < 2) return json({ results: [] });
    const res = await fetch(`${API}/places:autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
      body: JSON.stringify({ input, sessionToken: session, languageCode: 'en' }),
    });
    if (!res.ok) return json({ error: 'Search failed' }, 502);
    const data = await res.json();
    const results = (data.suggestions ?? [])
      .map((s: any) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 5)
      .map((p: any) => ({
        id: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        address: p.structuredFormat?.secondaryText?.text ?? '',
      }));
    return json({ results });
  }

  if (body?.action === 'details') {
    const id = String(body.id ?? '');
    if (!/^[\w-]{10,300}$/.test(id)) return json({ error: 'Unknown place' }, 400);
    const url = `${API}/places/${encodeURIComponent(id)}${session ? `?sessionToken=${session}` : ''}`;
    // Only the name and full address: the cheapest fields, and all we show.
    const res = await fetch(url, { headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'displayName,formattedAddress' } });
    if (!res.ok) return json({ error: 'Couldn’t look that place up' }, 502);
    const p = await res.json();
    return json({ place: { name: p.displayName?.text ?? '', address: p.formattedAddress ?? '' } });
  }

  return json({ error: 'Unknown action' }, 400);
});
