// Downloads an Excel file. Each sheet is a list of rows (objects whose keys
// are the column headers). The xlsx library loads only when a file is made.
export type Sheet = {
  name: string;
  rows: Record<string, unknown>[];
  /** Column order, when it isn't the order of the first row's keys. */
  header?: string[];
  /** Widen each column to fit its longest value. */
  fitColumns?: boolean;
};

export const exportXlsx = async (fileName: string, sheets: Sheet[]) => {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows, sheet.header ? { header: sheet.header } : undefined);
    if (sheet.fitColumns) {
      const header = sheet.header || Object.keys(sheet.rows[0] || {});
      ws["!cols"] = header.map((h) => ({
        wch: Math.min(40, Math.max(h.length, ...sheet.rows.map((r) => String(r[h] ?? "").length)) + 2),
      }));
    }
    // Excel refuses sheet names longer than 31 characters.
    XLSX.utils.book_append_sheet(book, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(book, fileName);
};
