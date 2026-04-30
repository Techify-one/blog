/**
 * Format an ISO 8601 date as a Brazilian Portuguese long date string.
 * Used in article meta blocks and listing cards.
 */
export function formatDatePtBr(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * Strip all HTML tags from a string. Used for excerpt previews and meta descriptions.
 * Not safe for arbitrary HTML — assumes the input has been sanitized by the API client.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Truncate a string to a maximum length on a word boundary, appending an ellipsis.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
