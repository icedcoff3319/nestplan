import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  Timestamp,
  updateDoc
} from "firebase/firestore";

const PROJECT_ID = "nestplan-rules-test";
const HOUSEHOLD_ID = "household-alpha";
const OTHER_HOUSEHOLD_ID = "household-beta";
const ADMIN_ID = "admin-user";
const MEMBER_ID = "member-user";
const OUTSIDER_ID = "outsider-user";
const CREATED_AT = Timestamp.fromDate(new Date("2026-06-04T00:00:00.000Z"));
const UPDATED_AT = Timestamp.fromDate(new Date("2026-06-04T00:01:00.000Z"));
const FUTURE_AT = Timestamp.fromDate(new Date("2030-01-01T00:00:00.000Z"));

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseData();
});

after(async () => {
  await testEnv.cleanup();
});

describe("core household access boundaries", () => {
  it("blocks signed-out access to private app data", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "users", ADMIN_ID)));
    await assertFails(getDoc(doc(db, "households", HOUSEHOLD_ID)));
    await assertFails(getDocs(collection(db, "households")));
  });

  it("allows users to read only their own user profile", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");

    await assertSucceeds(getDoc(doc(adminDb, "users", ADMIN_ID)));
    await assertFails(getDoc(doc(adminDb, "users", MEMBER_ID)));
  });

  it("allows active household members to read their household and blocks outsiders", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");
    const outsiderDb = authedDb(OUTSIDER_ID, "outsider@example.com");

    await assertSucceeds(getDoc(doc(memberDb, "households", HOUSEHOLD_ID)));
    await assertFails(getDoc(doc(outsiderDb, "households", HOUSEHOLD_ID)));
  });

  it("prevents normal members from promoting or removing members", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");
    const memberRef = doc(memberDb, "households", HOUSEHOLD_ID, "members", MEMBER_ID);
    const adminRef = doc(memberDb, "households", HOUSEHOLD_ID, "members", ADMIN_ID);

    await assertFails(updateDoc(memberRef, { role: "admin", updatedAt: UPDATED_AT }));
    await assertFails(updateDoc(adminRef, { status: "removed", updatedAt: UPDATED_AT }));
  });

  it("allows household admin to remove a member without changing immutable member fields", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");
    const memberRef = doc(adminDb, "households", HOUSEHOLD_ID, "members", MEMBER_ID);

    await assertSucceeds(updateDoc(memberRef, { status: "removed", updatedAt: UPDATED_AT }));
  });
});

describe("account ownership boundaries", () => {
  it("allows creating an account only for the signed-in owner", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "accounts", "member-new-account"),
      accountData({
        name: "Member Wallet",
        ownerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID
      })
    ));

    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "accounts", "bad-owner-account"),
      accountData({
        name: "Bad Owner",
        ownerUserId: ADMIN_ID,
        createdByUserId: MEMBER_ID
      })
    ));
  });

  it("blocks a non-owner member from editing another member's account", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");
    const adminAccountRef = doc(memberDb, "households", HOUSEHOLD_ID, "accounts", "admin-account");

    await assertFails(updateDoc(adminAccountRef, {
      name: "Renamed by member",
      updatedAt: UPDATED_AT
    }));
  });

  it("allows the owner and household admin to edit account metadata", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");

    await assertSucceeds(updateDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "accounts", "member-account"),
      { name: "Member Wallet Renamed", updatedAt: UPDATED_AT }
    ));

    await assertSucceeds(updateDoc(
      doc(adminDb, "households", HOUSEHOLD_ID, "accounts", "member-account"),
      { name: "Admin Renamed Member Wallet", updatedAt: UPDATED_AT }
    ));
  });

  it("denies hard deletes of accounts", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");

    await assertFails(deleteDoc(doc(adminDb, "households", HOUSEHOLD_ID, "accounts", "member-account")));
  });
});

