#!/usr/bin/env python3
"""Checks every PURL destination in data.json and writes a Markdown report.

Run weekly by .github/workflows/links.yml, which opens/updates/closes one issue
from the report. It runs on the GitHub runner, not in the dash, so there is no
SSRF surface: it only ever requests the destinations already in data.json.

Broken (counts, fails the run):
  - HTTP 404/410 or 5xx after redirects (retried once);
  - DNS failure, TLS error, timeout;
  - a Google Drive/Docs link that lands on accounts.google.com (sharing was
    turned off, which is how Drive links die silently).
Unverifiable (listed, never counts): 401/403/429, other 4xx and non-standard
codes like LinkedIn's 999 — social networks answer those to any bot, and
domain-restricted Drive files answer 401, so they say nothing about the link.

Usage: check-links.py [data.json] [report.md]; exit 1 if anything is broken.
"""
import json, socket, ssl, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = 'Mozilla/5.0 (compatible; lucafchala-dash-linkcheck/1.0; +https://github.com/lucafchala/dash.lucafchala.com)'
TIMEOUT = 15


def iri_to_uri(url):
    # urllib only speaks ASCII: a destination with an accented path or host
    # (which checkDest accepts) raised UnicodeEncodeError and killed the whole
    # run before the report was written. Percent-encode the path/query and
    # IDNA-encode the host, leaving existing %-escapes alone.
    p = urllib.parse.urlsplit(url)
    if not p.hostname or p.username:
        return urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~")
    netloc = p.hostname.encode('idna').decode('ascii') + (f':{p.port}' if p.port else '')
    safe = "/:@!$&'()*+,;=%~"
    return urllib.parse.urlunsplit((p.scheme, netloc, urllib.parse.quote(p.path, safe),
                                    urllib.parse.quote(p.query, safe + '?'), urllib.parse.quote(p.fragment, safe + '?')))


def fetch(url):
    try:
        req = urllib.request.Request(iri_to_uri(url), headers={'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8'})
    except (ValueError, UnicodeError) as e:
        return None, url, type(e).__name__ + ': ' + str(e)[:120]
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            r.read(2048)
            return r.status, r.geturl(), None
    except urllib.error.HTTPError as e:
        return e.code, e.geturl() or url, None
    except (urllib.error.URLError, socket.timeout, ssl.SSLError, ConnectionError, TimeoutError) as e:
        reason = getattr(e, 'reason', e)
        return None, url, type(reason).__name__ + ': ' + str(reason)[:120]


def check(item):
    slug, url = item['slug'], item['destination']
    for attempt in (1, 2):
        code, final, err = fetch(url)
        google = any(h in url for h in ('drive.google.com', 'docs.google.com'))
        if err:
            verdict, why = 'broken', err
        elif google and 'accounts.google.com' in final:
            verdict, why = 'broken', 'Google pede login: o compartilhamento foi desligado'
        elif code in (404, 410) or 500 <= code <= 599:
            verdict, why = 'broken', f'HTTP {code}'
        elif code >= 400 or code < 200:
            verdict, why = 'unverifiable', f'HTTP {code} (bloqueio a robôs?)'
        else:
            verdict, why = 'ok', f'HTTP {code}'
        if verdict != 'broken' or attempt == 2:
            return {'slug': slug, 'url': url, 'final': final, 'verdict': verdict, 'why': why}
        time.sleep(3)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'data.json'
    out = sys.argv[2] if len(sys.argv) > 2 else 'link-report.md'
    items = [r for r in json.load(open(src, encoding='utf-8'))['redirects'] if str(r.get('destination', '')).startswith(('http://', 'https://'))]
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(check, items))
    broken = [r for r in results if r['verdict'] == 'broken']
    unver = [r for r in results if r['verdict'] == 'unverifiable']

    def table(rows):
        lines = ['| slug | destino | motivo |', '|---|---|---|']
        for r in rows:
            lines.append(f"| `/{r['slug']}` | {r['url']} | {r['why']} |")
        return '\n'.join(lines)

    md = [f"Verificação semanal dos {len(results)} destinos em `data.json` (`scripts/check-links.py`).", '']
    if broken:
        md += [f"## {len(broken)} quebrado(s)", '', table(broken), '',
               'Corrija no dash (editar o link e salvar) ou reative o compartilhamento no Drive. Esta issue fecha sozinha na próxima verificação sem problemas.', '']
    else:
        md += ['Nenhum destino quebrado.', '']
    if unver:
        md += ['<details><summary>' + f"{len(unver)} não verificável(is) (respondem 4xx a robôs; não contam)" + '</summary>', '', table(unver), '', '</details>', '']
    open(out, 'w', encoding='utf-8').write('\n'.join(md))
    print('\n'.join(md))
    print(f"ok={len(results) - len(broken) - len(unver)} broken={len(broken)} unverifiable={len(unver)}")
    sys.exit(1 if broken else 0)


if __name__ == '__main__':
    main()
