/**
 * Gera sumário (TOC) a partir dos H2 presentes no HTML do artigo e injeta
 * um id estável em cada H2 que não tenha, de modo que o link do TOC funcione.
 *
 * Regras:
 *  - Só considera H2 (nível de seção principal). H3 é detalhe, não entra no TOC.
 *  - Ignora H2 dentro de <aside>, <nav> ou <details>.
 *  - Se um H2 já tem id, respeita.
 *  - Slug é derivado do texto (minúsculas, sem acento, hífenes). Colisões recebem
 *    sufixo -2, -3, etc.
 */

export interface TocItem {
  id: string;
  text: string;
}

function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'secao'
  );
}

const STRIP_HTML = /<[^>]+>/g;

export function buildTocAndDecorate(html: string): {
  html: string;
  toc: TocItem[];
} {
  const toc: TocItem[] = [];
  const used = new Set<string>();

  // Matches <h2 ...>...</h2> (case-insensitive, non-greedy). We do not try to
  // parse full HTML — just patch h2 tags.
  const decorated = html.replace(
    /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi,
    (_match, attrsRaw: string | undefined, inner: string) => {
      const attrs = attrsRaw ?? '';
      const existingIdMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
      const text = inner.replace(STRIP_HTML, '').trim();
      if (!text) return `<h2${attrs}>${inner}</h2>`;

      let id: string;
      if (existingIdMatch) {
        id = existingIdMatch[1]!;
      } else {
        const base = slugify(text);
        id = base;
        let n = 2;
        while (used.has(id)) {
          id = `${base}-${n++}`;
        }
      }
      used.add(id);
      toc.push({ id, text });

      if (existingIdMatch) {
        return `<h2${attrs}>${inner}</h2>`;
      }
      return `<h2${attrs} id="${id}">${inner}</h2>`;
    },
  );

  return { html: decorated, toc };
}