describe("personal versus household scoped planning data", () => {
  it("keeps personal budgets private to their owner", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(getDoc(doc(adminDb, "households", HOUSEHOLD_ID, "budgets", "admin-personal-budget")));
    await assertFails(getDoc(doc(memberDb, "households", HOUSEHOLD_ID, "budgets", "admin-personal-budget")));
  });

  it("allows all household members to read household budgets", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(getDoc(doc(adminDb, "households", HOUSEHOLD_ID, "budgets", "household-budget")));
    await assertSucceeds(getDoc(doc(memberDb, "households", HOUSEHOLD_ID, "budgets", "household-budget")));
  });

  it("blocks users from creating personal planning data for another owner", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "budgets", "forged-personal-budget"),
      budgetData({
        name: "Forged",
        scopeType: "personal",
        ownerUserId: ADMIN_ID,
        createdByUserId: MEMBER_ID
      })
    ));
  });
});

describe("invite-only registration boundaries", () => {
  it("allows only master admins to list and create registration codes", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(getDocs(collection(adminDb, "registrationCodes")));
    await assertFails(getDocs(collection(memberDb, "registrationCodes")));
    await assertFails(setDoc(
      doc(memberDb, "registrationCodes", "MEMBERCODE"),
      registrationCodeData({ code: "MEMBERCODE", email: "new@example.com", createdByUserId: MEMBER_ID })
    ));
    await assertSucceeds(setDoc(
      doc(adminDb, "registrationCodes", "ADMINCODE"),
      registrationCodeData({ code: "ADMINCODE", email: "new@example.com", createdByUserId: ADMIN_ID })
    ));
  });

  it("requires verified matching email before a registration code can be consumed", async () => {
    const matchingDb = authedDb(OUTSIDER_ID, "approved@example.com");
    const wrongEmailDb = authedDb(OUTSIDER_ID, "wrong@example.com");
    const unverifiedDb = authedDb(OUTSIDER_ID, "approved@example.com", false);

    await assertFails(updateDoc(doc(wrongEmailDb, "registrationCodes", "OPENREG"), registrationConsumeData()));
    await assertFails(updateDoc(doc(unverifiedDb, "registrationCodes", "OPENREG"), registrationConsumeData()));
    await assertSucceeds(updateDoc(doc(matchingDb, "registrationCodes", "OPENREG"), registrationConsumeData()));
  });

  it("does not allow non-master users to manage email policy and greeting libraries", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");

    await assertFails(setDoc(doc(memberDb, "emailPolicyBlockedDomains", "blocked.test"), {
      domain: "blocked.test",
      status: "active",
      createdByUserId: MEMBER_ID,
      createdByEmail: "member@example.com",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT
    }));
    await assertFails(deleteDoc(doc(memberDb, "appGreetingQuotes", "quote-one")));
    await assertSucceeds(deleteDoc(doc(adminDb, "appGreetingQuotes", "quote-one")));
  });
});

describe("household invite code boundaries", () => {
  it("allows only household admins to create and revoke invite codes", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertFails(setDoc(
      doc(memberDb, "inviteCodes", "BADINV"),
      inviteCodeData({ inviteCode: "BADINV", inviteId: "bad-invite", invitedByUserId: MEMBER_ID })
    ));
    await assertSucceeds(setDoc(
      doc(adminDb, "inviteCodes", "NEWINV"),
      inviteCodeData({ inviteCode: "NEWINV", inviteId: "new-invite", invitedByUserId: ADMIN_ID })
    ));
    await assertFails(updateDoc(doc(memberDb, "inviteCodes", "OPENINV"), {
      status: "revoked",
      updatedAt: UPDATED_AT
    }));
    await assertSucceeds(updateDoc(doc(adminDb, "inviteCodes", "OPENINV"), {
      status: "revoked",
      updatedAt: UPDATED_AT
    }));
  });

  it("prevents invite code listing while allowing signed-in users to read a known code", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertFails(getDocs(collection(memberDb, "inviteCodes")));
    await assertSucceeds(getDoc(doc(memberDb, "inviteCodes", "OPENINV")));
  });
});

