# dash.lucafchala.com

Painel de controle pessoal — gerencia redirecionamentos (PURLs), pastes e links rápidos para todos os serviços do ecossistema lucafchala.com.

Disponível em **[dash.lucafchala.com](https://dash.lucafchala.com)**.

---

## Visão geral

O painel é uma **single-page app** em HTML/CSS/JS puro, sem frameworks ou build step. Toda a persistência é feita via **GitHub API** usando um Personal Access Token armazenado localmente no navegador. Não há backend — o GitHub serve como banco de dados.

---

## Funcionalidades

### Serviços (Hubs)

Acesso rápido aos serviços do ecossistema. Cada hub exibe o nome, descrição e um indicador de status (ativo/inativo):

| Serviço | URL |
|---|---|
| Fotos | fotos.lucafchala.com/dashboard |
| lucafchala.com | lucafchala.com |
| Now | now.lucafchala.com |
| Paste | paste.lucafchala.com |
| Weblog | weblog.lucafchala.com |
| Rádio | radio.lucafchala.com |
| Admin | omg.lucafchala.com |

### Repositórios

Grid com links diretos para os repositórios GitHub do ecossistema, com indicadores de atividade recente.

### Links Úteis

Atalhos rápidos para Cloudflare (Pages, DNS), GitHub e outras ferramentas de administração.

---

## PURLs — Redirecionamentos Permanentes

Os PURLs são redirecionamentos curtos do tipo `lucafchala.com/slug → destino`. São gerenciados pelo painel e sincronizados automaticamente com o GitHub ao salvar.

### Grupos

Os redirecionamentos são organizados em quatro grupos, colapsáveis:

| Grupo | Descrição |
|---|---|
| `contact` | Links de contato (Instagram, Signal, etc.) |
| `events` | Pastas de fotos e documentos de eventos |
| `video` | Projetos de vídeo (YouTube, downloads, pages) |
| `tools` | Utilidades e ferramentas diversas |

### Como funciona

1. Os redirecionamentos são armazenados em `data.json` neste repositório.
2. Ao salvar, o painel gera um arquivo `_redirects` (formato Cloudflare Pages) e o envia para os repositórios configurados via GitHub API.
3. O Cloudflare Pages detecta o push e processa os redirecionamentos automaticamente.

### O que é sincronizado ao salvar PURLs

| Arquivo | `lucafchala.com` | `dash.lucafchala.com` | `url.lucafchala.com` |
|---|---|---|---|
| `_redirects` | ✅ | — | ✅ |
| `data.json` | — | ✅ | ✅ |
| `index.html` | — | — | ✅ |
| `404.html` | ✅ | — | ✅ |

> As gravações em cada repositório são feitas sequencialmente para evitar conflitos de SHA na GitHub API (múltiplos commits simultâneos no mesmo branch causam erro 409).

---

## url.lucafchala.com

O site **[url.lucafchala.com](https://url.lucafchala.com)** é a página pública dos PURLs. Ele exibe todos os redirecionamentos agrupados por classe, no mesmo estilo visual do painel — porém somente leitura (sem edição).

- Os grupos `events` e `video` ficam colapsados por padrão.
- Botões **copiar** (copia `url.lucafchala.com/slug`) e **abrir** (abre o destino) em cada linha.
- O `index.html` e `data.json` são gerados e enviados pelo painel a cada salvamento de PURLs.
- Se `data.json` ainda não existir no repositório (ex.: primeira execução), a página busca automaticamente o fallback em `dash.lucafchala.com/data.json`.
- Grade de atalhos (**PÁGINAS**) no topo com links para os principais serviços do ecossistema.

### Página 404

Qualquer slug inválido em `lucafchala.com` ou `url.lucafchala.com` cai no `404.html` customizado:

- Exibe um **toast de aviso** com o slug tentado — aparece apenas quando o acesso vem de um slug inválido real (não ao navegar para `/404` diretamente).
- Botão **"Ver todos os links"** aponta para `/` em `url.lucafchala.com` ou para `https://url.lucafchala.com` em `lucafchala.com`, conforme o hostname detectado em runtime.
- Botão **"← Voltar"** usa `history.back()`.
- Rodapé com link de contato para `suporte@lucafchala.com`.

---

## Pastes

Os **pastes** são snippets de texto ou páginas de conteúdo publicados em **[paste.lucafchala.com](https://paste.lucafchala.com)**. O painel permite criar, editar e excluir pastes diretamente.

### Como funciona

1. Os metadados de todos os pastes (slug, título, conteúdo, tipo, idioma) ficam em `pastes.json` no repositório `paste.lucafchala.com`.
2. Ao salvar, o painel envia o `pastes.json` atualizado via GitHub API.
3. Para pastes novos, o painel cria automaticamente um arquivo `{slug}/index.html` no repositório, usando um template padrão que lê o `pastes.json` em runtime para renderizar o conteúdo.

### Tipos de paste

| Tipo | Comportamento |
|---|---|
| Texto | Renderiza conteúdo pré-formatado com links clicáveis |
| PGP | Exibe fingerprint, UID e bloco de chave copiável |

---

## Configuração

O painel armazena tudo no `localStorage` do navegador. Para autenticar e habilitar edição:

1. Clique no botão **GH** no canto superior direito.
2. Insira um **Personal Access Token** do GitHub com permissão `repo` (read + write).
3. Confirme os repositórios alvo (os padrões já estão preenchidos).

### Repositórios configuráveis

| Campo | Padrão |
|---|---|
| Repo principal | `lucafchala/lucafchala.com` |
| Repo do painel | `lucafchala/dash.lucafchala.com` |
| Repo de pastes | `lucafchala/paste.lucafchala.com` |
| Repo de URLs (opcional) | `lucafchala/url.lucafchala.com` |

O repo de URLs é opcional — se configurado, `_redirects`, `data.json`, `index.html` e `404.html` são sincronizados automaticamente.

---

## Interface

- **Tema**: dark (padrão) / light, persistido em `localStorage`.
- **Idioma**: Português BR / English, alternável pelo botão no topo.
- **PWA**: instalável como app (manifest + service worker com cache stale-while-revalidate).
- **Busca**: campo de busca filtra PURLs por slug ou destino em tempo real; todos os grupos são expandidos automaticamente durante a busca.
- **Save bar**: aparece quando há alterações não salvas nos PURLs ou pastes, com botões para salvar ou descartar.

---

## Estrutura do repositório

```
dash.lucafchala.com/
├── index.html      # toda a aplicação (HTML + CSS + JS inline)
├── data.json       # fonte de verdade dos redirecionamentos
├── manifest.json   # PWA manifest
├── sw.js           # service worker (cache offline)
└── icon.svg        # ícone do app
```

---

## Guia de Design

Este documento descreve o sistema visual usado pelo painel e por todas as páginas do ecossistema (url, 404, pastes, etc.). Novas páginas devem seguir estes padrões para manter consistência.

### Tokens de cor

Definidos como CSS custom properties, com dois temas:

| Token | Dark | Light | Uso |
|---|---|---|---|
| `--bg` | `#0d0c0a` | `#f4efe6` | Fundo da página |
| `--border` | `#252220` | `#d8d1c4` | Bordas, linhas divisórias |
| `--text` | `#e6e1d6` | `#1c1a17` | Texto principal |
| `--muted` | `#6a6358` | `#9a8f80` | Texto secundário, labels, ícones |
| `--accent` | `#c08030` | `#a06820` | Destaque — slugs, links ativos, hover |
| `--accent-dim` | `#6a4818` | `#c89050` | Destaque suave — bordas de foco, setas |
| `--ctrl-bg` | `#161412` | `#ede8df` | Fundo de cards, inputs, modais |

O tema padrão é `dark`. A alternância persiste em `localStorage` e é aplicada via `data-theme` no `<html>`.

### Tipografia

| Família | Pesos usados | Aplicação |
|---|---|---|
| **Cormorant Garamond** (serif) | 300, 400, 600 | Títulos (`h1.name`), nomes de hubs |
| **JetBrains Mono** (monospace) | 300, 400, 500 | Todo o restante — corpo, labels, botões |

Ambas as fontes são carregadas via Google Fonts com `<link rel="preload">`.

**Tamanhos de texto comuns:**

| Elemento | Tamanho | Notas |
|---|---|---|
| `h1.name` | `clamp(48px, 10vw, 72px)` | `font-weight: 300`, `line-height: 0.92` |
| `.hub-name` | `16px` | Cormorant Garamond, `font-weight: 600` |
| Corpo | `14px` | Base do `html` |
| `.redirect-slug` | `12px` | Cor `--accent` |
| `.redirect-dest` | `11px` | Cor `--muted`, truncado com ellipsis |
| Labels / `.micro` | `10px` | `letter-spacing: 0.14em`, uppercase |
| Botões de ação | `9px` | `letter-spacing: 0.07em`, uppercase |
| `.group-header` | `9px` | `letter-spacing: 0.12em`, uppercase |

### Layout

- Largura máxima: **680px**, centralizada, com `padding: 48px 32px 72px`.
- `border-radius` padrão: **3px** em cards, inputs, botões. Modais usam **4px**.
- Sem sombras — profundidade é indicada apenas por bordas e fundo levemente diferente (`--ctrl-bg`).
- Textura de ruído sutil via `body::after` com SVG de `feTurbulence` (opacidade ~0.28).

### Estrutura de página

```
<html data-theme="dark">
  <head>
    <!-- Fontes: Cormorant Garamond + JetBrains Mono -->
    <!-- theme-color: #0d0c0a -->
    <!-- manifest.json (se PWA) -->
  </head>
  <body>
    <!-- 1. Controls bar (canto superior direito) -->
    <div class="controls">...</div>

    <!-- 2. Header -->
    <header>
      <h1 class="name">Título <em>em itálico accent</em></h1>
      <p class="micro">subtítulo em caixa alta</p>
    </header>

    <!-- 3. Sections separadas por .rule -->
    <div class="rule">NOME DA SEÇÃO</div>
    <div class="section-content">...</div>
  </body>
</html>
```

### Componentes

#### `.rule` — Divisor de seção
Linha horizontal com texto centralizado em `--muted`, `font-size: 10px`, `letter-spacing: 0.1em`. Gerada com `::before` e `::after` em flex.

#### `.hub` — Card de serviço
Card clicável (`<a>`) com borda `--border`, fundo `--ctrl-bg`, `border-radius: 3px`. No hover: `border-color: --accent-dim`, `background: --border`, `translateY(-1px)`. Variante `.hub-primary` ocupa toda a largura com `border-left: 3px solid --accent`.

#### `.act-btn` — Botão de ação inline
Botão pequeno monospace, borda `--border`, texto `--muted`. No hover: texto `--text`, borda `--accent-dim`. Variante `.ok`: texto e borda `--accent`. Variante `.del`: tons avermelhados.

#### `.ctrl-btn` — Botão de controle (barra superior)
Sem borda própria, dentro de `.controls-inner`. Texto `--muted`, hover vira `--accent`.

#### `.modal-overlay` — Modal
Overlay com `rgba(0,0,0,0.72)` e `backdrop-filter: blur(3px)`. Modal interno com fundo `--ctrl-bg`, borda `--border`, `max-width: 520px`.

#### `.save-bar` — Barra de salvamento
`position: sticky; bottom: 20px`. Aparece com `opacity: 1` e `translateY(0)` quando tem a classe `.visible`.

#### Inputs e selects
Fundo `--ctrl-bg`, borda `--accent-dim`, cor `--text`, fonte JetBrains Mono `11px`. No foco: borda vira `--accent`.

### Animações

Seções entram com a animação `rise`:

```css
@keyframes rise {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Aplicada com `animation: rise 0.9s cubic-bezier(0.16,1,0.3,1) Xs both`, onde `X` é um delay escalonado (0s, 0.12s, 0.20s, 0.28s, 0.36s, 0.44s…) para criar efeito cascata.

### Checklist para nova página

- [ ] `<html lang="pt-BR" data-theme="dark">`
- [ ] Script inline antes do `<style>` para ler `localStorage('theme')` e aplicar `data-theme`
- [ ] `theme-color` meta tag: `#0d0c0a`
- [ ] Fontes: Cormorant Garamond + JetBrains Mono via Google Fonts com `preload`
- [ ] Tokens de cor definidos em `:root` e `[data-theme="light"]`
- [ ] Ruído de fundo via `body::after` com SVG `feTurbulence`
- [ ] `max-width: 680px; margin: 0 auto; padding: 48px 32px 72px`
- [ ] Títulos com `.name` (Cormorant Garamond 300) e `<em>` em `--accent`
- [ ] Seções separadas por `.rule`
- [ ] Botões usando `.act-btn` ou `.ctrl-btn`
- [ ] Animação `rise` com delays escalonados nas seções

---

## Tecnologias

- HTML / CSS / JavaScript puro — sem frameworks, sem build step
- GitHub Contents API para leitura e escrita de arquivos
- Cloudflare Pages para deploy e processamento de `_redirects`
- Service Worker para suporte offline (stale-while-revalidate)
- Google Fonts: Cormorant Garamond + JetBrains Mono
