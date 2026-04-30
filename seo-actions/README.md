# SEO Actions — Plano de correção GSC

Pasta com planos numerados para cada problema reportado no Google
Search Console em 2026-04-28.

## Estado inicial (2026-04-28)

- 6 páginas indexadas, 64 não indexadas.
- Causas principais: 36 "detectada não indexada", 19 "rastreada não
  indexada", 4 erros técnicos (3×404 + 1×soft404), 1 duplicata, 1
  canonical alternativa.

## Planos

| # | Plano | Status | Tipo | Onde |
|---|---|---|---|---|
| 01 | [Duplicado `harness-engineering`](01-duplicado-harness-engineering.md) | ✅ EXECUTADO | Fix pontual | Esse repo (API) |
| 02 | [404s em `/artigos/*`](02-404s-artigos-root.md) | ⏳ Manual | Manual + outro repo | **FORA** desse repo |
| 03 | [Soft 404 em `/simple-api`](03-soft-404-simple-api.md) | ⏳ Manual | Manual + outro repo | **FORA** desse repo |
| 04 | [Internal linking entre artigos](04-internal-linking-entre-artigos.md) | ⏳ PARA AGENTE IA | Editorial em massa | API de artigos |
| 05 | [Auditar conteúdo raso](05-auditar-conteudo-raso.md) | ⏳ PARA AGENTE IA | Editorial profundo | API de artigos |
| 06 | [`<lastmod>` no sitemap](06-lastmod-no-sitemap.md) | ⏳ PARA AGENTE IA | Código pequeno | `src/pages/sitemap.xml.ts` |
| 07 | [Paginação navegável em `/blog`](07-paginacao-navegavel-na-home.md) | ⏳ PARA AGENTE IA | Código moderado | `src/pages/index.astro` |
| 08 | [Páginas de tag indexáveis](08-paginas-de-tag-indexaveis.md) | ⏳ PARA AGENTE IA | Código moderado | `src/pages/tag/[slug].astro` (novo) |

## Sequência sugerida de execução

### Fase A — Já feito
- ✅ Plano 01 (executado em 2026-04-28).

### Fase B — Manual pelo usuário (5-30 min cada)
- Plano 02 (GSC URL Removal pelo dashboard do Search Console).
- Plano 03 (diagnóstico por curl + decisão editorial).

### Fase C — Agente IA, código (segura para automação)
- **Plano 06 primeiro** (`<lastmod>` correto) — é a base pra
  Plano 07 e 08 funcionarem direito.
- Plano 07 (paginação) — segundo, porque sitemap precisa do 06.
- Plano 08 (páginas de tag) — terceiro, porque também emite sitemap.

### Fase D — Agente IA, conteúdo (precisa supervisão)
- Plano 05 (auditoria de wordCount) — escolher quais expandir vs
  despublicar com base no resultado.
- Plano 04 (internal linking) — depois que o catálogo final
  estiver definido, evita criar link pra artigo que será
  despublicado.

## O que NÃO está nessa pasta (e por quê)

Os 36 "detectada não indexada" são, em parte, **decisão editorial
do Google** sobre autoridade do domínio. Resolver requer:

- Backlinks (em andamento — README do GitHub atualizado em 28/04
  com link pro blog).
- Tempo (domínio `.one` novo precisa amadurecer 3-12 meses).
- Frequência consistente de publicação.

Esses não cabem em "ações de fix" — são processo contínuo, e
parte do ganho vem dos planos 04, 05, 07, 08 (mais surface area +
mais profundidade percebida).
