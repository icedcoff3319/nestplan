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

export const DEFAULT_CATEGORY_SEED = [
  {
    direction: "outcome",
    name: "Essentials - Home - Rent",
    description: "Monthly rent or other primary housing payments."
  },
  {
    direction: "outcome",
    name: "Essentials - Home - Utilities",
    description: "Electricity, water, gas, internet, and other essential home services."
  },
  {
    direction: "outcome",
    name: "Essentials - Home & Living",
    description: "Furniture, decor, small appliances, and everyday home purchases."
  },
  {
    direction: "outcome",
    name: "Essentials - Groceries",
    description: "Supermarket and grocery spending for home cooking and pantry needs."
  },
  {
    direction: "outcome",
    name: "Essentials - Food",
    description: "Meals, takeout, cafes, and eating out."
  },
  {
    direction: "outcome",
    name: "Essentials - Transportation",
    description: "Transport costs for work, errands, family visits, and everyday travel."
  },
  {
    direction: "outcome",
    name: "Wellness - Medical & Personal Care",
    description: "Medical care, prescriptions, therapy, toiletries, and personal care needs."
  },
  {
    direction: "outcome",
    name: "Family - Support",
    description: "Family support, care costs, special expenses, and family visit spending."
  },
  {
    direction: "outcome",
    name: "Lifestyle - Clothing & Accessories",
    description: "Clothing, shoes, jewelry, bags, and other personal accessories."
  },
  {
    direction: "outcome",
    name: "Lifestyle - Gadgets",
    description: "Phones, laptops, chargers, accessories, and other personal devices."
  },
  {
    direction: "outcome",
    name: "Entertainment - Leisure & Social",
    description: "Leisure activities, hobbies, travel, gatherings, and social spending."
  },
  {
    direction: "outcome",
    name: "Entertainment - Subscriptions",
    description: "Streaming, apps, memberships, gaming, and recurring entertainment services."
  },
  {
    direction: "outcome",
    name: "Giving - Charity",
    description: "Donations and charitable giving."
  },
  {
    direction: "outcome",
    name: "Other - Spending",
    description: "Anything that does not fit another spending category yet."
  },
  {
    direction: "income",
    name: "Work - Salary",
    description: "Regular salary or wage income."
  },
  {
    direction: "income",
    name: "Work - Bonus & Freelance",
    description: "Bonuses, overtime, freelance work, and other work-related extra income."
  },
  {
    direction: "income",
    name: "Support - Gifts",
    description: "Gifts or support received in money or value."
  },
  {
    direction: "income",
    name: "Shared - Repayments & Reimbursements",
    description: "Repayments from others and shared-cost reimbursements."
  },
  {
    direction: "income",
    name: "Other - Income",
    description: "Anything that does not fit another income category yet."
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
