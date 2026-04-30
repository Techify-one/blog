# Plano 07 — Paginação real navegável em `/blog`

## Status

**PENDENTE — executar por agente de IA. Tarefa de código
moderada.**

## Problema

Pra Google descobrir todos os artigos do blog, ele precisa
navegar pela home (`/blog`) e seguir links pras páginas seguintes
(`/blog?page=2`, `/blog?page=3`, etc.). Se a paginação:

- For **só JavaScript** (não tem `<a href>` real), Googlebot
  ignora.
- Não existir e a home só mostrar os 10 últimos, todos os artigos
  além do 10º ficam **órfãos** do crawler — eles só são
  descobertos via sitemap, e sitemap sozinho ranqueia mal.
- Tiver `rel="nofollow"` nos links de paginação, Google não passa
  authority.

GSC mostra 36 "Detectada não indexada" + 19 "Rastreada não
indexada" — parte desses pode ser falta de discoverability além
da home.

## Investigação inicial

Ler o componente atual de paginação e a home:

```bash
cat /home/francisco/blog-techify/src/pages/index.astro
cat /home/francisco/blog-techify/src/components/Pagination.astro 2>/dev/null \
  || echo "(arquivo Pagination.astro não existe)"
```

Verificar:

1. A home mostra quantos artigos? (Procure por `limit` na query
   ao D1.)
2. Existe paginação? Aparece links pra "página 2", "página 3"?
3. Esses links são `<a href="/blog?page=2">` reais ou
   `onClick={...}` em Preact/React?
4. Tem `rel="nofollow"` ou `rel="noindex"` em algum lugar?
5. A home aceita query string `?page=N`?

Procurar por uso de `page` ou `paginate` no projeto:

```bash
grep -rn "paginate\|currentPage\|page=" /home/francisco/blog-techify/src/pages/ /home/francisco/blog-techify/src/components/
```

## Implementação

### Caso A — Não há paginação (home mostra todos ou só os primeiros)

Adicionar paginação server-side em `src/pages/index.astro`:

1. Ler `?page=N` de `Astro.url.searchParams`.
2. Calcular `offset = (page - 1) * pageSize` (pageSize = 10 ou
   12).
3. Query D1 com `LIMIT ${pageSize} OFFSET ${offset}`.
4. Calcular `totalPages = ceil(totalCount / pageSize)`.
5. Renderizar links `<a href="/blog?page=N">N</a>` pra cada
   página até `totalPages`.

Componente sugerido (criar
`src/components/Pagination.astro` se ainda não existir):

```astro
---
import { url } from '~/lib/paths';
const { current, total } = Astro.props;
---
{total > 1 && (
  <nav aria-label="Paginação">
    {current > 1 && <a href={url(`/?page=${current - 1}`)} rel="prev">Anterior</a>}
    {Array.from({length: total}, (_, i) => i + 1).map(p => (
      p === current
        ? <span aria-current="page">{p}</span>
        : <a href={url(`/?page=${p}`)}>{p}</a>
    ))}
    {current < total && <a href={url(`/?page=${current + 1}`)} rel="next">Próxima</a>}
  </nav>
)}
```

**Importantíssimo**: usar o helper `url()` de
[src/lib/paths.ts](../src/lib/paths.ts) pra preservar o base
path `/blog` (vide [CLAUDE.md](../CLAUDE.md) seção "Decisões
não-óbvias").

### Caso B — Paginação existe mas é JS-only

Substituir o componente JS por server-rendered Astro. Astro tem
`getStaticPaths` (build-time) ou queries em SSR (runtime — nesse
projeto é o caminho).

### Caso C — Paginação existe, mas links com `nofollow`

Remover `rel="nofollow"` dos links de paginação interna.

## Adicionar `rel="prev"` / `rel="next"` (opcional, ajuda)

```html
<a href="/blog?page=1" rel="prev">Anterior</a>
<a href="/blog?page=3" rel="next">Próxima</a>
```

Google deprecou esse sinal oficialmente em 2019 mas ainda
processa. Bing e outros search bots usam.

## Adicionar páginas paginadas ao sitemap

Editar `src/pages/sitemap.xml.ts` pra emitir uma entrada por
página:

```ts
const totalArticles = await db.select({ count: count() }).from(articles)
  .where(eq(articles.status, 'published')).get();
const totalPages = Math.ceil((totalArticles?.count || 0) / PAGE_SIZE);

for (let p = 1; p <= totalPages; p++) {
  xml += `  <url>
    <loc>${siteUrl}${p === 1 ? '' : '/?page=' + p}</loc>
    <changefreq>daily</changefreq>
    <priority>${p === 1 ? '0.9' : '0.5'}</priority>
  </url>\n`;
}
```

## Verificação

### 1. Curl da home com `?page=2`

```bash
curl -s "https://techify.one/blog?page=2" | grep -E '<a[^>]*href' | head -20
```

Esperado: a página 2 retorna HTML server-rendered com cards de
artigos diferentes da página 1.

### 2. Crawl simulado de Googlebot

```bash
curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1)" \
  "https://techify.one/blog?page=2" \
  | grep -c 'class="article-card"' # ou seletor real
```

Deve retornar > 0 (cards renderizados).

### 3. Sitemap inclui páginas paginadas

```bash
curl -s https://techify.one/blog/sitemap.xml | grep "?page="
```

Deve listar `/blog?page=2`, `/blog?page=3`, etc.

### 4. GSC

GSC → Sitemaps → "Sucesso" + nova contagem de URLs.

GSC → URL Inspection → cole `https://techify.one/blog?page=2` →
deve dizer "URL pode ser indexada".

## Definição de done

- [ ] Home aceita `?page=N` server-side.
- [ ] Links de paginação são `<a href>` reais, server-rendered.
- [ ] Sem `rel="nofollow"` nos links de paginação interna.
- [ ] `<a rel="prev">`/`<a rel="next">` adicionados.
- [ ] Sitemap inclui todas as páginas paginadas.
- [ ] `npm run typecheck` passa.
- [ ] Smoke test em `https://techify.one/blog?page=2` retorna
  cards diferentes.
- [ ] Página de **categoria** (`/blog/categoria/{slug}`) também
  tem paginação se a categoria tiver > 10 artigos. Replicar
  mesmo padrão.

## Não fazer

- Não usar URLs com hash (`/blog#page2`) — Google ignora hashes.
- Não usar "Load more" infinite scroll JS-only sem fallback
  paginado. Se quiser UX de infinite scroll, mantenha as URLs
  `?page=N` server-rendered também e use JS só pra UX.
- Não setar `noindex` nas páginas paginadas (page=2, 3...).
  Algumas guidelines antigas recomendam isso; está
  desatualizado. Hoje Google prefere paginação indexável.
