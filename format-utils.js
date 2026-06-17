import {
  CURRENCY_CODE,
  TIMEZONE
} from "./constants.js";

export function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: CURRENCY_CODE,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function formatNumber(value) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function formatDate(timestamp) {
  if (!timestamp?.toDate) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TIMEZONE
  }).format(timestamp.toDate());
}

export function formatDateTime(timestamp, includeSeconds = false) {
  if (!timestamp?.toDate) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    timeZone: TIMEZONE
  }).format(timestamp.toDate());
}

export function getTimestampSortValue(timestamp) {
  if (!timestamp) {
    return 0;
  }
  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }
  if (timestamp.seconds) {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000);
  }
  const date = timestamp.toDate?.();
  return date ? date.getTime() : 0;
}

export function toDateInput(dateLike) {
  const date = dateLike?.toDate ? dateLike.toDate() : dateLike instanceof Date ? dateLike : new Date(dateLike);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function toMonthInput(dateLike) {
  return toDateInput(dateLike).slice(0, 7);
}

export function formatMonthKey(monthKey = "") {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: TIMEZONE
  }).format(new Date(`${monthKey}-01T12:00:00`));
}

export function dateFromDateInput(value) {
  return new Date(`${value}T12:00:00`);
}

export function cloneDate(dateLike) {
  const source = dateLike?.toDate ? dateLike.toDate() : dateLike instanceof Date ? dateLike : new Date(dateLike);
  return new Date(source.getTime());
}

export function startOfDay(dateLike) {
  const date = cloneDate(dateLike);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function endOfDay(dateLike) {
  const date = cloneDate(dateLike);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addScheduleDate(dateLike, scheduleType = "monthly", amount = 1, endPreviousDay = false) {
  const date = startOfDay(dateLike);
  let nextDate;

  switch (scheduleType) {
    case "weekly":
      nextDate = cloneDate(date);
      nextDate.setDate(nextDate.getDate() + (7 * amount));
      break;
    case "biweekly":
      nextDate = cloneDate(date);
      nextDate.setDate(nextDate.getDate() + (14 * amount));
      break;
    case "quarterly":
      nextDate = addMonthsClamped(date, 3 * amount);
      break;
    case "yearly":
      nextDate = addMonthsClamped(date, 12 * amount);
      break;
    case "monthly":
    default:
      nextDate = addMonthsClamped(date, amount);
      break;
  }

  if (endPreviousDay) {
    nextDate.setDate(nextDate.getDate() - 1);
  }
  return nextDate;
}

export function addMonthsClamped(dateLike, months) {
  const date = startOfDay(dateLike);
  const target = cloneDate(date);
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

export function isCurrentMonth(timestamp, now = new Date()) {
  if (!timestamp?.toDate) {
    return false;
  }
  const date = timestamp.toDate();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export function isExpired(timestamp, nowMillis = Date.now()) {
  return Boolean(timestamp?.toDate && timestamp.toDate().getTime() < nowMillis);
}
