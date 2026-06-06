import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";

const FIREBASE_CONFIGS = {
  staging: {
    apiKey: "AIzaSyBl3FCeIyYKjGTE-Ud4fw0JlXtQmSs-Ge8",
    authDomain: "nestplan-staging-863e5.firebaseapp.com",
    projectId: "nestplan-staging-863e5",
    storageBucket: "nestplan-staging-863e5.firebasestorage.app",
    messagingSenderId: "997760138193",
    appId: "1:997760138193:web:4bbb21092f9ca5f342bef0"
  },
  production: {
    apiKey: "AIzaSyACXGeCcSIbP5WM2J10d1xp-BNTmlMpbLI",
    authDomain: "nestplan-863e5.firebaseapp.com",
    projectId: "nestplan-863e5",
    storageBucket: "nestplan-863e5.firebasestorage.app",
    messagingSenderId: "48521832374",
    appId: "1:48521832374:web:7bad92ea74a5e2ea1e0317"
  }
};

const STARTER_DEFAULT_CATEGORIES = [
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

function parseArgs(argv) {
  const options = {
    project: "staging",
    apply: false
  };

  argv.forEach(arg => {
    if (arg === "--apply") {
      options.apply = true;
      return;
    }
    if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
      return;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  });

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/seed-default-categories.mjs --project=staging
  node scripts/seed-default-categories.mjs --project=staging --apply
  node scripts/seed-default-categories.mjs --project=production --apply

Environment:
  NESTPLAN_ADMIN_EMAIL       Signed-in email for dry-run; master admin email for --apply.
  NESTPLAN_ADMIN_PASSWORD    Password for that account.

Behavior:
  Dry-run is the default.
  --apply adds only missing starter categories.
  --apply requires an active master admin.
  Existing categories are matched by normalized name + direction and are never overwritten or deleted.
`);
}

function normalizeText(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function categoryKey(category) {
  return `${normalizeText(category.name)}::${normalizeText(category.direction)}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const config = FIREBASE_CONFIGS[options.project];
  if (!config) {
    throw new Error(`Unknown project "${options.project}". Use staging or production.`);
  }

  const email = process.env.NESTPLAN_ADMIN_EMAIL;
  const password = process.env.NESTPLAN_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set NESTPLAN_ADMIN_EMAIL and NESTPLAN_ADMIN_PASSWORD before running this script.");
  }

  const app = initializeApp(config, `nestplan-default-category-seed-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const masterAdminSnap = await getDoc(doc(db, "masterAdmins", credential.user.uid));
    const isMasterAdmin = masterAdminSnap.exists() && masterAdminSnap.data().status === "active";

    const existingSnap = await getDocs(collection(db, "appDefaultCategories"));
    const existingActive = existingSnap.docs
      .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
      .filter(item => item.status !== "archived" && item.status !== "deleted");
    const existingKeys = new Set(existingActive.map(categoryKey));
    const missingCategories = STARTER_DEFAULT_CATEGORIES.filter(category => !existingKeys.has(categoryKey(category)));

    console.log(JSON.stringify({
      project: options.project,
      firebaseProjectId: config.projectId,
      mode: options.apply ? "apply" : "dry-run",
      signedInAs: email.toLowerCase(),
      signedInAsMasterAdmin: isMasterAdmin,
      existingCategoryCount: existingActive.length,
      starterCategoryCount: STARTER_DEFAULT_CATEGORIES.length,
      missingCategoryCount: missingCategories.length,
      missingCategoryNames: missingCategories.map(category => `${category.direction}: ${category.name}`)
    }, null, 2));

    if (!options.apply) {
      console.log("Dry-run only. Re-run with --apply to add missing categories.");
      return;
    }

    if (!isMasterAdmin) {
      throw new Error("The signed-in account is not an active master admin for this project.");
    }

    if (!missingCategories.length) {
      console.log("No missing starter categories to add.");
      return;
    }

    const batch = writeBatch(db);
    missingCategories.forEach(category => {
      batch.set(doc(collection(db, "appDefaultCategories")), {
        name: category.name,
        direction: category.direction,
        description: category.description,
        status: "active",
        createdByUserId: credential.user.uid,
        createdByEmail: email.toLowerCase(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();

    console.log(`Added ${missingCategories.length} missing starter categories to ${config.projectId}.`);
  } finally {
    try {
      await signOut(auth);
    } catch {
      // Ignore sign-out cleanup failures.
    }
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
