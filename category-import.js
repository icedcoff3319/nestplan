const CATEGORY_IMPORT_DIRECTIONS = ["income", "outcome", "both"];

function cleanImportText(value = "") {
  return String(value).trim();
}

function normalizeCategoryImportName(name = "") {
  return cleanImportText(name).toLowerCase().replace(/\s+/g, " ");
}

function normalizeCsvHeader(value = "") {
  return normalizeCategoryImportName(value).replace(/[^a-z0-9]/g, "");
}

export function getCategoryImportKey(category = {}) {
  return `${normalizeCategoryImportName(category.name)}::${cleanImportText(category.direction)}`;
}

export function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === "\"") {
      if (quoted && nextChar === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseCategoryCsv(text = "") {
  const errors = [];
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => cleanImportText(line));

  if (!lines.length) {
    return { categories: [], errors: ["The CSV file is empty."] };
  }

  const delimiter = lines[0].includes("|") ? "|" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeCsvHeader);
  const directionIndex = headers.indexOf("direction");
  const nameIndex = headers.indexOf("categoryname");
  const descriptionIndex = headers.indexOf("description");
  const allowedDirections = new Set(CATEGORY_IMPORT_DIRECTIONS);

  if (directionIndex === -1 || nameIndex === -1 || descriptionIndex === -1) {
    return {
      categories: [],
      errors: ["Use this header exactly: Direction, Category Name, Description."]
    };
  }

  const categories = [];
  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const cells = parseDelimitedLine(line, delimiter);
    const direction = cleanImportText(cells[directionIndex] || "");
    const name = cleanImportText(cells[nameIndex] || "");
    const descriptionIsLast = descriptionIndex === Math.max(directionIndex, nameIndex, descriptionIndex);
    const description = cleanImportText(descriptionIsLast
      ? cells.slice(descriptionIndex).join(delimiter)
      : cells[descriptionIndex] || "");

    if (!direction && !name && !description) {
      return;
    }
    if (!allowedDirections.has(direction)) {
      errors.push(`Row ${rowNumber}: Direction must be exactly income, outcome, or both.`);
      return;
    }
    if (!name) {
      errors.push(`Row ${rowNumber}: Category Name is required.`);
      return;
    }
    if (name.toLowerCase() === "saving") {
      errors.push(`Row ${rowNumber}: Saving is managed automatically by the app.`);
      return;
    }

    categories.push({ direction, name, description });
  });

  return { categories, errors };
}
