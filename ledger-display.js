export function buildHistoryDisplay(entry, { formatDate, formatDateTime }) {
  const title = entry.kind === "transfer"
    ? `${entry.fromAccountName} to ${entry.toAccountName}`
    : entry.kind === "adjustment"
      ? `Balance correction | ${entry.accountName}`
      : entry.categoryName || "No category";
  const note = entry.note || "-";
  const subtitleParts = [formatDate(entry.transactionAt)];

  if (entry.kind === "transfer") {
    subtitleParts.push(`${entry.fromAccountName} to ${entry.toAccountName}`);
  } else if (entry.kind === "adjustment") {
    subtitleParts.push(entry.accountName);
  } else {
    subtitleParts.push(entry.accountName || "No account");
  }

  subtitleParts.push(`Created ${formatDateTime(entry.createdAt)}`);
  subtitleParts.push(note);

  return {
    title,
    note,
    subtitle: subtitleParts.join(" | "),
    subtitleParts
  };
}
