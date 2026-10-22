/** Human-readable folder segment with an ID to distinguish repeated names. */
export function resourceFolder(
  name: string,
  id: number,
  fallback: string,
): string {
  const slug =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 80)
      .replace(/^-+|-+$/g, '') || fallback;
  return `${slug}-${id}`;
}
