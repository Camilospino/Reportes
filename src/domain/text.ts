/** Normaliza texto para búsqueda: minúsculas, sin tildes, espacios simples. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchText(r: {
  street: string;
  neighborhood: string;
  city: string;
  referencePoint?: string | null;
  contractNumber?: string | null;
}): string {
  return normalizeForSearch(
    [r.contractNumber ?? "", r.street, r.neighborhood, r.city, r.referencePoint ?? ""].join(" "),
  ).slice(0, 700);
}

/** Enlace de Google Maps (funciona en celular: abre la app si está instalada). */
export function googleMapsUrl(r: { street: string; neighborhood: string; city: string }): string {
  const query = `${r.street}, ${r.neighborhood}, ${r.city}, Colombia`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
