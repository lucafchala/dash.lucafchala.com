// /api/clicks: contagem de cliques dos links curtos pela API GraphQL da zona.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const clicks = await import('../functions/api/clicks.js');
const middleware = await import('../functions/_middleware.js');

const realFetch = globalThis.fetch;
let calls = [];
function api({ settings = { enabled: true, maxDuration: 86400 * 3, notOlderThan: 86400 * 8 }, rows = [], errors = null, status = 200 } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, auth: init.headers.Authorization });
    if (errors) return new Response(JSON.stringify({ data: null, errors }), { status });
    if (body.query.includes('settings')) return new Response(JSON.stringify({ data: { viewer: { zones: [{ settings: { httpRequestsAdaptiveGroups: settings } }] } } }));
    return new Response(JSON.stringify({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: rows } ] } } }));
  };
}
const ENV = { CF_ANALYTICS_TOKEN: 't', CF_ZONE_ID: 'z' };
beforeEach(() => clicks._limparMemo());
afterEach(() => { globalThis.fetch = realFetch; });

describe('/api/clicks', () => {
  test('soma 3xx por slug, decodifica o caminho, junta barra final', async () => {
    api({ rows: [
      { count: 7, dimensions: { clientRequestPath: '/instagram' } },
      { count: 2, dimensions: { clientRequestPath: '/ibi%C3%BAna_2025' } },
      { count: 1, dimensions: { clientRequestPath: '/instagram/' } },
    ] });
    const r = await (await clicks.onRequestGet({ env: ENV })).json();
    assert.equal(r.available, true);
    assert.deepEqual(r.clicks, { instagram: 8, 'ibiúna_2025': 2 });
    const q = calls[1].body;
    assert.match(q.query, /edgeResponseStatus_in:\[301,302\]/);
    assert.equal(q.variables.host, 'lucafchala.com');
    assert.doesNotMatch(q.query, /clientIP|clientAS|userAgent/i, 'nunca pede IP nem dado do visitante');
  });

  test('a janela respeita o settings do plano (menor entre maxDuration, notOlderThan e 30 dias)', () => {
    const agora = Date.parse('2026-09-25T12:00:00Z');
    assert.equal(clicks.janela({ maxDuration: 86400 * 3, notOlderThan: 86400 * 8 }, agora).seconds, 86400 * 3 - 300);
    assert.equal(clicks.janela({ maxDuration: 86400 * 90, notOlderThan: 86400 * 90 }, agora).seconds, 30 * 86400 - 300);
    assert.equal(clicks.janela({}, agora).since, new Date(agora - (30 * 86400 - 300) * 1000).toISOString());
  });

  test('sem segredos: configured false, sem chamar a API', async () => {
    api();
    assert.deepEqual(await (await clicks.onRequestGet({ env: {} })).json(), { configured: false });
    assert.equal(calls.length, 0);
  });

  test('dataset não liberado no plano: diz por quê', async () => {
    api({ settings: { enabled: false } });
    const r = await (await clicks.onRequestGet({ env: ENV })).json();
    assert.equal(r.available, false);
    assert.match(r.reason, /não está liberado/);
  });

  test('erro de permissão vira motivo legível, sem ecoar a API', async () => {
    api({ errors: [{ message: 'not authorized for that account' }] });
    const res = await clicks.onRequestGet({ env: ENV });
    assert.equal(res.status, 502);
    const r = await res.json();
    assert.match(r.reason, /Zone › Analytics › Read/);
    assert.doesNotMatch(JSON.stringify(r), /account/);
  });

  test('memo de 5 min: a segunda leitura não chama a API', async () => {
    api({ rows: [] });
    await clicks.onRequestGet({ env: ENV });
    const n = calls.length;
    await clicks.onRequestGet({ env: ENV });
    assert.equal(calls.length, n);
  });

  test('fica atrás do login (middleware devolve 401 JSON sem sessão)', async () => {
    const res = await middleware.onRequest({
      request: new Request('https://dash.lucafchala.com/api/clicks'),
      env: { DASH_PASSWORD: 'x', TURNSTILE_SECRET_KEY: 'y' },
      next: async () => new Response('should not reach'),
    });
    assert.equal(res.status, 401);
  });
});
