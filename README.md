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

## Tecnologias

- HTML / CSS / JavaScript puro — sem frameworks, sem build step
- GitHub Contents API para leitura e escrita de arquivos
- Cloudflare Pages para deploy e processamento de `_redirects`
- Service Worker para suporte offline (stale-while-revalidate)
- Google Fonts: Cormorant Garamond + JetBrains Mono
