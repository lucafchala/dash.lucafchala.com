// GitHub Contents API proxy — when GH_PAT is configured as a Pages secret,
// the dash routes all GitHub calls here and the token never reaches the
// browser. Session auth is enforced by the root _middleware before this runs.

const PATH_RE = /^[\w.-]+\/[\w.-]+\/contents\/.+/;

export async function onRequestGet({ env }) {
  return json({ configured: !!env.GH_PAT });
}

export async function onRequestPost({ request, env }) {
  if (!env.GH_PAT) return json({ message: 'GH_PAT não configurado' }, 501);

  let payload;
  try { payload = await request.json(); } catch { return json({ message: 'JSON inválido' }, 400); }
  const { path, method = 'GET', body = null } = payload || {};

  if (typeof path !== 'string' || path.includes('..') || !PATH_RE.test(path)) {
    return json({ message: 'Caminho inválido — apenas a Contents API é permitida' }, 400);
  }
  if (method !== 'GET' && method !== 'PUT') {
    return json({ message: 'Método não permitido' }, 405);
  }

  const res = await fetch(`https://api.github.com/repos/${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${env.GH_PAT}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'dash.lucafchala.com',
    },
    body: body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body)),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
  });
}