describe("transaction write boundaries", () => {
  it("allows normal income and outcome rows from owned accounts", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-outcome"),
      transactionData({
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID,
        groupId: "member-outcome-group"
      })
    ));
    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-income"),
      transactionData({
        displayKind: "income",
        postingKind: "income",
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        categoryId: "income-category",
        categoryName: "Salary",
        createdByUserId: MEMBER_ID,
        groupId: "member-income-group"
      })
    ));
  });

  it("allows admin-fee and saving-spend outcome rows from owned accounts", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-admin-fee"),
      transactionData({
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        categoryId: "system-admin-fee",
        categoryName: "Admin Fee",
        createdByUserId: MEMBER_ID,
        groupId: "member-admin-fee-group"
      })
    ));
    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-saving-spend"),
      transactionData({
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        categoryId: "food-category",
        categoryName: "Food",
        savingGoalId: "member-saving",
        createdByUserId: MEMBER_ID,
        groupId: "member-saving-spend-group"
      })
    ));
  });

  it("blocks spending from another member's account", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "forged-admin-outcome"),
      transactionData({
        accountId: "admin-account",
        accountName: "Admin Bank",
        accountOwnerUserId: ADMIN_ID,
        createdByUserId: MEMBER_ID,
        groupId: "forged-admin-outcome-group"
      })
    ));
  });

  it("allows normal transfer rows created by the source account owner", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-transfer-out"),
      transferData({
        postingKind: "transfer_out",
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        counterpartyAccountId: "admin-account",
        counterpartyAccountName: "Admin Bank",
        counterpartyAccountOwnerUserId: ADMIN_ID,
        createdByUserId: MEMBER_ID,
        groupId: "member-transfer-group"
      })
    ));
    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-transfer-in"),
      transferData({
        postingKind: "transfer_in",
        accountId: "admin-account",
        accountName: "Admin Bank",
        accountOwnerUserId: ADMIN_ID,
        counterpartyAccountId: "member-account",
        counterpartyAccountName: "Member Wallet",
        counterpartyAccountOwnerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID,
        groupId: "member-transfer-group"
      })
    ));
  });

  it("blocks transfer rows that try to use another member's account as the source", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "forged-transfer-out"),
      transferData({
        postingKind: "transfer_out",
        accountId: "admin-account",
        accountName: "Admin Bank",
        accountOwnerUserId: ADMIN_ID,
        counterpartyAccountId: "member-account",
        counterpartyAccountName: "Member Wallet",
        counterpartyAccountOwnerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID,
        groupId: "forged-transfer-group"
      })
    ));
    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "forged-transfer-in"),
      transferData({
        postingKind: "transfer_in",
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        counterpartyAccountId: "admin-account",
        counterpartyAccountName: "Admin Bank",
        counterpartyAccountOwnerUserId: ADMIN_ID,
        createdByUserId: MEMBER_ID,
        groupId: "forged-transfer-group"
      })
    ));
  });

  it("allows only the transaction creator to soft-delete their transaction", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertFails(updateDoc(doc(adminDb, "households", HOUSEHOLD_ID, "transactions", "member-transaction"), {
      status: "deleted",
      deletedAt: UPDATED_AT,
      deletedByUserId: ADMIN_ID,
      updatedAt: UPDATED_AT
    }));
    await assertSucceeds(updateDoc(doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-transaction"), {
      status: "deleted",
      deletedAt: UPDATED_AT,
      deletedByUserId: MEMBER_ID,
      updatedAt: UPDATED_AT
    }));
    await assertFails(deleteDoc(doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-transaction")));
  });

  it("allows same-account saving reserves only for the linked account owner", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");

    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-saving-reserve"),
      sameAccountSavingReserveData({ createdByUserId: MEMBER_ID })
    ));
    await assertFails(setDoc(
      doc(adminDb, "households", HOUSEHOLD_ID, "transactions", "admin-forged-saving-reserve"),
      sameAccountSavingReserveData({ createdByUserId: ADMIN_ID })
    ));
  });

  it("blocks same-account transfer-in rows unless they reserve an active linked saving", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "same-account-no-saving"),
      sameAccountSavingReserveData({ createdByUserId: MEMBER_ID, savingGoalId: null })
    ));
  });

  it("allows account-owner balance corrections only on owned accounts", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-adjustment"),
      adjustmentData({
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID,
        groupId: "member-adjustment-group"
      })
    ));
    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "forged-admin-adjustment"),
      adjustmentData({
        accountId: "admin-account",
        accountName: "Admin Bank",
        accountOwnerUserId: ADMIN_ID,
        createdByUserId: MEMBER_ID,
        groupId: "forged-admin-adjustment-group"
      })
    ));
  });

  it("allows investment deposit and withdrawal rows only with matching system categories", async () => {
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-investment-deposit"),
      transactionData({
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        categoryId: "system-investment-deposit",
        categoryName: "Investment - Deposit",
        investmentAccountId: "household-investment",
        createdByUserId: MEMBER_ID,
        groupId: "member-investment-deposit-group"
      })
    ));
    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "member-investment-withdrawal"),
      transactionData({
        displayKind: "income",
        postingKind: "income",
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        categoryId: "system-investment-withdrawal",
        categoryName: "Investment - Withdrawal",
        investmentAccountId: "household-investment",
        createdByUserId: MEMBER_ID,
        groupId: "member-investment-withdrawal-group"
      })
    ));
    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "transactions", "bad-investment-deposit-category"),
      transactionData({
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        categoryId: "food-category",
        categoryName: "Food",
        investmentAccountId: "household-investment",
        createdByUserId: MEMBER_ID,
        groupId: "bad-investment-deposit-category-group"
      })
    ));
  });
});

