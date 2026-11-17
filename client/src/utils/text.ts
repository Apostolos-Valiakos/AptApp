// Text compared the way people type it: Greek names are often written
// without accents, in capitals, or with a final ς.
export const foldText = (s: string | null | undefined) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .trim();
