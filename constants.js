export const CURRENCY_CODE = "IDR";
export const TIMEZONE = "Asia/Jakarta";
export const DEFAULT_SCOPE = "personal";
export const MAX_HOUSEHOLDS = 3;
export const INVITE_EXPIRY_HOURS = 24;
export const DEFAULT_CATEGORY_SEED_VERSION = 1;

export const SYSTEM_CATEGORY_SEEDS = [
  {
    id: "system-admin-fee",
    systemKey: "admin_fee",
    direction: "outcome",
    name: "Admin Fee",
    description: "Admin and transfer fees."
  },
  {
    id: "system-investment-deposit",
    systemKey: "investment_deposit",
    direction: "outcome",
    name: "Investment - Deposit",
    description: "Money moved into an investment account."
  },
  {
    id: "system-investment-withdrawal",
    systemKey: "investment_withdrawal",
    direction: "income",
    name: "Investment - Withdrawal",
    description: "Money withdrawn from an investment account."
  }
];

export const GREETINGS = [
  "Keep it steady."
];

export const ENTRY_KINDS = [
  { value: "outcome", label: "Outcome" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" }
];

export const CATEGORY_DIRECTIONS = [
  { value: "outcome", label: "Outcome" },
  { value: "income", label: "Income" },
  { value: "both", label: "Both" }
];

export const APP_VIEWS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "management", label: "Accounts & Categories" },
  { value: "settings", label: "Settings" }
];