describe("system category and investment boundaries", () => {
  it("prevents household members from archiving protected system categories", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");

    await assertFails(updateDoc(doc(adminDb, "households", HOUSEHOLD_ID, "categories", "system-admin-fee"), {
      status: "archived",
      updatedAt: UPDATED_AT
    }));
  });

  it("keeps personal investment accounts private while allowing household investments", async () => {
    const adminDb = authedDb(ADMIN_ID, "admin@example.com");
    const memberDb = authedDb(MEMBER_ID, "member@example.com");

    await assertSucceeds(getDoc(doc(adminDb, "households", HOUSEHOLD_ID, "investmentAccounts", "admin-personal-investment")));
    await assertFails(getDoc(doc(memberDb, "households", HOUSEHOLD_ID, "investmentAccounts", "admin-personal-investment")));
    await assertSucceeds(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "investmentAccounts", "member-household-investment"),
      investmentAccountData({
        name: "Shared Fund",
        scopeType: "household",
        ownerUserId: null,
        createdByUserId: MEMBER_ID
      })
    ));
    await assertFails(setDoc(
      doc(memberDb, "households", HOUSEHOLD_ID, "investmentAccounts", "forged-personal-investment"),
      investmentAccountData({
        name: "Forged Fund",
        scopeType: "personal",
        ownerUserId: ADMIN_ID,
        createdByUserId: MEMBER_ID
      })
    ));
  });
});

