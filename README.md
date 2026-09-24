# dash.lucafchala.com

> Painel de controle pessoal do ecossistema [lucafchala.com](https://github.com/lucafchala/lucafchala.com#the-ecosystem). Gerencia os **links curtos (PURLs)** e os **pastes** e **escreve os arquivos gerados nos outros repositórios** pela API do GitHub. Design system e convenções: [README do hub](https://github.com/lucafchala/lucafchala.com#design-system).

**No ar:** [dash.lucafchala.com](https://dash.lucafchala.com) (privado, com senha) · **Stack:** HTML/CSS/JS puro + Cloudflare Pages Functions · **Build:** nenhum

---

## Visão geral

O painel é uma **single-page app** num único `index.html` (HTML, CSS e JS inline), sem framework e sem build. O GitHub é o banco de dados: o painel lê e grava arquivos nos repositórios pela Contents API, e cada commit vira um deploy no Cloudflare Pages.

Três Pages Functions dão a ele um backend mínimo:

| Rota | Arquivo | O que faz |
|---|---|---|
| todas | `functions/_middleware.js` | Login com senha + Cloudflare Turnstile, sessão em cookie `HttpOnly` assinado (24 h), limite de tentativas, `/logout`, 401 em JSON para `/api/*` quando a sessão expira |
| `/api/github` | `functions/api/github.js` | Proxy da Contents API do GitHub com o token `GH_PAT` guardado no servidor — o token nunca chega ao navegador. Só aceita `GET`/`PUT`/`DELETE` em `repos/<repo permitido>/contents/…`, e recusa `%`, `\`, `..` e qualquer repo fora da lista |
| `/api/healthz` | `functions/api/healthz.js` | Sonda pública para o status: diz só se os segredos estão configurados (booleans) |

---

## Funcionalidades

### Serviços, repositórios e links

- **Serviços:** cards para cada subdomínio, com um ponto de status **ao vivo** lido de `status.lucafchala.com/api/status` (verde / amarelo / vermelho, com texto alternativo para leitores de tela).
- **Repositórios:** atalhos para cada repositório do ecossistema no GitHub.
- **Links úteis:** Cloudflare, GitHub, Status, tokens do GitHub.

### PURLs — links curtos

Um PURL é `lucafchala.com/<slug> → destino`. Os mesmos links funcionam em `url.lucafchala.com/<slug>`.

| Grupo | Uso |
|---|---|
| `contact` | Contato (Instagram, Signal…) |
| `events` | Galerias de eventos (fotos.lucafchala.com) |
| `video` | Projetos de vídeo |
| `tools` | Utilidades |

- **Adicionar e editar** com validação na hora:
  - slug em minúsculas, números, `.`, `_`, `-` (acentos permitidos);
  - sem duplicados;
  - sem nomes reservados que colidiriam com arquivos dos sites (`robots.txt`, `status`, `fonts`, `404`…);
  - destino `http(s)` completo;
  - o erro aparece ao lado do campo.
- **302 ou 301 por link.** O padrão é **302**: navegadores guardam o 301 para sempre, então mudar o destino não chegaria a quem já clicou. Marque 301 só em links que nunca vão mudar.
- **Reordenar dentro do grupo** (↑/↓ no modo de edição).
- **Remover com desfazer:** a remoção mostra um aviso com "desfazer"; nada vai ao GitHub até salvar.
- **QR code** de cada link (`https://lucafchala.com/<slug>`), com download em SVG ou PNG — gerado no próprio navegador.
- **Copiar** o link curto e **abrir** o destino.
- **Exportar / importar** a lista em JSON; a importação valida cada entrada e oferece *mesclar* ou *substituir tudo*.
- **Sincronizar:** reescreve os arquivos gerados (`_redirects`, 404, índice do url) a partir dos dados salvos, útil depois de atualizar o próprio painel.

### Pastes

- Criar, editar e remover pastes. Campos: slug, subtítulo, descrição PT/EN, idioma do conteúdo, tipo (texto ou chave PGP), fingerprint (PGP) e conteúdo.
- **Prévia** do conteúdo antes de salvar (com os links já clicáveis).
- Remover um paste também apaga a página `{slug}/index.html` — mas só se for uma página gerada pelo painel. Páginas feitas à mão nunca são sobrescritas nem apagadas.
- **Regenerar páginas:** reescreve todas as páginas geradas com o modelo atual.

### Interface

- PT/EN e tema claro/escuro, **compartilhados com todos os sites `*.lucafchala.com`** (cookies `lf_lang` / `lf_theme`).
- Busca única que filtra PURLs (slug, destino, grupo) e pastes (slug, descrição, conteúdo).
- **Atalhos:** `/` busca · `n` novo link · `⌘S`/`Ctrl+S` salva · `Esc` cancela a edição ou limpa a busca.
- **Diálogos nativos (`<dialog>`):** Esc fecha e o foco volta ao botão que abriu. Clicar fora do editor de paste **não** fecha (antes, arrastar a seleção para fora apagava o texto).
- **Avisos** numa região `aria-live` em vez de `alert()`.
- **Aviso antes de sair** da página com alterações não salvas.
- **Funciona no celular** (360 px sem rolagem lateral), com foco visível e respeito a `prefers-reduced-motion`.
- **PWA instalável.** O service worker usa rede primeiro para a página (sempre roda a versão mais nova do painel) e nunca guarda respostas de redirecionamento — o bug do `net::ERR_FAILED` depois de a sessão expirar.

---

## Como o salvamento funciona

### PURLs

1. **Carregar:** com o proxy configurado, `data.json` é lido **do GitHub** (não da versão publicada, que pode estar atrasada), e o SHA do arquivo é guardado.
2. **Somente leitura se falhar:** se a leitura falhar, o painel fica somente leitura, com um aviso. Antes, salvar depois de uma falha de carga apagava todos os links.
3. **Snapshot:** ao salvar, o painel tira um *snapshot* da lista. O que você editar durante o salvamento continua marcado como não salvo.
4. **`data.json` primeiro, com o SHA da leitura:** se outra pessoa (ou outra aba) mudou o arquivo nesse meio tempo, o GitHub responde `409` e abre um **diálogo de conflito**. Ele mostra o que mudou no GitHub e oferece *recarregar* ou *sobrescrever com as minhas*. Nada mais é gravado até resolver.
5. **Arquivos gerados:** depois, em paralelo entre repositórios e em sequência dentro de cada um:

| Repositório | Arquivos (nesta ordem) |
|---|---|
| `lucafchala.com` | `_redirects`, `404.js`, `404.html` |
| `url.lucafchala.com` | `_redirects`, `data.json`, `url.js`, `index.html`, `404.js`, `404.html` |

   - **Sem commits vazios:** cada arquivo só é gravado se o conteúdo mudou.
   - **Script antes da página:** o script vai antes do HTML que o carrega, para nenhum deploy intermediário servir uma página sem o seu script.
6. **Relatório:** se algo falhar, um diálogo lista cada arquivo (atualizado / sem mudança / falhou) com um botão para tentar de novo só os que falharam.

> Commits simultâneos no mesmo branch dão `409` no GitHub, então nunca use `Promise.all` para gravar no mesmo repositório. `runWrites()` agrupa por repositório e já cuida disso.

### Pastes

O mesmo esquema: `pastes.json` primeiro (com verificação de conflito), depois as páginas `{slug}/index.html` dos pastes novos ou alterados, a remoção das páginas de pastes apagados e o `sitemap.xml` do paste.

---

## Arquivos que o painel gera

Todos começam com a marca `generated by dash.lucafchala.com (genX)`. **Edite a função no `index.html` do painel, não o arquivo no outro repositório** — o próximo salvamento sobrescreve edições à mão.

| Função | Arquivo(s) | Destino |
|---|---|---|
| `genRedirectsFile(items)` | `_redirects` | lucafchala.com, url |
| `genDataJson(items)` | `data.json` | dash, url |
| `gen404Html()` + `gen404Js()` | `404.html`, `404.js` | lucafchala.com, url |
| `genUrlIndex(items)` + `genUrlJs()` | `index.html`, `url.js` | url |
| `genPasteShell(p)` | `{slug}/index.html` | paste |
| `genPastesJson(items)`, `genPasteSitemap(items)` | `pastes.json`, `sitemap.xml` | paste |

Regras dos geradores:

- **Determinísticos:** mesmos dados, mesmos bytes. Nada de datas ou valores aleatórios, senão todo salvamento regravaria tudo.
- **Sem `<script>` inline nem `onclick=` no HTML gerado.** Os sites de destino só aceitam scripts de `'self'`, por isso o comportamento fica em `404.js`, `url.js` e, no paste, `paste.js`.
- **O índice do url traz a lista embutida no HTML:** aparece sem JavaScript e para buscadores.
- **A página de um paste é uma casca fina:** título, descrição, Open Graph e conteúdo embutidos. A renderização (links, copiar, baixar, PT/EN) fica em `/paste.js` e `/paste.css` no repositório do paste.

---

## Configuração

### Segredos do Cloudflare Pages (Settings → Environment variables)

| Nome | Obrigatório | Uso |
|---|---|---|
| `DASH_PASSWORD` | sim | Senha do login; também assina o cookie de sessão |
| `TURNSTILE_SECRET_KEY` | sim | Chave secreta do Cloudflare Turnstile (a chave do site está em `_middleware.js`) |
| `GH_PAT` | recomendado | Token *fine-grained* do GitHub com **Contents: read + write** só em `lucafchala.com`, `dash.lucafchala.com`, `paste.lucafchala.com` e `url.lucafchala.com` |
| `DASH_KV` | opcional | Binding de KV para o limite de tentativas de login valer entre instâncias (sem ele, o limite é em memória e zera a cada cold start) |
| `GH_REPOS` | opcional | Lista (separada por vírgulas) que substitui os 4 repositórios permitidos no proxy |

Se faltar `DASH_PASSWORD` ou `TURNSTILE_SECRET_KEY`, o login **falha fechado** — nunca libera o acesso.

### No navegador (`localStorage`)

| Chave | Uso |
|---|---|
| `gh_repo_home`, `gh_repo_dash`, `gh_repo_paste`, `gh_repo_url` | Repositórios de destino (Configurações, botão **GH**). Deixe o do url vazio para não sincronizá-lo |
| `gh_pat` | **Modo antigo, opcional:** só é usado se `GH_PAT` não estiver configurado no servidor. Nesse caso o campo de token aparece nas configurações; com o proxy ligado ele some e há um botão para remover um token antigo |
| `theme`, `lang` | Espelho local de `lf_theme` / `lf_lang` |

---

## Segurança

- **CSP sem `'unsafe-inline'` para scripts:** os dois scripts inline do `index.html` são liberados por hash `sha256` no `_headers`. **Ao editar qualquer script inline, regenere os hashes** — o CI falha se eles não baterem:

  ```bash
  python3 - <<'PY'
  import re, hashlib, base64
  h = lambda x: "'sha256-" + base64.b64encode(hashlib.sha256(x.encode()).digest()).decode() + "'"
  html = open('index.html', encoding='utf-8').read()
  hs = [h(m.group(2)) for m in re.finditer(r'<script\b([^>]*)>(.*?)</script>', html, re.S) if 'src=' not in m.group(1) and m.group(2).strip()]
  hd = open('_headers', encoding='utf-8').read()
  open('_headers', 'w', encoding='utf-8').write(re.sub(r"script-src 'self'( 'sha256-[^']+')*", "script-src 'self' " + ' '.join(hs), hd, count=1))
  print(hs)
  PY
  ```

- **Eventos:** sem `onclick=` — tudo passa por `data-action` e um único `addEventListener`.
- **Texto do script inline:** nunca escreva `</script>` nem `<!--` dentro dele. Nos templates, use `<\/script>` e `<\!--`.
- **Login:**
  - a página de login tem cabeçalhos próprios (CSP, `X-Frame-Options`, `frame-ancestors`), porque o `_headers` não vale para respostas de Functions;
  - a senha é comparada em tempo constante;
  - o `next=` só aceita caminhos da mesma origem.
- **Proxy:** limitado à Contents API dos repositórios permitidos (os testes cobrem o desvio com `%2e%2e`).

---

## Desenvolvimento

Não há build. Para testar localmente, sirva a pasta com qualquer servidor estático (as Functions não rodam assim; o painel entra em modo somente leitura) ou use `wrangler pages dev .`.

```bash
node --test tests/*.test.mjs   # middleware + proxy
```

O CI (`.github/workflows/checks.yml`) verifica:

- JSON válido;
- escapadores de HTML fracos;
- `_headers` presente;
- sintaxe das Functions;
- **sintaxe do script inline** (extraído do `index.html`) e ausência de `</script`/`<!--` dentro dele;
- **hashes da CSP** batendo com os scripts inline;
- nenhum `on*=` no HTML;
- **validade do `data.json`:** slugs únicos, não reservados e válidos; destinos `http(s)`; grupos e `status` conhecidos;
- os testes de `tests/`.

Depois de mudar o painel, abra-o, confira e use **sincronizar** (PURLs) e **regenerar páginas** (pastes) para publicar a saída nova dos geradores.

---

## Estrutura do repositório

```
dash.lucafchala.com/
├── index.html              # toda a aplicação (HTML + CSS + JS inline, scripts liberados por hash)
├── data.json               # fonte de verdade dos PURLs
├── functions/
│   ├── _middleware.js      # login, sessão, logout, 401 para /api/*
│   └── api/
│       ├── github.js       # proxy da Contents API (GH_PAT no servidor)
│       └── healthz.js      # sonda de configuração
├── tests/functions.test.mjs
├── sw.js                   # service worker (rede primeiro para a página)
├── manifest.json, icon.svg, robots.txt, _headers
├── fonts/                  # fontes auto-hospedadas (OFL)
├── README.md               # este arquivo
└── CLAUDE.md               # notas para assistentes de IA
```

---

## Guia de design

O sistema visual canônico está no [README do hub](https://github.com/lucafchala/lucafchala.com#design-system). Resumo do que o painel usa:

- **Fontes:** Cormorant Garamond (títulos, nomes de serviços) + JetBrains Mono (todo o resto), auto-hospedadas em `/fonts` com `font-src 'self'`.
- **Tokens:** `--bg #0d0c0a / #f4efe6`, `--ctrl-bg`, `--border`, `--border-strong`, `--text`, `--muted #948a7c / #6b6152` (contraste AA), `--accent #c08030 / #8a5712`, `--accent-dim` (só bordas), `--up` / `--down` / `--degraded` para os pontos de status.
- **Layout:** `max-width: 720px`, `padding: 48px 32px 72px` (celular `28px 18px 52px`), cantos de 2–4 px, sem sombras (exceto nos avisos), textura de grão via `body::after`.
- **Animação:** `rise` escalonada, desligada com `prefers-reduced-motion`.
- **Componentes:**
  - `.controls` / `.ctrl-btn` (com `aria-pressed`);
  - `.rule`, `.hub` / `.hub-primary`;
  - `.item` (linha de PURL/paste em grid, que quebra em 2–3 linhas no celular);
  - `.act-btn` (`.ok` / `.del`, altura mínima de 28 px);
  - `.save-bar`, `dialog`, `.toast`, `.banner`.

### Checklist para uma página nova do ecossistema

- [ ] `<html lang="pt-BR" data-theme="dark">` e `<meta name="theme-color">`
- [ ] Tema antes da pintura: `/theme.js` síncrono no `<head>` (lê o cookie `lf_theme`) com `data-cfasync="false"`
- [ ] Fontes em `/fonts` + `@font-face`, CSP com `font-src 'self'`
- [ ] Nenhum `<script>` inline nem `on*=`; CSP `script-src 'self'`
- [ ] Barra `PT | EN · ◐` com `aria-pressed` e `aria-label`
- [ ] `:focus-visible`, `prefers-reduced-motion`, alvos de toque ≥ 24 px, link "pular para o conteúdo"
- [ ] Sem rolagem lateral em 360 px
