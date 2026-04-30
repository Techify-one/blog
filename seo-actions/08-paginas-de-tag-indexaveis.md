# Plano 08 — Páginas `/blog/tag/{slug}` indexáveis

## Status

**PENDENTE — executar por agente de IA. Tarefa de código
moderada, espelhando padrão existente.**

## Problema

O blog tem tags armazenadas como JSON array em
`articles.tags` ([CLAUDE.md](../CLAUDE.md) seção "Decisões
não-óbvias"), mas **não há rota indexável que liste artigos por
tag**. As tags aparecem só como `#tag` no fim de cada artigo.

Consequência:
- Cada tag única que poderia virar uma página de "hub" indexável
  não existe.
- Surface area do site pro Google é menor (menos URLs únicas pra
  rastrear/indexar).
- Visitante que clica numa tag não tem pra onde ir → fricção UX.
- Endpoint `/api/taxonomy` ([src/pages/api/taxonomy.ts](../src/pages/api/taxonomy.ts))
  já agrega tags — mas só serve a API, não tem renderização.

## Objetivo

Criar `/blog/tag/{slug}` espelhando o padrão de
`/blog/categoria/{slug}` que já existe.

## Investigação inicial

```bash
# Ver padrão da página de categoria (modelo a copiar)
cat /home/francisco/blog-techify/src/pages/categoria/\[slug\].astro

# Ver como tags são armazenadas/serializadas
cat /home/francisco/blog-techify/src/db/schema.ts | grep -A 5 tags

# Ver o endpoint /api/taxonomy pra entender agregação
cat /home/francisco/blog-techify/src/pages/api/taxonomy.ts
```

## Implementação

### 1. Helper: validador e slugifier de tags

Tags são free-form strings (ex.: "Cloudflare Workers",
"Drizzle ORM"). Pra rotear, precisa converter pra slug:

```ts
// src/lib/tag-slug.ts (criar)
export function tagToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function slugMatchesTag(slug: string, tag: string): boolean {
  return tagToSlug(tag) === slug;
}
```

### 2. Rota `src/pages/tag/[slug].astro`

Espelhar `categoria/[slug].astro`. Ajustes:

- Filtrar artigos cuja `tags` (JSON array) contenha alguma tag
  cujo slugify bate com o `[slug]` da URL.
- D1/SQLite não tem operador JSON nativo no Drizzle, então o
  filtro precisa ser feito **em código após puxar todos os
  artigos publicados** (ou usar `LIKE '%"tag-slug"%'` com
  cuidado — frágil porque o JSON contém o nome humano, não o
  slug).
- Decisão: query "all published" → filtrar em memória.
  Performance OK porque blog tem dezenas, não milhares de
  artigos. Reavaliar quando passar de 500 artigos.

```astro
---
import { db } from '~/db/client';
import { articles, eq } from 'drizzle-orm';
import { tagToSlug } from '~/lib/tag-slug';
import Base from '~/layouts/Base.astro';
import ArticleCard from '~/components/ArticleCard.astro';
import { url } from '~/lib/paths';

const { slug } = Astro.params;
const env = Astro.locals.runtime.env;
const database = createDb(env.DB);

const allPublished = await database.select().from(articles)
  .where(eq(articles.status, 'published')).all();

const matchingArticles = allPublished.filter(a => {
  const tags = JSON.parse(a.tags || '[]') as string[];
  return tags.some(t => tagToSlug(t) === slug);
});

if (matchingArticles.length === 0) {
  return new Response(null, { status: 404 });
}

// Recuperar nome humano da tag (primeiro match dos artigos)
const tagName = (() => {
  for (const a of matchingArticles) {
    const tags = JSON.parse(a.tags || '[]') as string[];
    const match = tags.find(t => tagToSlug(t) === slug);
    if (match) return match;
  }
  return slug;
})();

const title = `Artigos sobre ${tagName} — Blog Techify`;
const description = `${matchingArticles.length} artigos marcados com ${tagName}.`;
---

<Base title={title} description={description}>
  <h1>Artigos com tag: {tagName}</h1>
  <ul>
    {matchingArticles.map(a => <ArticleCard article={a} />)}
  </ul>
</Base>
```

(Adaptar à API real de `createDb` e ao `ArticleCard` existente.)

### 3. Atualizar template do artigo pra linkar tags

[src/pages/[slug].astro](../src/pages/%5Bslug%5D.astro) hoje
provavelmente renderiza tags como `#cloudflare`. Trocar pra
`<a href="/blog/tag/cloudflare">#cloudflare</a>`:

```astro
{tags.map(t => (
  <a href={url(`/tag/${tagToSlug(t)}`)} class="tag">#{t}</a>
))}
```

Use o helper `url()` pra preservar `/blog` base.

### 4. Adicionar páginas de tag ao sitemap

Editar `src/pages/sitemap.xml.ts` pra incluir uma entrada por
tag única:

```ts
const allTags = new Set<string>();
const articlesPub = await db.select({ tags: articles.tags })
  .from(articles).where(eq(articles.status, 'published')).all();
for (const a of articlesPub) {
  const arr = JSON.parse(a.tags || '[]') as string[];
  arr.forEach(t => allTags.add(tagToSlug(t)));
}

for (const tagSlug of allTags) {
  xml += `  <url>
    <loc>${siteUrl}/tag/${tagSlug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
}
```

`<lastmod>` deve ser o `max(updated_at)` dos artigos com aquela
tag (vide [06-lastmod-no-sitemap.md](06-lastmod-no-sitemap.md)).

### 5. Lista de tags na home (opcional, mas ajuda discoverability)

No fim de `/blog`, adicionar uma seção "Explore por tag":

```astro
<section>
  <h2>Explore por tag</h2>
  <ul>
    {topTags.map(t => (
      <li><a href={url(`/tag/${tagToSlug(t)}`)}>{t}</a></li>
    ))}
  </ul>
</section>
```

`topTags` = top 20-30 tags por contagem de artigos.

### 6. Reservar slug "tag" pra evitar colisão

Editar [src/lib/slug.ts](../src/lib/slug.ts) — função
`isReservedSlug()` (mencionada no [CLAUDE.md](../CLAUDE.md))
pra incluir `tag` na lista de slugs reservados.

```ts
const RESERVED = [
  'categoria', 'api', 'sitemap.xml', 'tag', // adicionar
  // ... outros existentes
];
```

Senão, alguém poderia tentar criar artigo com slug
`tag-de-algo` e quebrar a rota.

## Verificação

### 1. Renderização

```bash
# Após deploy:
curl -s "https://techify.one/blog/tag/cloudflare" | grep "<h1>"
```

Esperado: `<h1>Artigos com tag: Cloudflare</h1>` ou similar.

### 2. Sitemap

```bash
curl -s "https://techify.one/blog/sitemap.xml" | grep "/tag/"
```

Esperado: ≥ 20 URLs `/tag/{slug}` listadas.

### 3. GSC

GSC → Sitemaps → "Sucesso" + contagem subiu.

GSC → URL Inspection → cole alguma `/blog/tag/{slug}` →
"URL pode ser indexada".

Em 2-4 semanas, "Indexadas" deve crescer com essas novas
páginas.

## Definição de done

- [ ] `src/lib/tag-slug.ts` criado com `tagToSlug()`.
- [ ] `src/pages/tag/[slug].astro` criado, retorna 404 se nenhum
  artigo bate.
- [ ] Tags em `src/pages/[slug].astro` são links pra
  `/blog/tag/{slug}`.
- [ ] Sitemap inclui todas as tags únicas.
- [ ] Home lista top tags com links.
- [ ] `tag` adicionada a `isReservedSlug()`.
- [ ] `npm run typecheck` passa.
- [ ] Manual smoke test em prod confirma renderização.

## Decisões de design abertas

- **Singular vs plural na URL?** Recomendado **singular** (`/tag/cloudflare`)
  porque é mais lido em LLMs e Google.
- **Capitalização?** O slug é sempre lowercase
  (`tag/cloudflare-workers`); o nome humano renderizado preserva
  capitalização original (`Cloudflare Workers`).
- **Tag com 1 artigo só** vale a pena ter página? Sim — mais
  surface area pra Google. Mas adicione `noindex` se contagem ==
  1 e a tag parece "lixo" (pouca semântica). Senão deixa indexar.

## Não fazer

- Não criar página de tag se a tag aparece em 0 artigos publicados
  — gera soft 404.
- Não usar paginação JS-only nessas páginas (vide
  [07-paginacao-navegavel-na-home.md](07-paginacao-navegavel-na-home.md)).
- Não duplicar artigo na DB pra "hospedar" sob tag — a renderização
  é dinâmica.