function authedDb(uid, email, emailVerified = true) {
  return testEnv.authenticatedContext(uid, {
    email,
    email_verified: emailVerified
  }).firestore();
}

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", ADMIN_ID), userData({
        uid: ADMIN_ID,
        email: "admin@example.com",
        householdIds: [HOUSEHOLD_ID]
      })),
      setDoc(doc(db, "users", MEMBER_ID), userData({
        uid: MEMBER_ID,
        email: "member@example.com",
        householdIds: [HOUSEHOLD_ID]
      })),
      setDoc(doc(db, "users", OUTSIDER_ID), userData({
        uid: OUTSIDER_ID,
        email: "outsider@example.com",
        householdIds: [OTHER_HOUSEHOLD_ID]
      })),
      setDoc(doc(db, "masterAdmins", ADMIN_ID), {
        emailNormalized: "admin@example.com",
        status: "active",
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT
      }),
      setDoc(doc(db, "registrationCodes", "OPENREG"), registrationCodeData({
        code: "OPENREG",
        email: "approved@example.com",
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "appGreetingQuotes", "quote-one"), {
        text: "Keep it steady.",
        status: "active",
        createdByUserId: ADMIN_ID,
        createdByEmail: "admin@example.com",
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT
      }),
      setDoc(doc(db, "households", HOUSEHOLD_ID), householdData({
        name: "Alpha Household",
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", OTHER_HOUSEHOLD_ID), householdData({
        name: "Beta Household",
        createdByUserId: OUTSIDER_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "members", ADMIN_ID), memberData({
        uid: ADMIN_ID,
        email: "admin@example.com",
        role: "admin"
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "members", MEMBER_ID), memberData({
        uid: MEMBER_ID,
        email: "member@example.com",
        role: "member"
      })),
      setDoc(doc(db, "households", OTHER_HOUSEHOLD_ID, "members", OUTSIDER_ID), memberData({
        uid: OUTSIDER_ID,
        email: "outsider@example.com",
        role: "admin"
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "accounts", "admin-account"), accountData({
        name: "Admin Bank",
        ownerUserId: ADMIN_ID,
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "accounts", "member-account"), accountData({
        name: "Member Wallet",
        ownerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "categories", "food-category"), categoryData({
        name: "Food",
        direction: "outcome",
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "categories", "income-category"), categoryData({
        name: "Salary",
        direction: "income",
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "categories", "system-admin-fee"), categoryData({
        name: "Admin Fee",
        direction: "outcome",
        createdByUserId: ADMIN_ID,
        description: "Admin and transfer fees.",
        systemKey: "admin_fee"
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "categories", "system-investment-deposit"), categoryData({
        name: "Investment - Deposit",
        direction: "outcome",
        createdByUserId: ADMIN_ID,
        systemKey: "investment_deposit"
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "categories", "system-investment-withdrawal"), categoryData({
        name: "Investment - Withdrawal",
        direction: "income",
        createdByUserId: ADMIN_ID,
        systemKey: "investment_withdrawal"
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "savingGoals", "member-saving"), savingGoalData({
        name: "Member Saving",
        scopeType: "personal",
        ownerUserId: MEMBER_ID,
        linkedAccountId: "member-account",
        linkedAccountName: "Member Wallet",
        linkedAccountOwnerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "transactions", "member-transaction"), transactionData({
        accountId: "member-account",
        accountName: "Member Wallet",
        accountOwnerUserId: MEMBER_ID,
        createdByUserId: MEMBER_ID,
        groupId: "seed-member-transaction-group"
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "budgets", "admin-personal-budget"), budgetData({
        name: "Admin Personal Food",
        scopeType: "personal",
        ownerUserId: ADMIN_ID,
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "budgets", "household-budget"), budgetData({
        name: "Household Food",
        scopeType: "household",
        ownerUserId: null,
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "investmentAccounts", "admin-personal-investment"), investmentAccountData({
        name: "Admin Personal Fund",
        scopeType: "personal",
        ownerUserId: ADMIN_ID,
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "investmentAccounts", "household-investment"), investmentAccountData({
        name: "Household Fund",
        scopeType: "household",
        ownerUserId: null,
        createdByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "households", HOUSEHOLD_ID, "invites", "open-invite"), inviteData({
        inviteId: "open-invite",
        inviteCode: "OPENINV",
        invitedByUserId: ADMIN_ID
      })),
      setDoc(doc(db, "inviteCodes", "OPENINV"), inviteCodeData({
        inviteCode: "OPENINV",
        inviteId: "open-invite",
        invitedByUserId: ADMIN_ID
      }))
    ]);
  });
}

function userData({ uid, email, householdIds }) {
  return {
    email,
    emailNormalized: email.toLowerCase(),
    displayName: uid,
    householdIds,
    activeHouseholdId: householdIds[0] || null,
    status: "active",
    registrationCode: "TESTCODE",
    requiresEmailVerification: true,
    registrationVerified: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  };
}

function householdData({ name, createdByUserId }) {
  return {
    name,
    currencyCode: "IDR",
    timezone: "Asia/Jakarta",
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    settings: {
      visibilityMode: "multi-household",
      defaultScope: "personal",
      categoryDefaults: null
    }
  };
}

function memberData({ uid, email, role, status = "active" }) {
  return {
    userId: uid,
    emailNormalized: email.toLowerCase(),
    displayName: uid,
    status,
    role,
    joinedAt: CREATED_AT,
    invitedByUserId: ADMIN_ID,
    acceptedInviteId: null
  };
}

function accountData({ name, ownerUserId, createdByUserId, status = "active" }) {
  return {
    name,
    primaryOwnerUserId: ownerUserId,
    openingBalanceMinor: 0,
    openingBalanceAt: CREATED_AT,
    status,
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  };
}

function categoryData({
  name,
  direction,
  createdByUserId,
  status = "active",
  description = "",
  systemKey = null
}) {
  const data = {
    name,
    description,
    direction,
    status,
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  };
  if (systemKey) {
    data.systemKey = systemKey;
  }
  return data;
}

function budgetData({ name, scopeType, ownerUserId, createdByUserId, status = "active" }) {
  return {
    name,
    scopeType,
    ownerUserId,
    amountMinor: 100000,
    categoryIds: ["food-category"],
    cycleType: "monthly",
    startDate: CREATED_AT,
    endDate: null,
    status,
    archivedAt: null,
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  };
}

function registrationCodeData({ code, email, createdByUserId, status = "unused" }) {
  const emailNormalized = email.toLowerCase();
  return {
    code,
    emailNormalized,
    emailDomain: emailNormalized.split("@").pop(),
    status,
    note: "",
    createdByUserId,
    createdByEmail: "admin@example.com",
    policyOverrideUsed: false,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    expiresAt: FUTURE_AT,
    consumedAt: null,
    consumedByUserId: null,
    revokedAt: null,
    revokedByUserId: null
  };
}

function registrationConsumeData() {
  return {
    status: "consumed",
    consumedAt: UPDATED_AT,
    consumedByUserId: OUTSIDER_ID,
    updatedAt: UPDATED_AT
  };
}

function inviteData({ inviteId, inviteCode, invitedByUserId }) {
  return {
    householdId: HOUSEHOLD_ID,
    inviteId,
    inviteCode,
    householdName: "Alpha Household",
    invitedByUserId,
    status: "pending",
    expiresAt: FUTURE_AT,
    acceptedAt: null,
    acceptedByUserId: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
}

function inviteCodeData({ inviteCode, inviteId, invitedByUserId }) {
  return {
    householdId: HOUSEHOLD_ID,
    inviteCode,
    inviteId,
    householdName: "Alpha Household",
    invitedByUserId,
    status: "pending",
    expiresAt: FUTURE_AT,
    acceptedAt: null,
    acceptedByUserId: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
}

function transactionData({
  displayKind = "outcome",
  postingKind = "outcome",
  accountId,
  accountName,
  accountOwnerUserId,
  createdByUserId,
  groupId,
  amountMinor = 25000,
  categoryId = "food-category",
  categoryName = "Food",
  savingGoalId = null,
  investmentAccountId = null
}) {
  return {
    displayKind,
    postingKind,
    transactionGroupId: groupId,
    transactionAt: CREATED_AT,
    amountMinor,
    currencyCode: "IDR",
    accountId,
    accountNameSnapshot: accountName,
    accountPrimaryOwnerUserIdSnapshot: accountOwnerUserId,
    counterpartyAccountId: null,
    counterpartyAccountNameSnapshot: null,
    counterpartyAccountPrimaryOwnerUserIdSnapshot: null,
    categoryId,
    categoryNameSnapshot: categoryName,
    savingGoalId,
    investmentAccountId,
    recurringBillId: null,
    recurringBillOccurrenceId: null,
    note: "Lunch",
    status: "active",
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    deletedByUserId: null
  };
}

function transferData({
  postingKind,
  accountId,
  accountName,
  accountOwnerUserId,
  counterpartyAccountId,
  counterpartyAccountName,
  counterpartyAccountOwnerUserId,
  createdByUserId,
  groupId,
  savingGoalId = null
}) {
  return {
    displayKind: "transfer",
    postingKind,
    transactionGroupId: groupId,
    transactionAt: CREATED_AT,
    amountMinor: 10000,
    currencyCode: "IDR",
    accountId,
    accountNameSnapshot: accountName,
    accountPrimaryOwnerUserIdSnapshot: accountOwnerUserId,
    counterpartyAccountId,
    counterpartyAccountNameSnapshot: counterpartyAccountName,
    counterpartyAccountPrimaryOwnerUserIdSnapshot: counterpartyAccountOwnerUserId,
    categoryId: null,
    categoryNameSnapshot: null,
    savingGoalId,
    investmentAccountId: null,
    recurringBillId: null,
    recurringBillOccurrenceId: null,
    note: "Reserve saving",
    status: "active",
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    deletedByUserId: null
  };
}

function sameAccountSavingReserveData({ createdByUserId, savingGoalId = "member-saving" }) {
  return transferData({
    postingKind: "transfer_in",
    accountId: "member-account",
    accountName: "Member Wallet",
    accountOwnerUserId: MEMBER_ID,
    counterpartyAccountId: "member-account",
    counterpartyAccountName: "Member Wallet",
    counterpartyAccountOwnerUserId: MEMBER_ID,
    createdByUserId,
    groupId: `${createdByUserId}-saving-reserve-group`,
    savingGoalId
  });
}

function adjustmentData({
  accountId,
  accountName,
  accountOwnerUserId,
  createdByUserId,
  groupId,
  postingKind = "adjustment_increase"
}) {
  return {
    displayKind: "adjustment",
    postingKind,
    transactionGroupId: groupId,
    transactionAt: CREATED_AT,
    amountMinor: 10000,
    currencyCode: "IDR",
    accountId,
    accountNameSnapshot: accountName,
    accountPrimaryOwnerUserIdSnapshot: accountOwnerUserId,
    counterpartyAccountId: null,
    counterpartyAccountNameSnapshot: null,
    counterpartyAccountPrimaryOwnerUserIdSnapshot: null,
    categoryId: null,
    categoryNameSnapshot: null,
    savingGoalId: null,
    investmentAccountId: null,
    recurringBillId: null,
    recurringBillOccurrenceId: null,
    note: "Balance correction",
    status: "active",
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    deletedByUserId: null
  };
}

function savingGoalData({
  name,
  scopeType,
  ownerUserId,
  linkedAccountId,
  linkedAccountName,
  linkedAccountOwnerUserId,
  createdByUserId,
  status = "active"
}) {
  return {
    name,
    note: "",
    scopeType,
    ownerUserId,
    targetAmountMinor: 1000000,
    targetMonthKey: "2026-12",
    linkedAccountId,
    linkedAccountNameSnapshot: linkedAccountName,
    linkedAccountPrimaryOwnerUserIdSnapshot: linkedAccountOwnerUserId,
    status,
    archivedAt: null,
    completedAt: null,
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
}

function investmentAccountData({ name, scopeType, ownerUserId, createdByUserId, status = "active" }) {
  return {
    name,
    note: "",
    scopeType,
    ownerUserId,
    useAssetBreakdown: false,
    currentValueMinor: 0,
    status,
    archivedAt: null,
    createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
}
