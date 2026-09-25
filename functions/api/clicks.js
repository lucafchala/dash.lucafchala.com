// Cliques nos links curtos (dash#28, opção 1): lê o que a Cloudflare JÁ mede.
//
// Cada clique num link curto é um pedido a lucafchala.com/<slug> respondido
// com 301/302 pelo `_redirects`. A análise HTTP da zona registra esses pedidos
// (host, caminho, status) — então basta perguntar à API GraphQL quantos 3xx
// houve por caminho. Nada muda em como os links são servidos, nada é gravado
// aqui e nenhum IP é lido: a consulta só pede contagens por caminho.
//
// O Web Analytics não serve: ele é um beacon em JS, e um redirecionamento não
// carrega página nenhuma.
//
// O quanto dá para olhar para trás depende do plano, e a Cloudflare não
// publica a tabela por plano: manda consultar o nó `settings`. Por isso cada
// resposta pergunta primeiro `settings.httpRequestsAdaptiveGroups` (se está
// liberado, `notOlderThan`, `maxDuration`, campos disponíveis) e usa a maior
// janela permitida, até 30 dias. A janela vai junto na resposta, e o painel
// mostra "N cliques em X dias".
//
// Segredos (Cloudflare Pages → dash → Settings → Variables and Secrets):
//   CF_ANALYTICS_TOKEN  token com Zone › Analytics › Read na zona lucafchala.com
//   CF_ZONE_ID          o Zone ID de lucafchala.com (Overview da zona)
// Sem eles, responde { configured: false } e o painel não mostra números.
//
// Fica atrás do login: o middleware exige sessão para todo /api/*.

const GQL = 'https://api.cloudflare.com/client/v4/graphql';
const HOST = 'lucafchala.com';
const MAX_WINDOW_S = 30 * 86400;
const MEMO_MS = 5 * 60_000;

// Uma consulta a cada 5 min por isolate, no máximo: os números mudam devagar
// e a API tem limite de consultas por período.
let memo = null;
export function _limparMemo() { memo = null; }

const Q_SETTINGS = `query($zone:String!){viewer{zones(filter:{zoneTag:$zone}){settings{httpRequestsAdaptiveGroups{enabled maxDuration notOlderThan}}}}}`;
const Q_CLIQUES = `query($zone:String!,$since:Time!,$until:Time!,$host:String!){viewer{zones(filter:{zoneTag:$zone}){httpRequestsAdaptiveGroups(limit:1000,filter:{datetime_geq:$since,datetime_leq:$until,clientRequestHTTPHost:$host,edgeResponseStatus_in:[301,302]},orderBy:[count_DESC]){count dimensions{clientRequestPath}}}}}`;

async function gql(token, query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || (j.errors && j.errors.length)) {
    const msg = j && j.errors && j.errors[0] && j.errors[0].message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return j.data;
}

// "/ibi%C3%BAna_2025" → "ibiúna_2025"; "/fern/" → "fern".
export function slugDoCaminho(path) {
  let p = String(path || '');
  try { p = decodeURIComponent(p); } catch { /* caminho malformado: fica como veio */ }
  return p.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function janela(settings, agora = Date.now()) {
  const limites = [MAX_WINDOW_S];
  if (settings && Number(settings.notOlderThan) > 0) limites.push(Number(settings.notOlderThan));
  if (settings && Number(settings.maxDuration) > 0) limites.push(Number(settings.maxDuration));
  // Folga de 5 min: pedir exatamente no limite de `notOlderThan` pode ser recusado.
  const s = Math.max(3600, Math.min(...limites) - 300);
  return { seconds: s, since: new Date(agora - s * 1000).toISOString(), until: new Date(agora).toISOString() };
}

export async function lerCliques(env, agora = Date.now()) {
  const token = env.CF_ANALYTICS_TOKEN, zone = env.CF_ZONE_ID;
  if (!token || !zone) return { configured: false };

  const s = await gql(token, Q_SETTINGS, { zone });
  const settings = s && s.viewer && s.viewer.zones && s.viewer.zones[0] && s.viewer.zones[0].settings && s.viewer.zones[0].settings.httpRequestsAdaptiveGroups;
  if (!settings || settings.enabled === false) {
    return { configured: true, available: false, reason: 'httpRequestsAdaptiveGroups não está liberado para esta zona/plano' };
  }

  const w = janela(settings, agora);
  const d = await gql(token, Q_CLIQUES, { zone, since: w.since, until: w.until, host: HOST });
  const rows = (d && d.viewer && d.viewer.zones && d.viewer.zones[0] && d.viewer.zones[0].httpRequestsAdaptiveGroups) || [];
  const clicks = {};
  for (const r of rows) {
    const slug = slugDoCaminho(r && r.dimensions && r.dimensions.clientRequestPath);
    if (!slug) continue;
    clicks[slug] = (clicks[slug] || 0) + (Number(r.count) || 0);
  }
  return { configured: true, available: true, window: w, clicks, sampled: true };
}

const HEADERS = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' };

export async function onRequestGet({ env }) {
  const agora = Date.now();
  if (memo && agora - memo.em < MEMO_MS) return new Response(memo.body, { headers: HEADERS });
  try {
    const body = JSON.stringify(await lerCliques(env, agora));
    memo = { em: agora, body };
    return new Response(body, { headers: HEADERS });
  } catch (e) {
    // A mensagem crua da API vai para o log; a resposta diz só o tipo do problema.
    console.error('clicks: GraphQL falhou', e);
    const perm = /auth|permission|forbidden|not authorized|unauthorized/i.test(String(e && e.message));
    return new Response(JSON.stringify({ configured: true, available: false, reason: perm ? 'token sem permissão (Zone › Analytics › Read)' : 'a API de analytics não respondeu' }), { status: 502, headers: HEADERS });
  }
}
