/** Minúsculas, sin acentos y con espacios colapsados: para búsquedas portables. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Remera Básica" + 1001 → "remera-basica-1001". El id garantiza que sea único. */
export function slugify(value: string, id: number): string {
  const base = normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base ? `${base}-${id}` : String(id);
}
