import {
  Timestamp,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  firebaseEnvironment,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  query,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  where,
  writeBatch
} from "./firebase-client.js?v=20260619d";
import {
  CATEGORY_DIRECTIONS,
  CURRENCY_CODE,
  DEFAULT_CATEGORY_SEED_VERSION,
  DEFAULT_SCOPE,
  GREETINGS,
  INVITE_EXPIRY_HOURS,
  MAX_HOUSEHOLDS,
  SYSTEM_CATEGORY_SEEDS,
  TIMEZONE
} from "./constants.js?v=20260619d";
import {
  getCategoryImportKey,
  parseCategoryCsv
} from "./category-import.js?v=20260619d";
import {
  buildCsv,
  buildExportFilename
} from "./csv-export.js?v=20260619d";
import {
  buildHistoryDisplay
} from "./ledger-display.js?v=20260619d";
import {
  addMonthsClamped,
  addScheduleDate,
  cloneDate,
  dateFromDateInput,
  endOfDay,
  formatDate,
  formatDateTime,
  formatMonthKey,
  formatNumber,
  formatRupiah,
  getTimestampSortValue,
  isCurrentMonth,
  isExpired,
  startOfDay,
  toDateInput,
  toMonthInput
} from "./format-utils.js?v=20260619d";
import {
  capitalize,
  cleanText,
  escapeHtml,
  getEmailDomain,
  normalizeDomain,
  normalizeEmail,
  sanitizeStringArray
} from "./text-utils.js?v=20260619d";

const SAVING_ACCOUNT_OPTION_PREFIX = "saving::";
const INVESTMENT_ACCOUNT_OPTION_PREFIX = "investment::";
const PENDING_REGISTRATION_STORAGE_KEY = "nestplan.pendingRegistration.v1";
const LAST_GREETING_STORAGE_KEY = "nestplan.lastGreeting.v1";
const ADMIN_ROUTE_PARAM = "admin";
const VERIFICATION_RETURN_PARAM = "verificationReturn";
const REGISTRATION_CODE_LENGTH = 8;
const INVESTMENT_CATEGORY_KEYS = new Set(["investment_deposit", "investment_withdrawal"]);
const PROTECTED_SYSTEM_CATEGORY_KEYS = new Set([
  "saving",
  "admin_fee",
  ...INVESTMENT_CATEGORY_KEYS
]);

const state = {
  bootStatus: "loading",
  bootMessage: "Checking your session...",
  authUser: null,
  userProfile: null,
  households: [],
  household: null,
  member: null,
  members: [],
  invites: [],
  accounts: [],
  categories: [],
  transactionsRaw: [],
  budgets: [],
  savingGoals: [],
  savingGoalEvents: [],
  recurringBills: [],
  recurringBillOccurrences: [],
  investmentAccounts: [],
  investmentAssets: [],
  investmentEvents: [],
  greetingQuotes: [],
  greetingLibraryLoaded: false,
  defaultCategoryLibrary: [],
  platformMaintenance: {
    enabled: false,
    blockWrites: false,
    message: ""
  },
  scope: DEFAULT_SCOPE,
  currentView: "dashboard",
  planningTab: "accounts",
  insightsTab: "ledger",
  authMode: "login",
  registrationGate: {
    code: "",
    emailNormalized: "",
    validated: false
  },
  masterAdmin: {
    checked: false,
    authorized: false,
    codes: [],
    overrides: [],
    blockedDomains: [],
    greetingQuotes: [],
    defaultCategories: [],
    maintenance: null
  },
  signupMode: "create",
  setupMode: "create",
  settingsMode: "create",
  editAccountId: null,
  editCategoryId: null,
  editTransactionGroupId: null,
  editBudgetId: null,
  editSavingGoalId: null,
  editBillId: null,
  editInvestmentId: null,
  editInvestmentAssetId: null,
  editInvestmentEventId: null,
  sessionGreeting: GREETINGS[0],
  openHistoryMenuId: null,
  openBillMenuId: null,
  openInvestmentEventMenuId: null,
  showInvestmentForm: false,
  dashboardBillDismissStorageKey: "",
  dismissedDashboardBillReminderIds: new Set(),
  exportCsvContent: "",
  authFlowLock: false,
  ledgerMode: "recent",
  ledgerMonthOffset: 0,
  dashboardLedgerFilters: {
    kind: "",
    accountId: "",
    categoryId: ""
  },
  showDashboardLedgerFilters: false,
  planningLedgerLoaded: false,
  showLedgerPageActions: false,
  ledgerTableLayout: getDefaultLedgerTableLayout(),
  planningLedgerVisibleCount: 50,
  ledgerColumnWidths: {
    transaction: 128,
    created: 148,
    type: 92,
    creator: 130,
    account: 150,
    route: 180,
    note: 190,
    amount: 128
  },
  planningLedgerFilters: {
    kind: "",
    accountId: "",
    categoryId: "",
    creatorUserId: "",
    dateFrom: "",
    dateTo: ""
  },
  planningLedgerSort: "created-desc",
  reportFiltersVisible: false,
  reportRange: "this-month",
  reportCustomFrom: "",
  reportCustomTo: "",
  reportFilters: {
    accountIds: [],
    categoryIds: [],
    kind: "outcome",
    memberIds: [],
    includeSavingSpending: false
  },
  reportBudgetMode: "average",
  reportBudgetRanking: "frequent",
  reportBudgetBuffer: "normal",
  reportDrillCategoryId: "",
  reportLockedMonthKey: "",
  ensuringSystemCategories: false,
  showLedgerFilters: true,
  reportFilterModalType: ""
};

const els = {
  bootScreen: document.getElementById("boot-screen"),
  bootMessage: document.getElementById("boot-message"),
  authScreen: document.getElementById("auth-screen"),
  emailVerificationScreen: document.getElementById("email-verification-screen"),
  masterAdminScreen: document.getElementById("master-admin-screen"),
  setupScreen: document.getElementById("setup-screen"),
  appScreen: document.getElementById("app-screen"),
  appMaintenanceBanner: document.getElementById("app-maintenance-banner"),
  appMaintenanceMessage: document.getElementById("app-maintenance-message"),
  loginTab: document.getElementById("login-tab"),
  signupTab: document.getElementById("signup-tab"),
  loginForm: document.getElementById("login-form"),
  signupForm: document.getElementById("signup-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginPasswordToggle: document.getElementById("login-password-toggle"),
  forgotPasswordBtn: document.getElementById("forgot-password-btn"),
  registrationCodeForm: document.getElementById("registration-code-form"),
  registrationCodeEmail: document.getElementById("registration-code-email"),
  registrationCode: document.getElementById("registration-code"),
  registrationCodeMessage: document.getElementById("registration-code-message"),
  signupCodeSummary: document.getElementById("signup-code-summary"),
  signupCodeSummaryText: document.getElementById("signup-code-summary-text"),
  signupCodeResetBtn: document.getElementById("signup-code-reset-btn"),
  signupName: document.getElementById("signup-name"),
  signupEmail: document.getElementById("signup-email"),
  signupPassword: document.getElementById("signup-password"),
  signupPasswordToggle: document.getElementById("signup-password-toggle"),
  signupModeCreate: document.getElementById("signup-mode-create"),
  signupModeJoin: document.getElementById("signup-mode-join"),
  signupCreateFields: document.getElementById("signup-create-fields"),
  signupJoinFields: document.getElementById("signup-join-fields"),
  signupHouseholdName: document.getElementById("signup-household-name"),
  signupInviteCode: document.getElementById("signup-invite-code"),
  loginMessage: document.getElementById("login-message"),
  signupMessage: document.getElementById("signup-message"),
  verificationEmailLabel: document.getElementById("verification-email-label"),
  verificationRefreshBtn: document.getElementById("verification-refresh-btn"),
  verificationResendBtn: document.getElementById("verification-resend-btn"),
  verificationLogoutBtn: document.getElementById("verification-logout-btn"),
  verificationMessage: document.getElementById("verification-message"),
  masterAdminUserLabel: document.getElementById("master-admin-user-label"),
  masterAdminRefreshBtn: document.getElementById("master-admin-refresh-btn"),
  masterAdminLogoutBtn: document.getElementById("master-admin-logout-btn"),
  masterMaintenanceForm: document.getElementById("master-maintenance-form"),
  masterMaintenanceEnabled: document.getElementById("master-maintenance-enabled"),
  masterMaintenanceBlockWrites: document.getElementById("master-maintenance-block-writes"),
  masterMaintenanceMessageInput: document.getElementById("master-maintenance-message-input"),
  masterMaintenanceStatus: document.getElementById("master-maintenance-status"),
  masterMaintenanceMessage: document.getElementById("master-maintenance-message"),
  masterCodeForm: document.getElementById("master-code-form"),
  masterCodeEmail: document.getElementById("master-code-email"),
  masterCodeExpiryDays: document.getElementById("master-code-expiry-days"),
  masterCodeNote: document.getElementById("master-code-note"),
  masterCodeMessage: document.getElementById("master-code-message"),
  masterCodeList: document.getElementById("master-code-list"),
  masterOverrideForm: document.getElementById("master-override-form"),
  masterOverrideEmail: document.getElementById("master-override-email"),
  masterOverrideMessage: document.getElementById("master-override-message"),
  masterOverrideList: document.getElementById("master-override-list"),
  masterBlockedDomainForm: document.getElementById("master-blocked-domain-form"),
  masterBlockedDomain: document.getElementById("master-blocked-domain"),
  masterBlockedDomainMessage: document.getElementById("master-blocked-domain-message"),
  masterBlockedDomainList: document.getElementById("master-blocked-domain-list"),
  masterGreetingForm: document.getElementById("master-greeting-form"),
  masterGreetingEditId: document.getElementById("master-greeting-edit-id"),
  masterGreetingText: document.getElementById("master-greeting-text"),
  masterGreetingSubmitBtn: document.getElementById("master-greeting-submit-btn"),
  masterGreetingCancelBtn: document.getElementById("master-greeting-cancel-btn"),
  masterGreetingSeedBtn: document.getElementById("master-greeting-seed-btn"),
  masterGreetingMessage: document.getElementById("master-greeting-message"),
  masterGreetingList: document.getElementById("master-greeting-list"),
  masterDefaultCategoryForm: document.getElementById("master-default-category-form"),
  masterDefaultCategoryEditId: document.getElementById("master-default-category-edit-id"),
  masterDefaultCategoryName: document.getElementById("master-default-category-name"),
  masterDefaultCategoryDirection: document.getElementById("master-default-category-direction"),
  masterDefaultCategoryDescription: document.getElementById("master-default-category-description"),
  masterDefaultCategorySubmitBtn: document.getElementById("master-default-category-submit-btn"),
  masterDefaultCategoryCancelBtn: document.getElementById("master-default-category-cancel-btn"),
  masterDefaultCategoryMessage: document.getElementById("master-default-category-message"),
  masterDefaultCategoryList: document.getElementById("master-default-category-list"),
  setupUserLabel: document.getElementById("setup-user-label"),
  setupAvatar: document.getElementById("setup-avatar"),
  setupLogoutBtn: document.getElementById("setup-logout-btn"),
  setupModeCreate: document.getElementById("setup-mode-create"),
  setupModeJoin: document.getElementById("setup-mode-join"),
  setupCreateForm: document.getElementById("setup-create-form"),
  setupJoinForm: document.getElementById("setup-join-form"),
  setupHouseholdName: document.getElementById("setup-household-name"),
  setupInviteCode: document.getElementById("setup-invite-code"),
  setupMessage: document.getElementById("setup-message"),
  greetingText: document.getElementById("greeting-text"),
  householdLabel: document.getElementById("household-label"),
  userLabel: document.getElementById("user-label"),
  userAvatar: document.getElementById("user-avatar"),
  logoutBtn: document.getElementById("logout-btn"),
  householdSwitcher: document.getElementById("household-switcher"),
  scopePersonal: document.getElementById("scope-personal"),
  scopeHousehold: document.getElementById("scope-household"),
  navDashboard: document.getElementById("nav-dashboard"),
  navPlanning: document.getElementById("nav-planning"),
  navInvestments: document.getElementById("nav-investments"),
  navInsights: document.getElementById("nav-insights"),
  navSettings: document.getElementById("nav-settings"),
  settingsGearBtn: document.getElementById("settings-gear-btn"),
  scopeCopy: document.getElementById("scope-copy"),
  summaryBalance: document.getElementById("summary-balance"),
  summaryInflowLabel: document.getElementById("summary-inflow-label"),
  summaryInflow: document.getElementById("summary-inflow"),
  summaryOutflowLabel: document.getElementById("summary-outflow-label"),
  summaryOutflow: document.getElementById("summary-outflow"),
  dashboardBudgetsList: document.getElementById("dashboard-budgets-list"),
  dashboardSavingsList: document.getElementById("dashboard-savings-list"),
  dashboardBillReminders: document.getElementById("dashboard-bill-reminders"),
  dashboardBillRemindersList: document.getElementById("dashboard-bill-reminders-list"),
  onboardingView: document.getElementById("onboarding-view"),
  onboardingSummary: document.getElementById("onboarding-summary"),
  dashboardView: document.getElementById("dashboard-view"),
  planningView: document.getElementById("planning-view"),
  managementView: document.getElementById("management-view"),
  performanceView: document.getElementById("performance-view"),
  investmentsView: document.getElementById("investments-view"),
  insightsView: document.getElementById("insights-view"),
  settingsView: document.getElementById("settings-view"),
  accountForm: document.getElementById("account-form"),
  accountEditId: document.getElementById("account-edit-id"),
  accountName: document.getElementById("account-name"),
  accountOwner: document.getElementById("account-owner"),
  accountOpeningBalance: document.getElementById("account-opening-balance"),
  accountSubmitBtn: document.getElementById("account-submit-btn"),
  accountCancelBtn: document.getElementById("account-cancel-btn"),
  accountMessage: document.getElementById("account-message"),
  accountsList: document.getElementById("accounts-list"),
  adjustmentForm: document.getElementById("adjustment-form"),
  adjustAccount: document.getElementById("adjust-account"),
  adjustActualBalance: document.getElementById("adjust-actual-balance"),
  adjustNote: document.getElementById("adjust-note"),
  adjustmentMessage: document.getElementById("adjustment-message"),
  categoryForm: document.getElementById("category-form"),
  categoryEditId: document.getElementById("category-edit-id"),
  categoryName: document.getElementById("category-name"),
  categoryDescription: document.getElementById("category-description"),
  categoryDirection: document.getElementById("category-direction"),
  categorySubmitBtn: document.getElementById("category-submit-btn"),
  categoryCancelBtn: document.getElementById("category-cancel-btn"),
  categoryMessage: document.getElementById("category-message"),
  categoryDefaultsBtn: document.getElementById("category-defaults-btn"),
  categoryDefaultsNote: document.getElementById("category-defaults-note"),
  categoryImportBtn: document.getElementById("category-import-btn"),
  categoryImportInput: document.getElementById("category-import-input"),
  categoriesList: document.getElementById("categories-list"),
  transactionForm: document.getElementById("transaction-form"),
  transactionCard: document.getElementById("transaction-card"),
  transactionCardTitle: document.getElementById("transaction-card-title"),
  transactionCardCopy: document.getElementById("transaction-card-copy"),
  transactionGroupId: document.getElementById("transaction-group-id"),
  transactionRecurringBillId: document.getElementById("transaction-recurring-bill-id"),
  transactionRecurringBillOccurrenceId: document.getElementById("transaction-recurring-bill-occurrence-id"),
  transactionKind: document.getElementById("transaction-kind"),
  transactionDate: document.getElementById("transaction-date"),
  transactionAmount: document.getElementById("transaction-amount"),
  transactionCategoryField: document.getElementById("transaction-category-field"),
  transactionCategoryHelpBtn: document.getElementById("transaction-category-help-btn"),
  transferNoteField: document.getElementById("transfer-note-field"),
  transactionNoteRow: document.getElementById("transaction-note-row"),
  transactionNoteField: document.getElementById("transaction-note-field"),
  transactionNote: document.getElementById("transaction-note"),
  transferNote: document.getElementById("transfer-note"),
  transactionSavingField: document.getElementById("transaction-saving-field"),
  transactionSavingGoal: document.getElementById("transaction-saving-goal"),
  transactionAccountField: document.getElementById("transaction-account-field"),
  transactionUseSavingField: document.getElementById("transaction-use-saving-field"),
  transactionUseSaving: document.getElementById("transaction-use-saving"),
  transactionFeeToggleField: document.getElementById("transaction-fee-toggle-field"),
  transactionFeeHelpBtn: document.getElementById("transaction-fee-help-btn"),
  transactionFeeEnabled: document.getElementById("transaction-fee-enabled"),
  transactionFeeField: document.getElementById("transaction-fee-field"),
  transactionFeeAmount: document.getElementById("transaction-fee-amount"),
  entryFields: document.getElementById("entry-fields"),
  transferFields: document.getElementById("transfer-fields"),
  transactionCategory: document.getElementById("transaction-category"),
  transactionAccount: document.getElementById("transaction-account"),
  transferFromAccount: document.getElementById("transfer-from-account"),
  transferToAccount: document.getElementById("transfer-to-account"),
  transactionSubmitBtn: document.getElementById("transaction-submit-btn"),
  transactionCancelBtn: document.getElementById("transaction-cancel-btn"),
  transactionMessage: document.getElementById("transaction-message"),
  historyMeta: document.getElementById("history-meta"),
  ledgerNav: document.getElementById("ledger-nav"),
  historyList: document.getElementById("history-list"),
  dashboardLedgerKindFilter: document.getElementById("dashboard-ledger-kind-filter"),
  dashboardLedgerAccountFilter: document.getElementById("dashboard-ledger-account-filter"),
  dashboardLedgerCategoryFilter: document.getElementById("dashboard-ledger-category-filter"),
  dashboardLedgerClearBtn: document.getElementById("dashboard-ledger-clear-btn"),
  dashboardLedgerFilterToggle: document.getElementById("dashboard-ledger-filter-toggle"),
  exportBtn: document.getElementById("export-btn"),
  exportModal: document.getElementById("export-modal"),
  exportCloseBtn: document.getElementById("export-close-btn"),
  exportPreview: document.getElementById("export-preview"),
  exportDownloadBtn: document.getElementById("export-download-btn"),
  exportCopyBtn: document.getElementById("export-copy-btn"),
  exportMessage: document.getElementById("export-message"),
  categoryHelperModal: document.getElementById("category-helper-modal"),
  categoryHelperCloseBtn: document.getElementById("category-helper-close-btn"),
  categoryHelperTitle: document.getElementById("category-helper-title"),
  categoryHelperCopy: document.getElementById("category-helper-copy"),
  categoryHelperList: document.getElementById("category-helper-list"),
  profileForm: document.getElementById("profile-form"),
  profileDisplayName: document.getElementById("profile-display-name"),
  settingsHouseholdSwitcher: document.getElementById("settings-household-switcher"),
  settingsPasswordResetBtn: document.getElementById("settings-password-reset-btn"),
  profileMessage: document.getElementById("profile-message"),
  householdRenameForm: document.getElementById("household-rename-form"),
  householdRenameName: document.getElementById("household-rename-name"),
  householdRenameMessage: document.getElementById("household-rename-message"),
  settingsModeCreate: document.getElementById("settings-mode-create"),
  settingsModeJoin: document.getElementById("settings-mode-join"),
  settingsCreateForm: document.getElementById("settings-create-form"),
  settingsJoinForm: document.getElementById("settings-join-form"),
  settingsHouseholdName: document.getElementById("settings-household-name"),
  settingsInviteCode: document.getElementById("settings-invite-code"),
  settingsHouseholdMessage: document.getElementById("settings-household-message"),
  inviteForm: document.getElementById("invite-form"),
  inviteAdminHint: document.getElementById("invite-admin-hint"),
  inviteMessage: document.getElementById("invite-message"),
  membersList: document.getElementById("members-list"),
  inviteList: document.getElementById("invite-list"),
  planningTabBudgets: document.getElementById("planning-tab-budgets"),
  planningTabAccounts: document.getElementById("planning-tab-accounts"),
  planningTabSavings: document.getElementById("planning-tab-savings"),
  planningTabBills: document.getElementById("planning-tab-bills"),
  planningTabPerformance: document.getElementById("planning-tab-performance"),
  planningBudgetsPanel: document.getElementById("planning-budgets-panel"),
  planningSavingsPanel: document.getElementById("planning-savings-panel"),
  planningBillsPanel: document.getElementById("planning-bills-panel"),
  planningLedgerPanel: document.getElementById("planning-ledger-panel"),
  ledgerPageKindFilter: document.getElementById("ledger-page-kind-filter"),
  ledgerPageAccountFilter: document.getElementById("ledger-page-account-filter"),
  ledgerPageCategoryFilter: document.getElementById("ledger-page-category-filter"),
  ledgerPageCreatorFilter: document.getElementById("ledger-page-creator-filter"),
  ledgerPageDateFrom: document.getElementById("ledger-page-date-from"),
  ledgerPageDateTo: document.getElementById("ledger-page-date-to"),
  ledgerPageSort: document.getElementById("ledger-page-sort"),
  ledgerPageActionsToggle: document.getElementById("ledger-page-actions-toggle"),
  ledgerTableLayout: document.getElementById("ledger-table-layout"),
  ledgerPageDownloadBtn: document.getElementById("ledger-page-download-btn"),
  ledgerPageClearBtn: document.getElementById("ledger-page-clear-btn"),
  ledgerPageFilterCard: document.getElementById("ledger-page-filter-card"),
  ledgerPageFilterBody: document.getElementById("ledger-page-filter-body"),
  ledgerPageFilterToggle: document.getElementById("ledger-page-filter-toggle"),
  ledgerPageMeta: document.getElementById("ledger-page-meta"),
  ledgerTable: document.getElementById("ledger-table"),
  ledgerLoadMoreBtn: document.getElementById("ledger-load-more-btn"),
  budgetScopeCopy: document.getElementById("budget-scope-copy"),
  savingScopeCopy: document.getElementById("saving-scope-copy"),
  billScopeCopy: document.getElementById("bill-scope-copy"),
  budgetForm: document.getElementById("budget-form"),
  budgetEditId: document.getElementById("budget-edit-id"),
  budgetName: document.getElementById("budget-name"),
  budgetHouseholdScope: document.getElementById("budget-household-scope"),
  budgetAmount: document.getElementById("budget-amount"),
  budgetCycleType: document.getElementById("budget-cycle-type"),
  budgetStartDate: document.getElementById("budget-start-date"),
  budgetEndDateField: document.getElementById("budget-end-date-field"),
  budgetEndDate: document.getElementById("budget-end-date"),
  budgetCategoryPicker: document.getElementById("budget-category-picker"),
  budgetCategorySummary: document.getElementById("budget-category-summary"),
  budgetCategoryList: document.getElementById("budget-category-list"),
  budgetSubmitBtn: document.getElementById("budget-submit-btn"),
  budgetCancelBtn: document.getElementById("budget-cancel-btn"),
  budgetMessage: document.getElementById("budget-message"),
  budgetsList: document.getElementById("budgets-list"),
  savingForm: document.getElementById("saving-form"),
  savingEditId: document.getElementById("saving-edit-id"),
  savingName: document.getElementById("saving-name"),
  savingHouseholdScope: document.getElementById("saving-household-scope"),
  savingTargetAmount: document.getElementById("saving-target-amount"),
  savingTargetMonth: document.getElementById("saving-target-month"),
  savingLinkedAccount: document.getElementById("saving-linked-account"),
  savingSubmitBtn: document.getElementById("saving-submit-btn"),
  savingCancelBtn: document.getElementById("saving-cancel-btn"),
  savingMessage: document.getElementById("saving-message"),
  savingsListNote: document.getElementById("savings-list-note"),
  savingsList: document.getElementById("savings-list"),
  billForm: document.getElementById("bill-form"),
  billEditId: document.getElementById("bill-edit-id"),
  billName: document.getElementById("bill-name"),
  billHouseholdScope: document.getElementById("bill-household-scope"),
  billCategory: document.getElementById("bill-category"),
  billSchedule: document.getElementById("bill-schedule"),
  billNote: document.getElementById("bill-note"),
  billAnchorDate: document.getElementById("bill-anchor-date"),
  billSubmitBtn: document.getElementById("bill-submit-btn"),
  billCancelBtn: document.getElementById("bill-cancel-btn"),
  billMessage: document.getElementById("bill-message"),
  billRemindersList: document.getElementById("bill-reminders-list"),
  billsList: document.getElementById("bills-list"),
  performanceBudgetSummary: document.getElementById("performance-budget-summary"),
  performanceSavingsSummary: document.getElementById("performance-savings-summary"),
  performanceBillsSummary: document.getElementById("performance-bills-summary"),
  performanceBudgetsList: document.getElementById("performance-budgets-list"),
  performanceSavingsList: document.getElementById("performance-savings-list"),
  performanceBillsList: document.getElementById("performance-bills-list"),
  insightsTabLedger: document.getElementById("insights-tab-ledger"),
  insightsTabReport: document.getElementById("insights-tab-report"),
  insightsLedgerPanel: document.getElementById("insights-ledger-panel"),
  insightsReportPanel: document.getElementById("insights-report-panel"),
  reportRange: document.getElementById("report-range"),
  reportCustomRange: document.getElementById("report-custom-range"),
  reportDateFrom: document.getElementById("report-date-from"),
  reportDateTo: document.getElementById("report-date-to"),
  reportFiltersToggle: document.getElementById("report-filters-toggle"),
  reportFiltersPanel: document.getElementById("report-filters-panel"),
  reportAccountFilter: document.getElementById("report-account-filter"),
  reportAccountOpenBtn: document.getElementById("report-account-open-btn"),
  reportCategoryFilter: document.getElementById("report-category-filter"),
  reportCategoryOpenBtn: document.getElementById("report-category-open-btn"),
  reportKindFilter: document.getElementById("report-kind-filter"),
  reportMemberFilter: document.getElementById("report-member-filter"),
  reportMemberFilterGroup: document.getElementById("report-member-filter-group"),
  reportIncludeSavingSpending: document.getElementById("report-include-saving-spending"),
  reportScopeNote: document.getElementById("report-scope-note"),
  reportTotalSpent: document.getElementById("report-total-spent"),
  reportAverageMonthly: document.getElementById("report-average-monthly"),
  reportTopCategoryShare: document.getElementById("report-top-category-share"),
  reportMonthsCovered: document.getElementById("report-months-covered"),
  reportCategoryBreakdown: document.getElementById("report-category-breakdown"),
  reportCategoryDrill: document.getElementById("report-category-drill"),
  reportMonthlyTable: document.getElementById("report-monthly-table"),
  reportMonthBackBtn: document.getElementById("report-month-back-btn"),
  reportBudgetMode: document.getElementById("report-budget-mode"),
  reportBudgetRanking: document.getElementById("report-budget-ranking"),
  reportBudgetBuffer: document.getElementById("report-budget-buffer"),
  reportBudgetPerformance: document.getElementById("report-budget-performance"),
  reportBudgetSuggestions: document.getElementById("report-budget-suggestions"),
  investmentTotalValue: document.getElementById("investment-total-value"),
  investmentTotalDeposit: document.getElementById("investment-total-deposit"),
  investmentTotalWithdrawal: document.getElementById("investment-total-withdrawal"),
  investmentNetInvested: document.getElementById("investment-net-invested"),
  investmentGainLoss: document.getElementById("investment-gain-loss"),
  investmentSummaryInfoBtn: document.getElementById("investment-summary-info-btn"),
  investmentScopeCopy: document.getElementById("investment-scope-copy"),
  investmentAddPortfolioBtn: document.getElementById("investment-add-portfolio-btn"),
  investmentFormCard: document.getElementById("investment-form-card"),
  investmentForm: document.getElementById("investment-form"),
  investmentEditId: document.getElementById("investment-edit-id"),
  investmentName: document.getElementById("investment-name"),
  investmentCurrentValue: document.getElementById("investment-current-value"),
  investmentInitialFields: document.getElementById("investment-initial-fields"),
  investmentInitialDeposit: document.getElementById("investment-initial-deposit"),
  investmentInitialWithdrawal: document.getElementById("investment-initial-withdrawal"),
  investmentUseAssets: document.getElementById("investment-use-assets"),
  investmentNote: document.getElementById("investment-note"),
  investmentSubmitBtn: document.getElementById("investment-submit-btn"),
  investmentCancelBtn: document.getElementById("investment-cancel-btn"),
  investmentMessage: document.getElementById("investment-message"),
  investmentsList: document.getElementById("investments-list"),
  investmentMovementForm: document.getElementById("investment-movement-form"),
  investmentMovementDate: document.getElementById("investment-movement-date"),
  investmentMovementAccount: document.getElementById("investment-movement-account"),
  investmentMovementType: document.getElementById("investment-movement-type"),
  investmentMovementLedgerLabel: document.getElementById("investment-movement-ledger-label"),
  investmentMovementLedgerAccount: document.getElementById("investment-movement-ledger-account"),
  investmentMovementAmount: document.getElementById("investment-movement-amount"),
  investmentMovementFeeEnabled: document.getElementById("investment-movement-fee-enabled"),
  investmentMovementFeeField: document.getElementById("investment-movement-fee-field"),
  investmentMovementFeeAmount: document.getElementById("investment-movement-fee-amount"),
  investmentMovementFeeHelpBtn: document.getElementById("investment-movement-fee-help-btn"),
  investmentMovementNote: document.getElementById("investment-movement-note"),
  investmentMovementSubmitBtn: document.getElementById("investment-movement-submit-btn"),
  investmentMovementMessage: document.getElementById("investment-movement-message"),
  investmentActivityList: document.getElementById("investment-activity-list"),
  investmentAssetForm: document.getElementById("investment-asset-form"),
  investmentAssetEditId: document.getElementById("investment-asset-edit-id"),
  investmentAssetAccount: document.getElementById("investment-asset-account"),
  investmentAssetType: document.getElementById("investment-asset-type"),
  investmentAssetName: document.getElementById("investment-asset-name"),
  investmentAssetValue: document.getElementById("investment-asset-value"),
  investmentAssetNote: document.getElementById("investment-asset-note"),
  investmentAssetSubmitBtn: document.getElementById("investment-asset-submit-btn"),
  investmentAssetCancelBtn: document.getElementById("investment-asset-cancel-btn"),
  investmentAssetMessage: document.getElementById("investment-asset-message"),
  infoModal: document.getElementById("info-modal"),
  infoModalCloseBtn: document.getElementById("info-modal-close-btn"),
  infoModalTitle: document.getElementById("info-modal-title"),
  infoModalCopy: document.getElementById("info-modal-copy"),
  reportFilterModal: document.getElementById("report-filter-modal"),
  reportFilterModalTitle: document.getElementById("report-filter-modal-title"),
  reportFilterModalList: document.getElementById("report-filter-modal-list"),
  reportFilterAutoBtn: document.getElementById("report-filter-auto-btn"),
  reportFilterSelectAllBtn: document.getElementById("report-filter-select-all-btn"),
  reportFilterApplyBtn: document.getElementById("report-filter-apply-btn"),
  reportFilterCloseBtn: document.getElementById("report-filter-close-btn")
};

const INFO_TOPICS = {
  scope: {
    title: "Current view",
    paragraphs: [
      "My view shows your accounts, your personal planning items, and ledger activity you created or touched.",
      "Household view is the shared space. Budgets, savings, and bills created there are visible to household members, and members can contribute through the available household flows."
    ]
  },
  transaction: {
    title: "Create transaction",
    paragraphs: [
      "Use Income when money enters an account, such as salary, support, repayment, or other received funds.",
      "Use Outcome when money leaves an account for spending, bills, or purchases. Use Transfer when money moves between accounts, between household members, or into a saving target.",
      "Use balance correction only when the recorded account balance needs to match reality."
    ]
  },
  "transaction-fee": {
    title: "Transaction fee",
    paragraphs: [
      "Use this when the bank, e-wallet, or transfer service charges a separate fee.",
      "NestPlan records the fee as its own Admin Fee outcome from the same source account and with the same note."
    ]
  },
  "category-csv-import": {
    title: "Category CSV upload",
    paragraphs: [
      "Upload one file with these columns:"
    ],
    table: {
      headers: ["Direction", "Category Name", "Description"],
      rows: [
        ["outcome", "Essentials - Food", "Meals, takeout, cafes, and eating out."],
        ["income", "Work - Salary", "Regular salary or wage income."],
        ["both", "Shared - Reimbursement", "Money paid or received back for shared costs."]
      ]
    },
    footnotes: [
      "Direction must be exactly: income, outcome, or both.",
      "Existing active categories with the same name and direction are skipped."
    ]
  },
  balance: {
    title: "Balance summary",
    paragraphs: [
      "Total balance adds the active accounts visible in the current view.",
      "Monthly income and expense use active ledger rows dated inside the current calendar month."
    ]
  },
  "budget-snapshot": {
    title: "Budget snapshot",
    paragraphs: [
      "Budgets reduce automatically when outcome transactions match the budget categories and period.",
      "The bar shows remaining budget. Green is healthy, amber is near the limit, and red means over budget."
    ]
  },
  "saving-snapshot": {
    title: "Saving snapshot",
    paragraphs: [
      "Savings mark part of a linked account balance for a goal.",
      "The bar shows saved progress toward the target. Completed savings stay visible until archived."
    ]
  },
  "investment-summary": {
    title: "Investment summary",
    paragraphs: [
      "Valuation is the current portfolio value you record manually.",
      "Total Deposits and Total Withdrawals come from investment activity. Net Deposits is deposits minus withdrawals.",
      "Total P&L is valuation minus net deposits. It is a simple tracking estimate, not tax or broker-grade performance accounting."
    ]
  },
  "report-controls": {
    title: "Report controls",
    paragraphs: [
      "The report uses the current My view or Household view, then applies the selected time range and filters.",
      "Leaving Accounts or Categories on Auto all means every currently visible option is included, including future options that appear later."
    ]
  },
  "report-kpis": {
    title: "Report KPIs",
    paragraphs: [
      "Total spent sums matching outcome rows in the selected range.",
      "Average per month divides the selected spending by the number of calendar months covered. Top category share is the largest category's share of total spending."
    ]
  },
  "report-category-breakdown": {
    title: "Category breakdown",
    paragraphs: [
      "Categories are ranked from highest to lowest spending in the selected range.",
      "Average per month is total category spending divided by months covered. Trend compares against the previous equal-length period."
    ]
  },
  "report-monthly-view": {
    title: "Monthly view",
    paragraphs: [
      "Monthly view groups matching rows by transaction month.",
      "Spent uses outcome rows, income uses income rows, and net is income minus spent. Tap a month to lock the report to that month."
    ]
  },
  "report-budget-performance": {
    title: "Budget performance",
    paragraphs: [
      "Budget performance compares visible budgets with matching outcome transactions in the report range.",
      "Hit rate is the percentage of months within budget. Overspend rankings use the months where spending exceeded the budget."
    ]
  },
  "report-budget-suggestions": {
    title: "Suggested budgets",
    paragraphs: [
      "Suggested budgets use the median monthly spending for categories with enough history, then add the selected buffer.",
      "Confidence increases as more months of category spending are available."
    ]
  }
};

let activeListeners = [];
let platformMaintenanceUnsubscribe = null;
let renderQueued = false;
let householdRecoveryPending = false;

const MAINTENANCE_WRITE_FORM_IDS = new Set([
  "setup-create-form",
  "setup-join-form",
  "account-form",
  "adjustment-form",
  "category-form",
  "transaction-form",
  "profile-form",
  "household-rename-form",
  "settings-create-form",
  "settings-join-form",
  "invite-form",
  "budget-form",
  "saving-form",
  "bill-form",
  "investment-form",
  "investment-movement-form",
  "investment-asset-form"
]);

const MAINTENANCE_WRITE_ACTIONS = new Set([
  "edit-account",
  "archive-account",
  "edit-category",
  "archive-category",
  "edit-history",
  "delete-history",
  "copy-invite-code",
  "revoke-invite",
  "remove-member",
  "edit-budget",
  "archive-budget",
  "delete-budget",
  "edit-saving",
  "archive-saving",
  "delete-saving",
  "complete-saving",
  "reopen-saving",
  "edit-bill",
  "archive-bill",
  "delete-bill",
  "use-bill-reminder",
  "pay-bill",
  "mark-bill-paid",
  "dismiss-dashboard-bill",
  "pay-dashboard-bill",
  "edit-investment",
  "archive-investment",
  "move-investment-scope",
  "toggle-investment-scope",
  "edit-investment-event",
  "delete-investment-event",
  "edit-investment-asset",
  "archive-investment-asset",
  "edit-ledger-entry",
  "delete-ledger-entry"
]);

const MAINTENANCE_WRITE_BUTTON_IDS = new Set([
  "category-defaults-btn",
  "settings-password-reset-btn"
]);

const moneyInputs = [
  els.transactionAmount,
  els.accountOpeningBalance,
  els.adjustActualBalance,
  els.budgetAmount,
  els.savingTargetAmount,
  els.transactionFeeAmount,
  els.investmentCurrentValue,
  els.investmentInitialDeposit,
  els.investmentInitialWithdrawal,
  els.investmentMovementAmount,
  els.investmentMovementFeeAmount,
  els.investmentAssetValue
].filter(Boolean);

els.transactionDate.value = toDateInput(new Date());
if (els.investmentMovementDate) {
  els.investmentMovementDate.value = toDateInput(new Date());
}
bindMoneyInputs();
bindEvents();
window.__nestplanBootReady = true;
window.__nestplanBootError = "";
setMessage(els.loginMessage, "");
onAuthStateChanged(auth, handleAuthStateChanged);

function bindEvents() {
  els.loginTab.addEventListener("click", () => switchAuthMode("login"));
  els.signupTab.addEventListener("click", () => switchAuthMode("signup"));
  els.loginPasswordToggle.addEventListener("click", () => togglePasswordVisibility(els.loginPassword, els.loginPasswordToggle));
  els.signupPasswordToggle.addEventListener("click", () => togglePasswordVisibility(els.signupPassword, els.signupPasswordToggle));
  els.forgotPasswordBtn.addEventListener("click", handleForgotPassword);
  els.registrationCodeForm.addEventListener("submit", handleRegistrationCodeSubmit);
  els.signupCodeResetBtn.addEventListener("click", resetRegistrationGate);
  els.loginForm.addEventListener("submit", handleLoginSubmit);
  els.signupForm.addEventListener("submit", handleSignupSubmit);
  els.verificationRefreshBtn.addEventListener("click", handleVerificationRefresh);
  els.verificationResendBtn.addEventListener("click", handleVerificationResend);
  els.verificationLogoutBtn.addEventListener("click", () => signOut(auth));
  els.masterAdminRefreshBtn.addEventListener("click", refreshMasterAdminDashboard);
  els.masterAdminLogoutBtn.addEventListener("click", () => signOut(auth));
  els.masterMaintenanceForm?.addEventListener("submit", handleMasterMaintenanceSubmit);
  els.masterCodeForm.addEventListener("submit", handleMasterCodeSubmit);
  els.masterCodeList.addEventListener("click", handleMasterCodeListActions);
  els.masterOverrideForm.addEventListener("submit", handleMasterOverrideSubmit);
  els.masterOverrideList.addEventListener("click", handleMasterOverrideListActions);
  els.masterBlockedDomainForm.addEventListener("submit", handleMasterBlockedDomainSubmit);
  els.masterBlockedDomainList.addEventListener("click", handleMasterBlockedDomainListActions);
  els.masterGreetingForm.addEventListener("submit", handleMasterGreetingSubmit);
  els.masterGreetingCancelBtn.addEventListener("click", resetMasterGreetingForm);
  els.masterGreetingSeedBtn.addEventListener("click", handleMasterGreetingSeed);
  els.masterGreetingList.addEventListener("click", handleMasterGreetingListActions);
  els.masterDefaultCategoryForm.addEventListener("submit", handleMasterDefaultCategorySubmit);
  els.masterDefaultCategoryCancelBtn.addEventListener("click", resetMasterDefaultCategoryForm);
  els.masterDefaultCategoryList.addEventListener("click", handleMasterDefaultCategoryListActions);
  els.signupModeCreate.addEventListener("click", () => setSignupMode("create"));
  els.signupModeJoin.addEventListener("click", () => setSignupMode("join"));

  els.setupLogoutBtn.addEventListener("click", () => signOut(auth));
  els.logoutBtn.addEventListener("click", () => signOut(auth));
  els.setupModeCreate.addEventListener("click", () => setSetupMode("create"));
  els.setupModeJoin.addEventListener("click", () => setSetupMode("join"));
  els.setupCreateForm.addEventListener("submit", handleSetupCreateHousehold);
  els.setupJoinForm.addEventListener("submit", handleSetupJoinHousehold);

  els.scopePersonal.addEventListener("click", () => setScope("personal"));
  els.scopeHousehold.addEventListener("click", () => setScope("household"));
  els.navDashboard.addEventListener("click", () => setView("dashboard"));
  els.navPlanning.addEventListener("click", () => setView("planning"));
  els.navInvestments.addEventListener("click", () => setView("investments"));
  els.navInsights?.addEventListener("click", () => setView("insights"));
  els.navSettings?.addEventListener("click", () => setView("settings"));
  els.settingsGearBtn?.addEventListener("click", () => setView("settings"));
  els.householdSwitcher.addEventListener("change", handleActiveHouseholdChange);
  els.settingsHouseholdSwitcher.addEventListener("change", handleActiveHouseholdChange);

  els.accountForm.addEventListener("submit", handleAccountSubmit);
  els.accountCancelBtn.addEventListener("click", resetAccountForm);
  els.accountsList.addEventListener("click", handleAccountListActions);
  els.adjustmentForm.addEventListener("submit", handleAdjustmentSubmit);

  els.categoryForm.addEventListener("submit", handleCategorySubmit);
  els.categoryCancelBtn.addEventListener("click", resetCategoryForm);
  els.categoriesList.addEventListener("click", handleCategoryListActions);
  els.categoryDefaultsBtn.addEventListener("click", () => {
    void applyDefaultCategories();
  });
  els.categoryImportBtn?.addEventListener("click", () => els.categoryImportInput?.click());
  els.categoryImportInput?.addEventListener("change", event => {
    void handleCategoryCsvImport(event);
  });

  els.transactionKind.addEventListener("change", () => syncTransactionForm());
  els.transactionCategory.addEventListener("change", () => syncTransactionPlanningFields());
  els.transactionCategoryHelpBtn.addEventListener("click", openCategoryHelperModal);
  els.transactionAccount.addEventListener("change", () => syncTransactionPlanningFields());
  els.transactionSavingGoal.addEventListener("change", () => syncTransactionPlanningFields({ savingGoalId: els.transactionSavingGoal.value }));
  els.transferFromAccount.addEventListener("change", () => populateTransactionSelects({
    fromAccountId: els.transferFromAccount.value,
    toAccountOptionValue: els.transferToAccount.value
  }));
  els.transferToAccount.addEventListener("change", () => syncTransactionPlanningFields());
  els.transactionFeeEnabled.addEventListener("change", syncTransactionFeeField);
  els.transactionForm.addEventListener("submit", handleTransactionSubmit);
  els.transactionCancelBtn.addEventListener("click", resetTransactionForm);
  [
    els.dashboardLedgerKindFilter,
    els.dashboardLedgerAccountFilter,
    els.dashboardLedgerCategoryFilter
  ].forEach(select => select?.addEventListener("change", handleDashboardLedgerFilterChange));
  els.dashboardLedgerFilterToggle?.addEventListener("change", () => {
    state.showDashboardLedgerFilters = els.dashboardLedgerFilterToggle.checked;
    renderLedgerFilterControls();
  });
  els.dashboardLedgerClearBtn?.addEventListener("click", clearDashboardLedgerFilters);
  els.historyList.addEventListener("click", handleHistoryActions);
  els.ledgerNav.addEventListener("click", handleLedgerNavActions);
  els.dashboardBillRemindersList?.addEventListener("click", handleDashboardBillReminderActions);
  document.addEventListener("click", handleDocumentClick);

  els.exportBtn.addEventListener("click", openExportModal);
  els.exportCloseBtn.addEventListener("click", closeExportModal);
  els.exportModal.addEventListener("click", event => {
    if (event.target.dataset.action === "close-export-modal") {
      closeExportModal();
    }
  });
  els.exportDownloadBtn.addEventListener("click", handleExportDownload);
  els.exportCopyBtn.addEventListener("click", handleExportCopy);
  els.categoryHelperCloseBtn.addEventListener("click", closeCategoryHelperModal);
  els.categoryHelperModal.addEventListener("click", event => {
    if (event.target.dataset.action === "close-category-helper") {
      closeCategoryHelperModal();
    }
  });
  document.addEventListener("click", handleInfoButtonClick);
  els.infoModalCloseBtn?.addEventListener("click", closeInfoModal);
  els.infoModal?.addEventListener("click", event => {
    if (event.target.dataset.action === "close-info-modal") {
      closeInfoModal();
    }
  });

  els.profileForm.addEventListener("submit", handleProfileSubmit);
  els.settingsPasswordResetBtn.addEventListener("click", handleSettingsPasswordReset);
  els.householdRenameForm.addEventListener("submit", handleHouseholdRenameSubmit);
  els.settingsModeCreate.addEventListener("click", () => setSettingsMode("create"));
  els.settingsModeJoin.addEventListener("click", () => setSettingsMode("join"));
  els.settingsCreateForm.addEventListener("submit", handleSettingsCreateHousehold);
  els.settingsJoinForm.addEventListener("submit", handleSettingsJoinHousehold);
  els.inviteForm.addEventListener("submit", handleInviteSubmit);
  els.membersList.addEventListener("click", handleMemberListActions);
  els.inviteList.addEventListener("click", handleInviteListActions);

  els.planningTabAccounts?.addEventListener("click", () => setPlanningTab("accounts"));
  els.planningTabBudgets.addEventListener("click", () => setPlanningTab("budgets"));
  els.planningTabSavings.addEventListener("click", () => setPlanningTab("savings"));
  els.planningTabBills.addEventListener("click", () => setPlanningTab("bills"));
  els.planningTabPerformance.addEventListener("click", () => setPlanningTab("performance"));
  [
    els.ledgerPageKindFilter,
    els.ledgerPageAccountFilter,
    els.ledgerPageCategoryFilter,
    els.ledgerPageCreatorFilter,
    els.ledgerPageDateFrom,
    els.ledgerPageDateTo,
    els.ledgerPageSort
  ].forEach(input => input?.addEventListener("change", handlePlanningLedgerFilterChange));
  els.ledgerPageClearBtn?.addEventListener("click", clearPlanningLedgerFilters);
  els.ledgerPageFilterToggle?.addEventListener("click", () => {
    state.showLedgerFilters = !state.showLedgerFilters;
    renderPlanningLedgerFilterPanel();
  });
  els.ledgerPageActionsToggle?.addEventListener("change", () => {
    state.showLedgerPageActions = els.ledgerPageActionsToggle.checked;
    state.openHistoryMenuId = null;
    renderPlanningLedger();
  });
  els.ledgerTableLayout?.addEventListener("change", () => {
    state.ledgerTableLayout = getSelectedLedgerTableLayout();
    renderPlanningLedger();
  });
  els.ledgerPageDownloadBtn?.addEventListener("click", openExportModal);
  els.ledgerLoadMoreBtn?.addEventListener("click", handleLedgerLoadMore);
  els.ledgerTable?.addEventListener("click", handleLedgerTableActions);
  els.ledgerTable?.addEventListener("pointerdown", handleLedgerColumnResizeStart);
  els.insightsTabLedger?.addEventListener("click", () => setInsightsTab("ledger"));
  els.insightsTabReport?.addEventListener("click", () => setInsightsTab("report"));
  [
    els.reportRange,
    els.reportDateFrom,
    els.reportDateTo,
    els.reportAccountFilter,
    els.reportCategoryFilter,
    els.reportKindFilter,
    els.reportMemberFilter,
    els.reportIncludeSavingSpending,
    els.reportBudgetMode,
    els.reportBudgetRanking,
    els.reportBudgetBuffer
  ].forEach(input => input?.addEventListener("change", handleReportControlsChange));
  els.reportAccountOpenBtn?.addEventListener("click", () => openReportFilterModal("accounts"));
  els.reportCategoryOpenBtn?.addEventListener("click", () => openReportFilterModal("categories"));
  els.reportFilterCloseBtn?.addEventListener("click", closeReportFilterModal);
  els.reportFilterModal?.addEventListener("click", event => {
    if (event.target.dataset.action === "close-report-filter") {
      closeReportFilterModal();
    }
  });
  els.reportFilterAutoBtn?.addEventListener("click", applyReportFilterAutoAll);
  els.reportFilterSelectAllBtn?.addEventListener("click", selectAllReportFilterOptions);
  els.reportFilterApplyBtn?.addEventListener("click", applyReportFilterModal);
  els.reportFiltersToggle?.addEventListener("change", () => {
    state.reportFiltersVisible = els.reportFiltersToggle.checked;
    renderReportView();
  });
  els.reportCategoryBreakdown?.addEventListener("click", handleReportCategoryActions);
  els.reportCategoryDrill?.addEventListener("click", handleReportDrillActions);
  els.reportMonthlyTable?.addEventListener("click", handleReportMonthlyActions);
  els.reportMonthBackBtn?.addEventListener("click", () => {
    state.reportLockedMonthKey = "";
    renderReportView();
  });
  els.budgetCycleType.addEventListener("change", syncBudgetForm);
  els.budgetCategoryList.addEventListener("change", updateBudgetCategorySummary);
  els.budgetForm.addEventListener("submit", handleBudgetSubmit);
  els.budgetCancelBtn.addEventListener("click", resetBudgetForm);
  els.budgetsList.addEventListener("click", handleBudgetListActions);
  els.savingHouseholdScope.addEventListener("change", populateSavingSelects);
  els.savingForm.addEventListener("submit", handleSavingSubmit);
  els.savingCancelBtn.addEventListener("click", resetSavingForm);
  els.savingsList.addEventListener("click", handleSavingListActions);
  els.billForm.addEventListener("submit", handleBillSubmit);
  els.billCancelBtn.addEventListener("click", resetBillForm);
  els.billsList.addEventListener("click", handleBillListActions);
  els.billRemindersList.addEventListener("click", handleBillReminderActions);
  els.investmentAddPortfolioBtn?.addEventListener("click", () => {
    state.showInvestmentForm = !state.showInvestmentForm;
    if (state.showInvestmentForm) {
      scrollEditorIntoView(els.investmentFormCard || els.investmentForm);
    }
    renderInvestmentsView();
  });
  els.investmentUseAssets?.addEventListener("change", syncInvestmentForm);
  els.investmentForm.addEventListener("submit", handleInvestmentSubmit);
  els.investmentCancelBtn.addEventListener("click", resetInvestmentForm);
  els.investmentsList.addEventListener("click", handleInvestmentListActions);
  els.investmentMovementType.addEventListener("change", populateInvestmentSelects);
  els.investmentMovementFeeEnabled?.addEventListener("change", syncInvestmentMovementFeeField);
  els.investmentMovementForm.addEventListener("submit", handleInvestmentMovementSubmit);
  els.investmentActivityList?.addEventListener("click", handleInvestmentActivityActions);
  els.investmentAssetForm?.addEventListener("submit", handleInvestmentAssetSubmit);
  els.investmentAssetCancelBtn?.addEventListener("click", resetInvestmentAssetForm);

  document.addEventListener("submit", handleMaintenanceSubmitGuard, true);
  document.addEventListener("click", handleMaintenanceClickGuard, true);
}

function bindMoneyInputs() {
  moneyInputs.forEach(input => {
    input.addEventListener("input", () => formatMoneyInput(input));
    input.addEventListener("blur", () => formatMoneyInput(input));
  });
}

function teardownListeners() {
  activeListeners.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn("Could not unsubscribe household listener:", error);
    }
  });
  activeListeners = [];
}

function teardownPlatformMaintenanceListener() {
  if (!platformMaintenanceUnsubscribe) {
    return;
  }

  try {
    platformMaintenanceUnsubscribe();
  } catch (error) {
    console.warn("Could not unsubscribe maintenance listener:", error);
  }
  platformMaintenanceUnsubscribe = null;
}

function startPlatformMaintenanceListener() {
  teardownPlatformMaintenanceListener();
  if (!state.authUser) {
    state.platformMaintenance = getDefaultMaintenanceState();
    return;
  }

  platformMaintenanceUnsubscribe = onSnapshot(
    doc(db, "platformSettings", "maintenance"),
    snapshot => {
      state.platformMaintenance = normalizeMaintenanceState(snapshot.exists() ? snapshot.data() : null);
      if (isMasterAdminRoute()) {
        renderMasterAdminScreen();
      } else if (state.household?.id) {
        scheduleRender();
      } else {
        renderScreens();
      }
    },
    error => {
      console.warn("Could not load platform maintenance setting:", error);
      state.platformMaintenance = getDefaultMaintenanceState();
    }
  );
}

function scheduleRender() {
  if (renderQueued) {
    return;
  }

  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    try {
      if (state.authUser) {
        renderApp();
      } else {
        renderScreens();
      }
    } catch (error) {
      console.error("NestPlan render failed:", error);
      renderNonBlockingRenderError(error);
    }
  });
}

function resetLedgerView() {
  state.ledgerMode = "recent";
  state.ledgerMonthOffset = 0;
  state.openHistoryMenuId = null;
  state.openBillMenuId = null;
  state.dashboardLedgerFilters = {
    kind: "",
    accountId: "",
    categoryId: ""
  };
  state.showDashboardLedgerFilters = false;
  state.planningLedgerLoaded = false;
  state.showLedgerPageActions = false;
  state.planningLedgerVisibleCount = 50;
  state.planningLedgerFilters = {
    kind: "",
    accountId: "",
    categoryId: "",
    creatorUserId: "",
    dateFrom: "",
    dateTo: ""
  };
  state.planningLedgerSort = "created-desc";
  state.reportDrillCategoryId = "";
  state.reportLockedMonthKey = "";
}

function clearHouseholdContextState() {
  state.household = null;
  state.member = null;
  state.members = [];
  state.invites = [];
  state.accounts = [];
  state.categories = [];
  state.transactionsRaw = [];
  state.budgets = [];
  state.savingGoals = [];
  state.savingGoalEvents = [];
  state.recurringBills = [];
  state.recurringBillOccurrences = [];
  state.investmentAccounts = [];
  state.investmentAssets = [];
  state.investmentEvents = [];
  state.openHistoryMenuId = null;
  state.openBillMenuId = null;
  state.dashboardBillDismissStorageKey = "";
  state.dismissedDashboardBillReminderIds = new Set();
}

function getAccessibleHouseholdIds() {
  return state.households.map(household => household.id);
}

function isPermissionDeniedError(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  return code === "permission-denied"
    || code === "firestore/permission-denied"
    || message.includes("Missing or insufficient permissions");
}

async function handleAuthStateChanged(user) {
  if (state.authFlowLock && user) {
    state.authUser = user;
    return;
  }

  setBootState("loading", user ? "Opening your household..." : "Checking your session...");
  clearMessages();
  if (!user) {
    teardownListeners();
    teardownPlatformMaintenanceListener();
  }
  resetStateForAuth(user);

  if (!user) {
    setBootState("ready");
    setAuthBusy(false);
    if (isVerificationReturnRoute()) {
      renderVerificationReturn("Email verification is complete. Return to the NestPlan tab where you started signup, then choose I verified my email. If you closed that tab, log in with the same email and enter your user creation code again.");
    } else {
      renderScreens();
    }
    return;
  }

  startPlatformMaintenanceListener();

  if (state.authFlowLock) {
    return;
  }

  try {
    if (isMasterAdminRoute()) {
      await loadMasterAdminSession(user);
      setBootState("ready");
      renderMasterAdminScreen();
      setAuthBusy(false);
      return;
    }

    if (isVerificationReturnRoute()) {
      const handledVerificationReturn = await handleVerificationReturn(user);
      if (handledVerificationReturn) {
        setBootState("ready");
        setAuthBusy(false);
        return;
      }
    }

    if (await shouldGateEmailVerification(user)) {
      setBootState("ready");
      renderEmailVerification();
      setAuthBusy(false);
      return;
    }

    await loadUserSession(user);
    setBootState("ready");
    if (state.household?.id) {
      renderApp();
    } else {
      renderScreens();
    }
    setAuthBusy(false);
  } catch (error) {
    if (error?.code === "registration/incomplete") {
      await signOut(auth);
      setBootState("ready");
      setAuthBusy(false);
      renderScreens();
      setMessage(els.loginMessage, error.message, "error");
      return;
    }
    setBootState("error", error?.message || "NestPlan could not finish loading.");
    setAuthBusy(false);
    renderFatalError(error);
  }
}

async function loadUserSession(user) {
  if (await shouldGateEmailVerification(user)) {
    renderEmailVerification();
    return;
  }

  await ensureUserProfile(user);
  await loadGreetingQuotes();
  await loadDefaultCategoryLibrary();

  if (!state.userProfile.householdIds.length) {
    state.households = [];
    clearHouseholdContextState();
    renderSetup();
    return;
  }

  await loadUserHouseholds(state.userProfile.householdIds);
  const accessibleHouseholdIds = getAccessibleHouseholdIds();
  const activeHouseholdId = resolveActiveHouseholdId(accessibleHouseholdIds, state.userProfile.activeHouseholdId || null);
  if (!activeHouseholdId) {
    clearHouseholdContextState();
    renderSetup();
    return;
  }

  if (state.household?.id && state.household.id !== activeHouseholdId) {
    resetLedgerView();
    resetHouseholdLocalForms();
  }

  if (activeHouseholdId !== state.userProfile.activeHouseholdId) {
    await updateActiveHousehold(activeHouseholdId);
  }

  await loadHouseholdContext(activeHouseholdId);
  if (householdRecoveryPending || !state.household?.id) {
    return;
  }
  state.sessionGreeting = pickGreeting();
  renderApp();
}

async function refreshFromCurrentUser() {
  if (!state.authUser) {
    return;
  }
  await loadUserSession(state.authUser);
}

function getBuiltInGreetingQuotes() {
  return GREETINGS.map((text, index) => ({
    id: `builtin-greeting-${index}`,
    text,
    source: "built-in",
    readonly: true
  }));
}

async function loadGreetingQuotes() {
  const fallbackGreetings = getBuiltInGreetingQuotes();
  try {
    const snapshot = await getDocs(collection(db, "appGreetingQuotes"));
    const firestoreGreetings = snapshot.docs
      .map(snapshotItem => ({ id: snapshotItem.id, ...snapshotItem.data() }))
      .filter(item => item.status === "active" && cleanText(item.text))
      .sort((a, b) => getTimestampSortValue(a.createdAt) - getTimestampSortValue(b.createdAt));
    state.greetingQuotes = firestoreGreetings;
    state.greetingLibraryLoaded = true;
  } catch (error) {
    console.warn("Could not load greeting library:", error);
    state.greetingQuotes = fallbackGreetings;
    state.greetingLibraryLoaded = false;
  }
}

async function loadDefaultCategoryLibrary() {
  try {
    const snapshot = await getDocs(collection(db, "appDefaultCategories"));
    state.defaultCategoryLibrary = snapshot.docs
      .map(snapshotItem => ({ id: snapshotItem.id, ...snapshotItem.data() }))
      .filter(item => item.status === "active" && cleanText(item.name))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    console.warn("Could not load default category library:", error);
    state.defaultCategoryLibrary = [];
  }
}

async function loadMasterAdminSession(user) {
  state.authUser = user;
  state.masterAdmin.checked = false;
  state.masterAdmin.authorized = false;
  renderMasterAdminScreen();

  try {
    const isMaster = await getMasterAdminStatus();
    state.masterAdmin.checked = true;
    state.masterAdmin.authorized = isMaster;
    if (state.masterAdmin.authorized) {
      await refreshMasterAdminDashboard();
    } else {
      exitMasterAdminRoute();
      await loadUserSession(user);
    }
  } catch (error) {
    state.masterAdmin.checked = true;
    state.masterAdmin.authorized = false;
    renderMasterAdminScreen(
      getUserErrorMessage(error, {
        permissionMessage: "Firebase denied master admin access. Publish the latest Firestore rules for the invite-only admin flow, then refresh this page."
      }),
      "error"
    );
  }
}

async function refreshMasterAdminDashboard() {
  if (!state.authUser) {
    return;
  }

  setButtonLoading(els.masterAdminRefreshBtn, true, "Refreshing...");
  setMessage(els.masterCodeMessage, "");
  setMessage(els.masterOverrideMessage, "");
  setMessage(els.masterBlockedDomainMessage, "");
  setMessage(els.masterGreetingMessage, "");
  setMessage(els.masterDefaultCategoryMessage, "");
  try {
    const response = await getMasterAdminDashboard();
    state.masterAdmin.checked = true;
    state.masterAdmin.authorized = true;
    state.masterAdmin.codes = response.registrationCodes || [];
    state.masterAdmin.overrides = response.emailOverrides || [];
    state.masterAdmin.blockedDomains = response.blockedDomains || [];
    state.masterAdmin.greetingQuotes = response.greetingQuotes || [];
    state.masterAdmin.defaultCategories = response.defaultCategories || [];
    state.masterAdmin.maintenance = response.maintenance || getDefaultMaintenanceState();
    state.platformMaintenance = state.masterAdmin.maintenance;
    renderMasterAdminScreen();
  } catch (error) {
    renderMasterAdminScreen(getUserErrorMessage(error), "error");
  } finally {
    setButtonLoading(els.masterAdminRefreshBtn, false);
  }
}

async function handleMasterMaintenanceSubmit(event) {
  event.preventDefault();
  setMessage(els.masterMaintenanceMessage, "");
  const submitButton = els.masterMaintenanceForm?.querySelector("button[type='submit']");
  setButtonLoading(submitButton, true, "Saving...");

  try {
    await savePlatformMaintenance({
      enabled: els.masterMaintenanceEnabled.checked,
      blockWrites: els.masterMaintenanceBlockWrites.checked,
      message: els.masterMaintenanceMessageInput.value
    });
    setMessage(els.masterMaintenanceMessage, "Maintenance setting saved.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterMaintenanceMessage, getUserErrorMessage(error), "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
}

async function shouldGateEmailVerification(user) {
  if (!user || user.emailVerified) {
    return false;
  }

  const pending = loadPendingRegistration();
  if (pending && normalizeEmail(pending.email) === normalizeEmail(user.email || "")) {
    return true;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (!profileSnap.exists()) {
      return true;
    }
    const profile = profileSnap.data();
    return profile.requiresEmailVerification === true && profile.registrationVerified !== true;
  } catch (error) {
    console.warn("Could not inspect email verification gate:", error);
    return false;
  }
}

async function sendVerificationEmail(user) {
  await sendEmailVerification(user, {
    url: getAppReturnUrl(),
    handleCodeInApp: false
  });
}

function getAppReturnUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("v", window.__nestplanBuild || "20260619d");
  url.searchParams.set(VERIFICATION_RETURN_PARAM, "1");
  url.searchParams.delete(ADMIN_ROUTE_PARAM);
  url.hash = "";
  return url.toString();
}

function isVerificationReturnRoute() {
  const params = new URLSearchParams(window.location.search);
  return params.get(VERIFICATION_RETURN_PARAM) === "1";
}

function clearVerificationReturnRoute() {
  const url = new URL(window.location.href);
  url.searchParams.delete(VERIFICATION_RETURN_PARAM);
  window.history.replaceState({}, "", url.toString());
}

function pendingRegistrationMatchesUser(pending, user) {
  return Boolean(
    pending
    && user
    && normalizeEmail(pending.email) === normalizeEmail(user.email || "")
  );
}

async function handleVerificationReturn(user) {
  const pending = loadPendingRegistration();

  try {
    await reload(user);
    await user.getIdToken(true);
  } catch (error) {
    console.warn("Could not refresh verification return state:", error);
  }

  if (pendingRegistrationMatchesUser(pending, auth.currentUser) && auth.currentUser?.emailVerified) {
    clearVerificationReturnRoute();
    renderEmailVerification("Email verified. Finalizing your NestPlan account...", "success");
    await finalizeVerifiedRegistration();
    return true;
  }

  renderVerificationReturn("Email verification is complete. Return to the NestPlan tab where you started signup, then choose I verified my email. If you closed that tab, log in with the same email and enter your user creation code again.");
  return true;
}

function savePendingRegistration(payload) {
  localStorage.setItem(PENDING_REGISTRATION_STORAGE_KEY, JSON.stringify(payload));
}

function loadPendingRegistration() {
  try {
    const raw = localStorage.getItem(PENDING_REGISTRATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Could not read pending registration state:", error);
    return null;
  }
}

function clearPendingRegistration() {
  localStorage.removeItem(PENDING_REGISTRATION_STORAGE_KEY);
}

async function getMasterAdminStatus() {
  if (!state.authUser?.uid) {
    return false;
  }
  const snap = await getDoc(doc(db, "masterAdmins", state.authUser.uid));
  return snap.exists() && snap.data().status === "active";
}

async function assertMasterAdminClient() {
  const isMaster = await getMasterAdminStatus();
  if (!isMaster) {
    throw new Error("This account is not a NestPlan master admin.");
  }
}

async function getMasterAdminDashboard() {
  await assertMasterAdminClient();
  const [codesSnap, overridesSnap, defaultCategoriesSnap, maintenanceSnap, blockedDomainsSnap, greetingQuotesSnap] = await Promise.all([
    getDocs(collection(db, "registrationCodes")),
    getDocs(collection(db, "emailPolicyOverrides")),
    getDocs(collection(db, "appDefaultCategories")),
    getDoc(doc(db, "platformSettings", "maintenance")),
    getDocs(collection(db, "emailPolicyBlockedDomains")),
    getDocs(collection(db, "appGreetingQuotes"))
  ]);
  const firestoreGreetings = greetingQuotesSnap
    .docs
    .map(snapshot => serializeGreetingQuote(snapshot.id, snapshot.data()))
    .filter(item => item.status === "active" && cleanText(item.text))
    .sort((a, b) => a.createdAtSort - b.createdAtSort)
    .slice(0, 60);

  return {
    registrationCodes: codesSnap.docs
      .map(snapshot => serializeRegistrationCode(snapshot.id, snapshot.data()))
      .sort((a, b) => b.createdAtSort - a.createdAtSort)
      .slice(0, 60),
    emailOverrides: overridesSnap.docs
      .map(snapshot => serializeEmailOverride(snapshot.id, snapshot.data()))
      .sort((a, b) => b.createdAtSort - a.createdAtSort)
      .slice(0, 60),
    blockedDomains: blockedDomainsSnap.docs
      .map(snapshot => serializeBlockedDomain(snapshot.id, snapshot.data()))
      .sort((a, b) => (a.domain || "").localeCompare(b.domain || ""))
      .slice(0, 200),
    greetingQuotes: firestoreGreetings,
    defaultCategories: defaultCategoriesSnap.docs
      .map(snapshot => serializeDefaultCategory(snapshot.id, snapshot.data()))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .slice(0, 60),
    maintenance: normalizeMaintenanceState(maintenanceSnap.exists() ? maintenanceSnap.data() : null)
  };
}

async function savePlatformMaintenance({ enabled, blockWrites, message }) {
  await assertMasterAdminClient();
  const cleanMessage = cleanText(message) || "NestPlan is being updated. Please pause changes for a few minutes.";

  await setDoc(doc(db, "platformSettings", "maintenance"), {
    enabled: Boolean(enabled),
    blockWrites: Boolean(enabled && blockWrites),
    message: cleanMessage,
    updatedByUserId: state.authUser.uid,
    updatedByEmail: normalizeEmail(state.authUser.email || ""),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function createRegistrationCode({ email, expiryDays, note }) {
  await assertMasterAdminClient();
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) {
    throw new Error("Email is required.");
  }

  const emailDomain = getEmailDomain(emailNormalized);
  const overrideUsed = await hasEmailOverride(emailNormalized);
  if (await isEmailDomainBlocked(emailDomain) && !overrideUsed) {
    throw new Error("This email domain is blocked unless the exact email has an override first.");
  }

  const code = await generateUniqueRegistrationCode();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + clampRegistrationExpiryDays(expiryDays) * 24 * 60 * 60 * 1000));
  await setDoc(doc(db, "registrationCodes", code), {
    code,
    emailNormalized,
    emailDomain,
    status: "unused",
    note: cleanText(note),
    createdByUserId: state.authUser.uid,
    createdByEmail: normalizeEmail(state.authUser.email || ""),
    policyOverrideUsed: overrideUsed,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt,
    consumedAt: null,
    consumedByUserId: null,
    revokedAt: null,
    revokedByUserId: null
  });

  return { code, emailNormalized, expiresAtFormatted: formatDateTime(expiresAt) };
}

async function validateRegistrationCode({ code, email }) {
  const cleanedCode = cleanInviteCode(code);
  const emailNormalized = normalizeEmail(email);
  const snap = await getDoc(doc(db, "registrationCodes", cleanedCode));
  if (!snap.exists()) {
    throw new Error("Registration code was not found.");
  }
  assertUsableRegistrationCode({ id: snap.id, ...snap.data() }, emailNormalized);
}

async function consumeRegistrationCode({ code, displayName }) {
  if (!auth.currentUser) {
    throw new Error("Sign in first.");
  }

  const cleanedCode = cleanInviteCode(code);
  const emailNormalized = normalizeEmail(auth.currentUser.email || "");
  const codeRef = doc(db, "registrationCodes", cleanedCode);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    throw new Error("Registration code was not found.");
  }

  assertUsableRegistrationCode({ id: codeSnap.id, ...codeSnap.data() }, emailNormalized);

  const userRef = doc(db, "users", auth.currentUser.uid);
  const existingUser = await getDoc(userRef);
  if (existingUser.exists()) {
    return;
  }

  const batch = writeBatch(db);
  batch.set(userRef, {
    email: auth.currentUser.email,
    emailNormalized,
    displayName: cleanText(displayName) || auth.currentUser.displayName || deriveDisplayNameFromEmail(emailNormalized),
    householdIds: [],
    activeHouseholdId: null,
    status: "active",
    requiresEmailVerification: true,
    registrationVerified: true,
    registrationCode: cleanedCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "registrationActivations", auth.currentUser.uid), {
    userId: auth.currentUser.uid,
    emailNormalized,
    registrationCode: cleanedCode,
    createdAt: serverTimestamp(),
    activatedAt: serverTimestamp()
  });
  batch.update(codeRef, {
    status: "consumed",
    consumedAt: serverTimestamp(),
    consumedByUserId: auth.currentUser.uid,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}

async function revokeRegistrationCode({ code }) {
  await assertMasterAdminClient();
  const cleanedCode = cleanInviteCode(code);
  await deleteDoc(doc(db, "registrationCodes", cleanedCode));
}

async function addEmailOverride({ email }) {
  await assertMasterAdminClient();
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) {
    throw new Error("Email is required.");
  }
  await setDoc(doc(db, "emailPolicyOverrides", emailNormalized), {
    emailNormalized,
    emailDomain: getEmailDomain(emailNormalized),
    status: "active",
    deletedAt: null,
    deletedByUserId: null,
    createdByUserId: state.authUser.uid,
    createdByEmail: normalizeEmail(state.authUser.email || ""),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function removeEmailOverride({ email }) {
  await assertMasterAdminClient();
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) {
    throw new Error("Email is required.");
  }
  await deleteDoc(doc(db, "emailPolicyOverrides", emailNormalized));
}

async function addBlockedEmailDomain({ domain }) {
  await assertMasterAdminClient();
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    throw new Error("Domain is required.");
  }

  await setDoc(doc(db, "emailPolicyBlockedDomains", normalizedDomain), {
    domain: normalizedDomain,
    status: "active",
    createdByUserId: state.authUser.uid,
    createdByEmail: normalizeEmail(state.authUser.email || ""),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function removeBlockedEmailDomain({ domain }) {
  await assertMasterAdminClient();
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    throw new Error("Domain is required.");
  }

  await deleteDoc(doc(db, "emailPolicyBlockedDomains", normalizedDomain));
}

async function saveGreetingQuote({ id, text }) {
  await assertMasterAdminClient();
  const quoteText = cleanText(text);
  if (!quoteText) {
    throw new Error("Sentence is required.");
  }

  const payload = {
    text: quoteText,
    status: "active",
    createdByUserId: state.authUser.uid,
    createdByEmail: normalizeEmail(state.authUser.email || ""),
    updatedAt: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "appGreetingQuotes", id), payload);
    return;
  }

  await setDoc(doc(collection(db, "appGreetingQuotes")), {
    ...payload,
    createdAt: serverTimestamp()
  });
}

async function seedDefaultGreetingQuotes() {
  await assertMasterAdminClient();
  const existingTexts = new Set(state.masterAdmin.greetingQuotes.map(item => cleanText(item.text).toLowerCase()));
  const missingGreetings = GREETINGS.filter(text => !existingTexts.has(cleanText(text).toLowerCase()));
  if (!missingGreetings.length) {
    return 0;
  }

  const batch = writeBatch(db);
  missingGreetings.forEach(text => {
    batch.set(doc(collection(db, "appGreetingQuotes")), {
      text,
      status: "active",
      createdByUserId: state.authUser.uid,
      createdByEmail: normalizeEmail(state.authUser.email || ""),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
  return missingGreetings.length;
}

async function removeGreetingQuote({ id }) {
  await assertMasterAdminClient();
  if (!id) {
    throw new Error("Choose a sentence first.");
  }

  await deleteDoc(doc(db, "appGreetingQuotes", id));
}

async function saveDefaultCategory({ id, name, direction, description }) {
  await assertMasterAdminClient();
  const cleanName = cleanText(name);
  if (!cleanName) {
    throw new Error("Category name is required.");
  }
  if (!CATEGORY_DIRECTIONS.some(item => item.value === direction)) {
    throw new Error("Choose a valid category direction.");
  }

  const payload = {
    name: cleanName,
    direction,
    description: cleanText(description),
    status: "active",
    createdByUserId: state.authUser.uid,
    createdByEmail: normalizeEmail(state.authUser.email || ""),
    updatedAt: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "appDefaultCategories", id), payload);
    return;
  }

  await setDoc(doc(collection(db, "appDefaultCategories")), {
    ...payload,
    createdAt: serverTimestamp()
  });
}

async function removeDefaultCategory({ id }) {
  await assertMasterAdminClient();
  if (!id) {
    throw new Error("Choose a category first.");
  }

  await deleteDoc(doc(db, "appDefaultCategories", id));
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  setMessage(els.loginMessage, "");
  setAuthBusy(true);
  setMessage(els.loginMessage, "Signing in and loading your dashboard...", "success");

  try {
    await signInWithEmailAndPassword(auth, normalizeEmail(els.loginEmail.value), els.loginPassword.value);
  } catch (error) {
    setAuthBusy(false);
    setMessage(els.loginMessage, getUserErrorMessage(error), "error");
  }
}

async function handleForgotPassword() {
  setMessage(els.loginMessage, "");
  const email = normalizeEmail(els.loginEmail.value);
  if (!email) {
    setMessage(els.loginMessage, "Enter your email first, then request the password reset.", "error");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    setMessage(els.loginMessage, "If this account uses a real email inbox, a password reset link will arrive shortly.", "success");
  } catch (error) {
    setMessage(els.loginMessage, getUserErrorMessage(error), "error");
  }
}

async function handleRegistrationCodeSubmit(event) {
  event.preventDefault();
  setMessage(els.registrationCodeMessage, "");

  const code = cleanInviteCode(els.registrationCode.value);
  const email = normalizeEmail(els.registrationCodeEmail.value);
  if (!email || !code) {
    setMessage(els.registrationCodeMessage, "Enter the assigned email and user creation code.", "error");
    return;
  }

  setAuthBusy(true);
  try {
    await validateRegistrationCode({ code, email });
    state.registrationGate = {
      code,
      emailNormalized: email,
      validated: true
    };
    els.signupEmail.value = email;
    els.signupEmail.readOnly = true;
    renderRegistrationGateSummary();
    switchAuthMode("signup");
    setMessage(els.signupMessage, "Code accepted. Finish the account details for this email.", "success");
  } catch (error) {
    setMessage(els.registrationCodeMessage, getRegistrationErrorMessage(error), "error");
  } finally {
    setAuthBusy(false);
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  setMessage(els.signupMessage, "");
  setAuthBusy(true);
  switchAuthMode("signup");

  const email = normalizeEmail(els.signupEmail.value);
  const password = els.signupPassword.value;
  const displayName = cleanText(els.signupName.value);
  const registrationCode = state.registrationGate.code;

  if (!state.registrationGate.validated || !registrationCode) {
    setAuthBusy(false);
    setMessage(els.signupMessage, "Enter a valid user creation code first.", "error");
    switchAuthMode("login");
    return;
  }

  if (email !== state.registrationGate.emailNormalized) {
    setAuthBusy(false);
    setMessage(els.signupMessage, "Use the same email that was approved for this code.", "error");
    return;
  }

  if (!displayName) {
    setAuthBusy(false);
    setMessage(els.signupMessage, "Please enter a display name.", "error");
    return;
  }

  if (state.signupMode === "create") {
    const householdName = cleanText(els.signupHouseholdName.value);
    if (!householdName) {
      setAuthBusy(false);
      setMessage(els.signupMessage, "Please name the household you want to create.", "error");
      return;
    }
  } else {
    const inviteCode = cleanInviteCode(els.signupInviteCode.value);
    if (!inviteCode) {
      setAuthBusy(false);
      setMessage(els.signupMessage, "Please enter the invite code you received.", "error");
      return;
    }
  }

  const pendingRegistrationPayload = {
    code: registrationCode,
    email,
    displayName,
    signupMode: state.signupMode,
    householdName: cleanText(els.signupHouseholdName.value),
    inviteCode: cleanInviteCode(els.signupInviteCode.value),
    createdAt: Date.now()
  };

  setMessage(els.signupMessage, "Creating your account...", "success");
  state.authFlowLock = true;
  let bootstrapComplete = false;
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    await sendVerificationEmail(credential.user);
    savePendingRegistration(pendingRegistrationPayload);
    state.authFlowLock = false;
    state.authUser = credential.user;
    renderEmailVerification("Verification email sent. Finish verification before NestPlan creates or joins a household.", "success");
    bootstrapComplete = true;
  } catch (error) {
    if (isEmailAlreadyInUseError(error)) {
      savePendingRegistration(pendingRegistrationPayload);
      switchAuthMode("login");
      els.loginEmail.value = email;
      setMessage(els.loginMessage, "This email already has a pending account. Log in with the password you created to finish setup.", "error");
      return;
    }
    setMessage(
      els.signupMessage,
      getUserErrorMessage(error, {
        permissionMessage: "Firebase denied the signup setup write. Re-publish the latest Firestore rules for users and households, then try again."
      }),
      "error"
    );
  } finally {
    state.authFlowLock = false;
    if (!bootstrapComplete) {
      setAuthBusy(false);
    }
    if (!bootstrapComplete && auth.currentUser) {
      await refreshFromCurrentUser();
    }
  }
}

async function handleVerificationRefresh() {
  setMessage(els.verificationMessage, "");
  if (!auth.currentUser) {
    setMessage(els.verificationMessage, "Log in again to continue verification.", "error");
    return;
  }

  try {
    await reload(auth.currentUser);
    await auth.currentUser.getIdToken(true);
    if (!auth.currentUser.emailVerified) {
      setMessage(els.verificationMessage, "This email is not verified yet. Open the verification link, then try again.", "error");
      return;
    }

    await finalizeVerifiedRegistration();
  } catch (error) {
    setMessage(els.verificationMessage, getUserErrorMessage(error), "error");
  }
}

async function handleVerificationResend() {
  setMessage(els.verificationMessage, "");
  if (!auth.currentUser) {
    setMessage(els.verificationMessage, "Log in again to resend verification.", "error");
    return;
  }

  try {
    await sendVerificationEmail(auth.currentUser);
    setMessage(els.verificationMessage, "Verification email sent again.", "success");
  } catch (error) {
    setMessage(els.verificationMessage, getUserErrorMessage(error), "error");
  }
}

async function finalizeVerifiedRegistration() {
  const pending = loadPendingRegistration();
  if (!pending || normalizeEmail(pending.email) !== normalizeEmail(auth.currentUser?.email || "")) {
    await refreshFromCurrentUser();
    return;
  }

  setMessage(els.verificationMessage, "Finalizing your account...", "success");
  state.authFlowLock = true;
  let completed = false;
  try {
    await consumeRegistrationCode({
      code: pending.code,
      displayName: pending.displayName
    });
    state.authUser = auth.currentUser;
    await ensureUserProfile(auth.currentUser, pending.displayName);

    if (pending.signupMode === "create" && pending.householdName) {
      await createHouseholdFlow(pending.householdName, els.verificationMessage, { skipRefresh: true });
    } else if (pending.signupMode === "join" && pending.inviteCode) {
      await joinHouseholdByCode(pending.inviteCode, els.verificationMessage, { skipRefresh: true });
    }

    clearPendingRegistration();
    state.authFlowLock = false;
    completed = true;
    await loadUserSession(auth.currentUser);
  } finally {
    state.authFlowLock = false;
    if (!completed) {
      renderEmailVerification();
    }
  }
}

async function handleMasterCodeSubmit(event) {
  event.preventDefault();
  setMessage(els.masterCodeMessage, "");
  const submitButton = els.masterCodeForm.querySelector("button[type='submit']");
  setButtonLoading(submitButton, true, "Creating...");

  try {
    const response = await createRegistrationCode({
      email: normalizeEmail(els.masterCodeEmail.value),
      expiryDays: Number(els.masterCodeExpiryDays.value || 14),
      note: cleanText(els.masterCodeNote.value)
    });
    els.masterCodeForm.reset();
    els.masterCodeExpiryDays.value = "14";
    setMessage(els.masterCodeMessage, `Code created: ${response.code || ""}`, "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterCodeMessage, getRegistrationErrorMessage(error), "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
}

async function handleMasterOverrideSubmit(event) {
  event.preventDefault();
  setMessage(els.masterOverrideMessage, "");

  try {
    await addEmailOverride({ email: normalizeEmail(els.masterOverrideEmail.value) });
    els.masterOverrideForm.reset();
    setMessage(els.masterOverrideMessage, "Email override added.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterOverrideMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterBlockedDomainSubmit(event) {
  event.preventDefault();
  setMessage(els.masterBlockedDomainMessage, "");
  try {
    await addBlockedEmailDomain({ domain: els.masterBlockedDomain.value });
    els.masterBlockedDomainForm.reset();
    setMessage(els.masterBlockedDomainMessage, "Blocked domain added.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterBlockedDomainMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterGreetingSubmit(event) {
  event.preventDefault();
  setMessage(els.masterGreetingMessage, "");
  try {
    const isEditing = Boolean(cleanText(els.masterGreetingEditId.value));
    await saveGreetingQuote({
      id: cleanText(els.masterGreetingEditId.value),
      text: els.masterGreetingText.value
    });
    resetMasterGreetingForm();
    setMessage(els.masterGreetingMessage, isEditing ? "Sentence updated." : "Sentence added.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterGreetingMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterGreetingSeed() {
  setMessage(els.masterGreetingMessage, "");
  try {
    const addedCount = await seedDefaultGreetingQuotes();
    setMessage(
      els.masterGreetingMessage,
      addedCount ? `${addedCount} current library sentences added.` : "The current library is already added.",
      "success"
    );
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterGreetingMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterDefaultCategorySubmit(event) {
  event.preventDefault();
  setMessage(els.masterDefaultCategoryMessage, "");

  try {
    await saveDefaultCategory({
      id: cleanText(els.masterDefaultCategoryEditId.value),
      name: els.masterDefaultCategoryName.value,
      direction: els.masterDefaultCategoryDirection.value,
      description: els.masterDefaultCategoryDescription.value
    });
    resetMasterDefaultCategoryForm();
    setMessage(els.masterDefaultCategoryMessage, "Default category saved.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterDefaultCategoryMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleSetupCreateHousehold(event) {
  event.preventDefault();
  setMessage(els.setupMessage, "");
  try {
    await createHouseholdFlow(cleanText(els.setupHouseholdName.value), els.setupMessage);
  } catch (error) {
    setMessage(
      els.setupMessage,
      getUserErrorMessage(error, {
        permissionMessage: "Firebase denied household creation. Re-publish the latest Firestore rules for users and households, then try again."
      }),
      "error"
    );
  }
}

async function handleSetupJoinHousehold(event) {
  event.preventDefault();
  setMessage(els.setupMessage, "");
  try {
    await joinHouseholdByCode(cleanInviteCode(els.setupInviteCode.value), els.setupMessage);
  } catch (error) {
    setMessage(
      els.setupMessage,
      getUserErrorMessage(error, {
        permissionMessage: "Firebase denied join-by-code. Re-publish the latest Firestore rules for the code-only invite flow, then try again."
      }),
      "error"
    );
  }
}

async function handleSettingsCreateHousehold(event) {
  event.preventDefault();
  setMessage(els.settingsHouseholdMessage, "");
  try {
    await createHouseholdFlow(cleanText(els.settingsHouseholdName.value), els.settingsHouseholdMessage);
  } catch (error) {
    setMessage(
      els.settingsHouseholdMessage,
      getUserErrorMessage(error, {
        permissionMessage: "Firebase denied household creation. Re-publish the latest Firestore rules for users and households, then try again."
      }),
      "error"
    );
  }
}

async function handleSettingsJoinHousehold(event) {
  event.preventDefault();
  setMessage(els.settingsHouseholdMessage, "");
  try {
    await joinHouseholdByCode(cleanInviteCode(els.settingsInviteCode.value), els.settingsHouseholdMessage);
  } catch (error) {
    setMessage(
      els.settingsHouseholdMessage,
      getUserErrorMessage(error, {
        permissionMessage: "Firebase denied join-by-code. Re-publish the latest Firestore rules for the code-only invite flow, then try again."
      }),
      "error"
    );
  }
}

async function handleActiveHouseholdChange(event) {
  const householdId = event.target.value;
  if (!householdId || householdId === state.household?.id) {
    syncHouseholdSwitcherValue();
    return;
  }

  try {
    resetLedgerView();
    resetHouseholdLocalForms();
    await updateActiveHousehold(householdId);
    await loadHouseholdContext(householdId);
    state.sessionGreeting = pickGreeting();
    renderApp();
  } catch (error) {
    setMessage(els.profileMessage, error.message, "error");
    syncHouseholdSwitcherValue();
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  setMessage(els.profileMessage, "");

  const displayName = cleanText(els.profileDisplayName.value);
  if (!displayName) {
    setMessage(els.profileMessage, "Display name is required.", "error");
    return;
  }

  try {
    await updateProfile(state.authUser, { displayName });
    await updateDoc(doc(db, "users", state.authUser.uid), {
      displayName,
      status: "active",
      updatedAt: serverTimestamp()
    });
    await ensureUserProfile(state.authUser, displayName);
    renderApp();
    setMessage(els.profileMessage, "Profile updated.", "success");
  } catch (error) {
    setMessage(els.profileMessage, error.message, "error");
  }
}

async function handleSettingsPasswordReset() {
  setMessage(els.profileMessage, "");
  try {
    await sendPasswordResetEmail(auth, normalizeEmail(state.authUser?.email || ""));
    setMessage(els.profileMessage, "Password reset email sent. This recovery path only works when you can access the inbox.", "success");
  } catch (error) {
    setMessage(els.profileMessage, error.message, "error");
  }
}

async function handleHouseholdRenameSubmit(event) {
  event.preventDefault();
  setMessage(els.householdRenameMessage, "");

  if (state.member?.role !== "admin") {
    setMessage(els.householdRenameMessage, "Only the household admin can rename this household.", "error");
    return;
  }

  const name = cleanText(els.householdRenameName.value);
  if (!name) {
    setMessage(els.householdRenameMessage, "Household name is required.", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id), {
      name,
      updatedAt: serverTimestamp()
    });
    setMessage(els.householdRenameMessage, "Household renamed.", "success");
  } catch (error) {
    setMessage(els.householdRenameMessage, getUserErrorMessage(error), "error");
  }
}

async function handleInviteSubmit(event) {
  event.preventDefault();
  setMessage(els.inviteMessage, "");

  if (state.member?.role !== "admin") {
    setMessage(els.inviteMessage, "Only the household admin can generate invite codes.", "error");
    return;
  }

  if (!state.household?.id) {
    setMessage(els.inviteMessage, "Select a household first.", "error");
    return;
  }

  try {
    const inviteCode = await generateUniqueInviteCode();
    const inviteRef = doc(collection(db, "households", state.household.id, "invites"));
    const codeRef = doc(db, "inviteCodes", inviteCode);
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000));
    const payload = {
      householdId: state.household.id,
      householdName: state.household.name,
      inviteId: inviteRef.id,
      inviteCode,
      invitedByUserId: state.authUser.uid,
      status: "pending",
      expiresAt,
      acceptedAt: null,
      acceptedByUserId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    const batch = writeBatch(db);

    batch.set(inviteRef, payload);
    batch.set(codeRef, payload);

    await batch.commit();
    setMessage(els.inviteMessage, `Invite created. Code: ${inviteCode}`, "success");
  } catch (error) {
    setMessage(
      els.inviteMessage,
      getUserErrorMessage(error, {
        permissionMessage: "Firebase denied invite-code generation. Re-publish the latest Firestore rules for the code-only invite flow, then try again."
      }),
      "error"
    );
  }
}

async function handleInviteListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const inviteId = button.dataset.id;
  const invite = state.invites.find(item => item.id === inviteId);
  if (!invite) {
    return;
  }

  if (button.dataset.action === "copy-invite-code") {
    try {
      await copyText(invite.inviteCode);
      setMessage(els.inviteMessage, "Invite code copied.", "success");
    } catch (error) {
      setMessage(els.inviteMessage, "Could not copy the invite code automatically.", "error");
    }
    return;
  }

  if (button.dataset.action === "revoke-invite") {
    if (!window.confirm("Revoke this invite code? The code will stop working immediately.")) {
      return;
    }

    try {
      await revokeInvite(invite);
      setMessage(els.inviteMessage, "Invite revoked.", "success");
    } catch (error) {
      setMessage(
        els.inviteMessage,
        getUserErrorMessage(error, {
          permissionMessage: "Firebase denied invite-code revocation. Re-publish the latest Firestore rules for the code-only invite flow, then try again."
        }),
        "error"
      );
    }
  }
}

async function handleMemberListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.dataset.action !== "remove-member") {
    return;
  }

  const userId = button.dataset.id;
  if (!userId) {
    return;
  }

  try {
    await removeMember(userId);
    setMessage(els.inviteMessage, "Member removed.", "success");
  } catch (error) {
    setMessage(els.inviteMessage, getUserErrorMessage(error), "error");
  }
}

async function handleMasterCodeListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.dataset.action !== "revoke-registration-code") {
    return;
  }

  const code = button.dataset.code;
  if (!code || !window.confirm("Revoke this user creation code? It will stop working immediately.")) {
    return;
  }

  try {
    await revokeRegistrationCode({ code });
    setMessage(els.masterCodeMessage, "Registration code revoked.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterCodeMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterOverrideListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.dataset.action !== "remove-email-override") {
    return;
  }

  const email = button.dataset.email;
  if (!email || !window.confirm("Remove this email override?")) {
    return;
  }

  try {
    await removeEmailOverride({ email });
    setMessage(els.masterOverrideMessage, "Email override removed.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterOverrideMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterBlockedDomainListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.dataset.action !== "remove-blocked-domain") {
    return;
  }

  const domain = button.dataset.domain;
  if (!domain || !window.confirm("Remove this blocked domain?")) {
    return;
  }

  try {
    await removeBlockedEmailDomain({ domain });
    setMessage(els.masterBlockedDomainMessage, "Blocked domain removed.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterBlockedDomainMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterGreetingListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const id = button.dataset.id;
  const quote = state.masterAdmin.greetingQuotes.find(item => item.id === id);
  if (!id || !quote) {
    return;
  }

  if (button.dataset.action === "edit-greeting-quote") {
    els.masterGreetingEditId.value = quote.id;
    els.masterGreetingText.value = quote.text || "";
    els.masterGreetingSubmitBtn.textContent = "Update sentence";
    els.masterGreetingCancelBtn.classList.remove("hidden");
    scrollEditorIntoView(els.masterGreetingForm);
    return;
  }

  if (button.dataset.action !== "remove-greeting-quote") {
    return;
  }

  if (!window.confirm("Remove this sentence from the greeting library?")) {
    return;
  }

  try {
    await removeGreetingQuote({ id });
    setMessage(els.masterGreetingMessage, "Sentence removed.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterGreetingMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function handleMasterDefaultCategoryListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const id = button.dataset.id;
  const category = state.masterAdmin.defaultCategories.find(item => item.id === id);
  if (!id || !category) {
    return;
  }

  if (button.dataset.action === "edit-default-category") {
    els.masterDefaultCategoryEditId.value = category.id;
    els.masterDefaultCategoryName.value = category.name;
    els.masterDefaultCategoryDirection.value = category.direction;
    els.masterDefaultCategoryDescription.value = category.description || "";
    els.masterDefaultCategorySubmitBtn.textContent = "Update category";
    els.masterDefaultCategoryCancelBtn.classList.remove("hidden");
    scrollEditorIntoView(els.masterDefaultCategoryForm);
    return;
  }

  if (button.dataset.action !== "remove-default-category") {
    return;
  }

  if (!window.confirm("Remove this default category?")) {
    return;
  }

  try {
    await removeDefaultCategory({ id });
    setMessage(els.masterDefaultCategoryMessage, "Default category removed.", "success");
    await refreshMasterAdminDashboard();
  } catch (error) {
    setMessage(els.masterDefaultCategoryMessage, getRegistrationErrorMessage(error), "error");
  }
}

async function removeMember(userId) {
  if (!state.household?.id) {
    throw new Error("Select a household first.");
  }
  if (state.member?.role !== "admin") {
    throw new Error("Only the household admin can remove members.");
  }
  if (userId === state.authUser?.uid) {
    throw new Error("You cannot remove yourself from the household.");
  }

  await updateDoc(doc(db, "households", state.household.id, "members", userId), {
    status: "removed",
    updatedAt: serverTimestamp()
  });
}

async function handleBudgetSubmit(event) {
  event.preventDefault();
  setMessage(els.budgetMessage, "");

  const name = cleanText(els.budgetName.value);
  const amountMinor = parseMinorInput(els.budgetAmount.value);
  const cycleType = els.budgetCycleType.value;
  const categoryIds = getSelectedBudgetCategoryIds();
  const startDateValue = els.budgetStartDate.value;
  const endDateValue = els.budgetEndDate.value;
  const editingBudget = state.editBudgetId ? state.budgets.find(item => item.id === state.editBudgetId) : null;
  const scopeType = editingBudget?.scopeType || getCurrentPlanningScopeType();

  if (!name) {
    setMessage(els.budgetMessage, "Budget name is required.", "error");
    return;
  }
  if (!amountMinor) {
    setMessage(els.budgetMessage, "Allocated amount is required.", "error");
    return;
  }
  if (!categoryIds.length) {
    setMessage(els.budgetMessage, "Choose at least one outcome category.", "error");
    return;
  }
  if (!startDateValue) {
    setMessage(els.budgetMessage, "Choose a start date.", "error");
    return;
  }
  if (cycleType === "custom" && !endDateValue) {
    setMessage(els.budgetMessage, "Choose an end date for the custom range.", "error");
    return;
  }
  if (cycleType === "custom" && endDateValue < startDateValue) {
    setMessage(els.budgetMessage, "The end date must be on or after the start date.", "error");
    return;
  }

  const payload = {
    name,
    amountMinor,
    categoryIds,
    cycleType,
    startDate: timestampFromDateInput(startDateValue),
    endDate: cycleType === "custom" ? timestampFromDateInput(endDateValue) : null,
    ...buildScopedPayload(scopeType),
    updatedAt: serverTimestamp()
  };

  try {
    if (editingBudget) {
      await updateDoc(doc(db, "households", state.household.id, "budgets", editingBudget.id), payload);
      resetBudgetForm({ clearMessage: false });
      setMessage(els.budgetMessage, "Budget updated.", "success");
    } else {
      await setDoc(doc(collection(db, "households", state.household.id, "budgets")), {
        ...payload,
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        archivedAt: null
      });
      resetBudgetForm({ clearMessage: false });
      setMessage(els.budgetMessage, getPlanningCreateMessage("Budget", scopeType), "success");
    }
  } catch (error) {
    setMessage(els.budgetMessage, error.message, "error");
  }
}

function handleBudgetListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const budget = state.budgets.find(item => item.id === button.dataset.id);
  if (!budget || !matchesPlanningScope(budget)) {
    return;
  }

  if (button.dataset.action === "edit-budget") {
    state.editBudgetId = budget.id;
    els.budgetEditId.value = budget.id;
    els.budgetName.value = budget.name || "";
    els.budgetHouseholdScope.checked = budget.scopeType === "household";
    setMoneyInputValue(els.budgetAmount, budget.amountMinor);
    els.budgetCycleType.value = budget.cycleType || "monthly";
    els.budgetStartDate.value = toDateInput(budget.startDate || new Date());
    els.budgetEndDate.value = budget.endDate?.toDate ? toDateInput(budget.endDate) : "";
    els.budgetSubmitBtn.textContent = "Update budget";
    els.budgetCancelBtn.classList.remove("hidden");
    syncBudgetForm();
    populateBudgetCategoryOptions();
    scrollEditorIntoView(els.budgetForm);
    return;
  }

  if (button.dataset.action === "delete-budget") {
    void deleteOrArchiveBudget(budget);
  }
}

async function handleSavingSubmit(event) {
  event.preventDefault();
  setMessage(els.savingMessage, "");

  const name = cleanText(els.savingName.value);
  const targetAmountMinor = parseMinorInput(els.savingTargetAmount.value);
  const targetMonthKey = cleanText(els.savingTargetMonth.value);
  const linkedAccountId = els.savingLinkedAccount.value;
  const linkedAccount = state.accounts.find(account => account.id === linkedAccountId && account.status === "active");
  const editingSaving = state.editSavingGoalId ? state.savingGoals.find(item => item.id === state.editSavingGoalId) : null;
  const scopeType = editingSaving?.scopeType || getCurrentPlanningScopeType();

  if (!name) {
    setMessage(els.savingMessage, "Saving name is required.", "error");
    return;
  }
  if (!targetAmountMinor) {
    setMessage(els.savingMessage, "Target amount is required.", "error");
    return;
  }
  if (!targetMonthKey) {
    setMessage(els.savingMessage, "Choose a target month.", "error");
    return;
  }
  if (!linkedAccount) {
    setMessage(els.savingMessage, "Choose an active linked account.", "error");
    return;
  }
  if (scopeType !== "household" && linkedAccount.primaryOwnerUserId !== state.authUser?.uid) {
    setMessage(els.savingMessage, "Personal savings must be linked to one of your own accounts.", "error");
    return;
  }

  const payload = {
    name,
    targetAmountMinor,
    targetMonthKey,
    linkedAccountId: linkedAccount.id,
    linkedAccountNameSnapshot: linkedAccount.name,
    linkedAccountPrimaryOwnerUserIdSnapshot: linkedAccount.primaryOwnerUserId,
    ...buildScopedPayload(scopeType),
    status: editingSaving?.status === "archived" ? "archived" : "active",
    updatedAt: serverTimestamp()
  };

  try {
    if (editingSaving) {
      await updateDoc(doc(db, "households", state.household.id, "savingGoals", editingSaving.id), payload);
      resetSavingForm({ clearMessage: false });
      setMessage(els.savingMessage, "Saving updated.", "success");
    } else {
      await setDoc(doc(collection(db, "households", state.household.id, "savingGoals")), {
        ...payload,
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        archivedAt: null,
        completedAt: null
      });
      resetSavingForm({ clearMessage: false });
      setMessage(els.savingMessage, getPlanningCreateMessage("Saving", scopeType), "success");
    }
  } catch (error) {
    setMessage(els.savingMessage, error.message, "error");
  }
}

function handleSavingListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const goal = state.savingGoals.find(item => item.id === button.dataset.id);
  if (!goal || !matchesPlanningScope(goal)) {
    return;
  }

  if (button.dataset.action === "edit-saving") {
    state.editSavingGoalId = goal.id;
    els.savingEditId.value = goal.id;
    els.savingName.value = goal.name || "";
    els.savingHouseholdScope.checked = goal.scopeType === "household";
    setMoneyInputValue(els.savingTargetAmount, goal.targetAmountMinor);
    els.savingTargetMonth.value = goal.targetMonthKey || "";
    populateSavingSelects();
    setSelectValue(els.savingLinkedAccount, goal.linkedAccountId);
    els.savingSubmitBtn.textContent = "Update saving";
    els.savingCancelBtn.classList.remove("hidden");
    scrollEditorIntoView(els.savingForm);
    return;
  }

  if (button.dataset.action === "complete-saving") {
    void markSavingComplete(goal);
    return;
  }

  if (button.dataset.action === "reopen-saving") {
    void reopenSavingGoal(goal);
    return;
  }

  if (button.dataset.action === "delete-saving") {
    void deleteOrArchiveSaving(goal);
  }
}

async function markSavingComplete(goal) {
  const summary = buildSavingSummary(goal);
  if (!summary.isTargetReached) {
    setMessage(els.savingMessage, "This saving has not reached its target yet.", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "savingGoals", goal.id), {
      status: "completed",
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage(els.savingMessage, "Saving marked complete.", "success");
  } catch (error) {
    setMessage(els.savingMessage, error.message, "error");
  }
}

async function reopenSavingGoal(goal) {
  try {
    await updateDoc(doc(db, "households", state.household.id, "savingGoals", goal.id), {
      status: "active",
      completedAt: null,
      updatedAt: serverTimestamp()
    });
    setMessage(els.savingMessage, "Saving reopened.", "success");
  } catch (error) {
    setMessage(els.savingMessage, error.message, "error");
  }
}

async function handleBillSubmit(event) {
  event.preventDefault();
  setMessage(els.billMessage, "");

  const name = cleanText(els.billName.value);
  const category = state.categories.find(item => item.id === els.billCategory.value && item.status === "active");
  const note = cleanText(els.billNote.value);
  const scheduleType = els.billSchedule.value;
  const anchorDateValue = els.billAnchorDate.value;
  const editingBill = state.editBillId ? state.recurringBills.find(item => item.id === state.editBillId) : null;
  const scopeType = editingBill?.scopeType || getCurrentPlanningScopeType();

  if (!name) {
    setMessage(els.billMessage, "Bill name is required.", "error");
    return;
  }
  if (!category) {
    setMessage(els.billMessage, "Choose an active category.", "error");
    return;
  }
  if (isProtectedSystemCategory(category)) {
    setMessage(els.billMessage, "System categories cannot be used for recurring bills.", "error");
    return;
  }
  if (!anchorDateValue) {
    setMessage(els.billMessage, "Choose the first due date.", "error");
    return;
  }

  const payload = {
    name,
    categoryId: category.id,
    categoryNameSnapshot: category.name,
    note,
    scheduleType,
    anchorDate: timestampFromDateInput(anchorDateValue),
    ...buildScopedPayload(scopeType),
    updatedAt: serverTimestamp()
  };

  try {
    if (editingBill) {
      await updateDoc(doc(db, "households", state.household.id, "recurringBills", editingBill.id), payload);
      resetBillForm({ clearMessage: false });
      setMessage(els.billMessage, "Bill updated.", "success");
    } else {
      await setDoc(doc(collection(db, "households", state.household.id, "recurringBills")), {
        ...payload,
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        archivedAt: null
      });
      resetBillForm({ clearMessage: false });
      setMessage(els.billMessage, getPlanningCreateMessage("Bill", scopeType), "success");
    }
  } catch (error) {
    setMessage(els.billMessage, error.message, "error");
  }
}

function handleBillListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const bill = state.recurringBills.find(item => item.id === button.dataset.id);
  if (!bill || !matchesPlanningScope(bill)) {
    return;
  }

  if (button.dataset.action === "edit-bill") {
    state.openBillMenuId = null;
    openBillEditor(bill);
    return;
  }

  if (button.dataset.action === "delete-bill") {
    state.openBillMenuId = null;
    void deleteOrArchiveBill(bill);
    return;
  }

  if (button.dataset.action === "use-bill-reminder" || button.dataset.action === "pay-bill") {
    const reminder = buildReminderFromAction(bill, button.dataset.occurrenceKey);
    if (reminder) {
      prefillRecurringBillTransaction(reminder);
    }
  }
}

function handleBillReminderActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const billId = button.dataset.id;
  if (button.dataset.action === "toggle-bill-menu") {
    state.openBillMenuId = state.openBillMenuId === billId ? null : billId;
    renderBillRemindersList();
    return;
  }

  const bill = state.recurringBills.find(item => item.id === button.dataset.id);
  if (!bill || !matchesPlanningScope(bill)) {
    return;
  }

  if (button.dataset.action === "edit-bill") {
    state.openBillMenuId = null;
    openBillEditor(bill);
    return;
  }

  if (button.dataset.action === "delete-bill") {
    state.openBillMenuId = null;
    void deleteOrArchiveBill(bill);
    return;
  }

  if (button.dataset.action === "mark-bill-paid") {
    state.openBillMenuId = null;
    const reminder = buildReminderFromAction(bill, button.dataset.occurrenceKey);
    if (reminder) {
      void markBillReminderPaid(reminder);
    }
    return;
  }

  if (button.dataset.action === "use-bill-reminder" || button.dataset.action === "pay-bill") {
    state.openBillMenuId = null;
    const reminder = buildReminderFromAction(bill, button.dataset.occurrenceKey);
    if (reminder) {
      prefillRecurringBillTransaction(reminder);
    }
  }
}

function handleDashboardBillReminderActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const bill = state.recurringBills.find(item => item.id === button.dataset.id);
  if (!bill || !matchesPlanningScope(bill)) {
    return;
  }

  const reminder = buildReminderFromAction(bill, button.dataset.occurrenceKey);
  if (!reminder) {
    return;
  }

  if (button.dataset.action === "pay-dashboard-bill") {
    prefillRecurringBillTransaction(reminder);
    return;
  }

  if (button.dataset.action === "dismiss-dashboard-bill") {
    syncDashboardBillDismissals();
    state.dismissedDashboardBillReminderIds.add(getDashboardBillReminderKey(reminder));
    saveDashboardBillDismissals();
    renderDashboardBillReminders();
  }
}

function openBillEditor(bill) {
  state.editBillId = bill.id;
  els.billEditId.value = bill.id;
  els.billName.value = bill.name || "";
  els.billHouseholdScope.checked = bill.scopeType === "household";
  populateBillCategorySelects();
  setSelectValue(els.billCategory, bill.categoryId);
  els.billSchedule.value = bill.scheduleType || "monthly";
  els.billNote.value = bill.note || "";
  els.billAnchorDate.value = toDateInput(bill.anchorDate || new Date());
  els.billSubmitBtn.textContent = "Update bill";
  els.billCancelBtn.classList.remove("hidden");
}

async function deleteOrArchiveBudget(budget) {
  if (!window.confirm("Archive this budget? It will no longer appear in active planning.")) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "budgets", budget.id), {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage(els.budgetMessage, "Budget archived.", "success");
  } catch (error) {
    setMessage(els.budgetMessage, error.message, "error");
  }
}

async function deleteOrArchiveSaving(goal) {
  if (!window.confirm("Archive this saving? Existing history will stay preserved.")) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "savingGoals", goal.id), {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage(els.savingMessage, "Saving archived.", "success");
  } catch (error) {
    setMessage(els.savingMessage, error.message, "error");
  }
}

async function deleteOrArchiveBill(bill) {
  if (!window.confirm("Archive this recurring bill? Existing reminder history will stay preserved.")) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "recurringBills", bill.id), {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage(els.billMessage, "Bill archived.", "success");
  } catch (error) {
    setMessage(els.billMessage, error.message, "error");
  }
}

async function handleInvestmentSubmit(event) {
  event.preventDefault();
  setMessage(els.investmentMessage, "");

  const name = cleanText(els.investmentName.value);
  const currentValueMinor = parseMinorInput(els.investmentCurrentValue.value) || 0;
  const initialDepositMinor = parseMinorInput(els.investmentInitialDeposit?.value) || 0;
  const initialWithdrawalMinor = parseMinorInput(els.investmentInitialWithdrawal?.value) || 0;
  const note = cleanText(els.investmentNote.value);
  const editingInvestment = state.editInvestmentId
    ? state.investmentAccounts.find(item => item.id === state.editInvestmentId)
    : null;
  const scopeType = editingInvestment?.scopeType || getCurrentPlanningScopeType();

  if (!name) {
    setMessage(els.investmentMessage, "Investment name is required.", "error");
    return;
  }

  const payload = {
    name,
    note,
    useAssetBreakdown: false,
    currentValueMinor,
    ...buildScopedPayload(scopeType),
    updatedAt: serverTimestamp()
  };

  setButtonLoading(els.investmentSubmitBtn, true, editingInvestment ? "Updating..." : "Saving...");
  try {
    if (editingInvestment) {
      await updateDoc(doc(db, "households", state.household.id, "investmentAccounts", editingInvestment.id), payload);
      if (Number(editingInvestment.currentValueMinor || 0) !== currentValueMinor) {
        await addInvestmentEvent({
          investment: { ...editingInvestment, ...payload },
          eventType: "valuation_update",
          amountMinor: currentValueMinor,
          note: "Investment value updated.",
          ledgerTransactionId: null,
          transactionGroupId: null
        });
      }
      resetInvestmentForm({ clearMessage: false });
      setMessage(els.investmentMessage, "Portfolio updated.", "success");
    } else {
      const investmentRef = doc(collection(db, "households", state.household.id, "investmentAccounts"));
      const investmentPayload = {
        ...payload,
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        archivedAt: null
      };
      const batch = writeBatch(db);
      batch.set(investmentRef, investmentPayload);
      if (initialDepositMinor) {
        batch.set(doc(collection(db, "households", state.household.id, "investmentEvents")), buildInvestmentEventPayload({
          investment: { id: investmentRef.id, ...investmentPayload },
          eventType: "deposit",
          amountMinor: initialDepositMinor,
          note: "Initial total deposits.",
          ledgerAccount: null,
          ledgerTransactionId: null,
          transactionGroupId: null
        }));
      }
      if (initialWithdrawalMinor) {
        batch.set(doc(collection(db, "households", state.household.id, "investmentEvents")), buildInvestmentEventPayload({
          investment: { id: investmentRef.id, ...investmentPayload },
          eventType: "withdrawal",
          amountMinor: initialWithdrawalMinor,
          note: "Initial total withdrawals.",
          ledgerAccount: null,
          ledgerTransactionId: null,
          transactionGroupId: null
        }));
      }
      await batch.commit();
      resetInvestmentForm({ clearMessage: false });
      setMessage(els.investmentMessage, getPlanningCreateMessage("Portfolio", scopeType), "success");
    }
  } catch (error) {
    setMessage(els.investmentMessage, getUserErrorMessage(error), "error");
  } finally {
    setButtonLoading(els.investmentSubmitBtn, false);
  }
}

function handleInvestmentListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "edit-investment-asset" || button.dataset.action === "archive-investment-asset") {
    const asset = state.investmentAssets.find(item => item.id === button.dataset.id);
    if (!asset) {
      return;
    }
    if (button.dataset.action === "edit-investment-asset") {
      openInvestmentAssetEditor(asset);
    } else {
      void archiveInvestmentAsset(asset);
    }
    return;
  }

  const investment = state.investmentAccounts.find(item => item.id === button.dataset.id);
  if (!investment || !matchesPlanningScope(investment)) {
    return;
  }

  if (button.dataset.action === "edit-investment") {
    openInvestmentEditor(investment);
    return;
  }

  if (button.dataset.action === "toggle-investment-scope") {
    void toggleInvestmentScope(investment);
    return;
  }

  if (button.dataset.action === "archive-investment") {
    void archiveInvestment(investment);
  }
}

function handleInvestmentActivityActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const eventId = button.dataset.id || "";
  const investmentEvent = state.investmentEvents.find(item => item.id === eventId);
  if (button.dataset.action === "toggle-investment-event-menu") {
    state.openInvestmentEventMenuId = state.openInvestmentEventMenuId === eventId ? null : eventId;
    renderInvestmentsView();
    return;
  }
  if (!investmentEvent) {
    return;
  }
  if (button.dataset.action === "edit-investment-event") {
    openInvestmentEventEditor(investmentEvent);
    return;
  }
  if (button.dataset.action === "delete-investment-event") {
    void deleteInvestmentEvent(investmentEvent);
  }
}

function openInvestmentEventEditor(eventRecord) {
  const investment = state.investmentAccounts.find(item => item.id === eventRecord.investmentAccountId);
  if (!investment || !matchesPlanningScope(investment)) {
    setMessage(els.investmentMovementMessage, "Choose a visible investment account.", "error");
    return;
  }
  state.editInvestmentEventId = eventRecord.id;
  state.openInvestmentEventMenuId = null;
  els.investmentMovementAccount.value = investment.id;
  els.investmentMovementType.value = eventRecord.eventType === "withdrawal" ? "withdrawal" : "deposit";
  populateInvestmentSelects();
  if (eventRecord.ledgerAccountId) {
    setSelectValue(els.investmentMovementLedgerAccount, eventRecord.ledgerAccountId);
  }
  els.investmentMovementDate.value = toDateInput(eventRecord.transactionAt?.toDate ? eventRecord.transactionAt.toDate() : new Date());
  setMoneyInputValue(els.investmentMovementAmount, eventRecord.amountMinor || 0);
  els.investmentMovementNote.value = eventRecord.note || "";
  els.investmentMovementSubmitBtn.textContent = "Update investment transaction";
  renderInvestmentsView();
  scrollEditorIntoView(els.investmentMovementForm);
}

async function deleteInvestmentEvent(eventRecord) {
  if (!window.confirm("Delete this investment activity? Linked ledger rows will be voided when possible.")) {
    return;
  }
  const investment = state.investmentAccounts.find(item => item.id === eventRecord.investmentAccountId);
  if (!investment) {
    return;
  }
  const delta = eventRecord.eventType === "withdrawal"
    ? Number(eventRecord.amountMinor || 0)
    : eventRecord.eventType === "deposit" || eventRecord.eventType === "contribution"
      ? -Number(eventRecord.amountMinor || 0)
      : 0;
  const batch = writeBatch(db);
  batch.update(doc(db, "households", state.household.id, "investmentEvents", eventRecord.id), {
    status: "deleted",
    deletedAt: serverTimestamp(),
    deletedByUserId: state.authUser.uid,
    updatedAt: serverTimestamp()
  });
  if (delta) {
    batch.update(doc(db, "households", state.household.id, "investmentAccounts", investment.id), {
      currentValueMinor: Math.max(0, Number(investment.currentValueMinor || 0) + delta),
      updatedAt: serverTimestamp()
    });
  }
  if (eventRecord.ledgerTransactionId) {
    const row = state.transactionsRaw.find(item => item.id === eventRecord.ledgerTransactionId);
    if (row?.ref) {
      batch.update(row.ref, {
        status: "deleted",
        deletedAt: serverTimestamp(),
        deletedByUserId: state.authUser.uid,
        updatedAt: serverTimestamp()
      });
    }
  }
  try {
    await batch.commit();
    setMessage(els.investmentMovementMessage, "Investment activity deleted.", "success");
  } catch (error) {
    setMessage(els.investmentMovementMessage, getUserErrorMessage(error), "error");
  }
}

async function toggleInvestmentScope(investment) {
  const moveToHousehold = investment.scopeType !== "household";
  const message = moveToHousehold
    ? "Move this portfolio to Household view? Future investment activity will be shared with the household."
    : "Move this portfolio to My view? Future investment activity will belong to you only.";
  if (!window.confirm(message)) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "investmentAccounts", investment.id), {
      scopeType: moveToHousehold ? "household" : "personal",
      ownerUserId: moveToHousehold ? null : state.authUser.uid,
      updatedAt: serverTimestamp()
    });
    setMessage(els.investmentMessage, moveToHousehold ? "Portfolio moved to Household view." : "Portfolio moved to My view.", "success");
  } catch (error) {
    setMessage(els.investmentMessage, getUserErrorMessage(error), "error");
  }
}

function openInvestmentEditor(investment) {
  state.editInvestmentId = investment.id;
  state.showInvestmentForm = true;
  els.investmentEditId.value = investment.id;
  els.investmentName.value = investment.name || "";
  setMoneyInputValue(els.investmentCurrentValue, investment.currentValueMinor || 0);
  setMoneyInputValue(els.investmentInitialDeposit, 0);
  setMoneyInputValue(els.investmentInitialWithdrawal, 0);
  els.investmentUseAssets.checked = Boolean(investment.useAssetBreakdown);
  els.investmentNote.value = investment.note || "";
  els.investmentSubmitBtn.textContent = "Update portfolio";
  els.investmentCancelBtn.classList.remove("hidden");
  syncInvestmentForm();
  scrollEditorIntoView(els.investmentForm);
}

async function archiveInvestment(investment) {
  if (!window.confirm("Archive this investment account? Existing history will remain visible in exports later.")) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "investmentAccounts", investment.id), {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage(els.investmentMessage, "Investment archived.", "success");
  } catch (error) {
    setMessage(els.investmentMessage, getUserErrorMessage(error), "error");
  }
}

async function handleInvestmentMovementSubmit(event) {
  event.preventDefault();
  setMessage(els.investmentMovementMessage, "");

  const investment = state.investmentAccounts.find(item => item.id === els.investmentMovementAccount.value && item.status === "active");
  const ledgerAccount = getInvestmentMovementAccountOptions(investment, els.investmentMovementType.value)
    .find(item => item.id === els.investmentMovementLedgerAccount.value);
  const eventType = els.investmentMovementType.value;
  const amountMinor = parseMinorInput(els.investmentMovementAmount.value);
  const editingEvent = state.editInvestmentEventId
    ? state.investmentEvents.find(item => item.id === state.editInvestmentEventId)
    : null;
  const feeMinor = editingEvent ? 0 : (els.investmentMovementFeeEnabled?.checked ? parseMinorInput(els.investmentMovementFeeAmount?.value) : 0);
  const note = cleanText(els.investmentMovementNote.value) || (eventType === "withdrawal" ? "Investment withdrawal" : "Investment deposit");
  const transactionAt = Timestamp.fromDate(new Date(`${els.investmentMovementDate.value || toDateInput(new Date())}T12:00:00`));

  if (!investment || !matchesPlanningScope(investment)) {
    setMessage(els.investmentMovementMessage, "Choose a visible investment account.", "error");
    return;
  }
  if (!ledgerAccount) {
    setMessage(els.investmentMovementMessage, "Choose an available cash account.", "error");
    return;
  }
  if (!amountMinor) {
    setMessage(els.investmentMovementMessage, "Amount is required.", "error");
    return;
  }
  if (editingEvent && editingEvent.investmentAccountId !== investment.id) {
    setMessage(els.investmentMovementMessage, "Edit the selected portfolio's activity without changing the portfolio.", "error");
    return;
  }

  setButtonLoading(els.investmentMovementSubmitBtn, true, editingEvent ? "Updating..." : "Saving...");
  try {
    const category = getInvestmentCategory(eventType);
    if (!category) {
      throw new Error("Investment system categories are not ready yet. Wait a moment, then try again.");
    }
    if (eventType === "deposit") {
      assertRegularAccountSpendAllowed(ledgerAccount.id, amountMinor + feeMinor);
    }
    if (eventType === "withdrawal" && feeMinor) {
      assertRegularAccountSpendAllowed(ledgerAccount.id, feeMinor);
    }
    if (eventType === "withdrawal" && Number(investment.currentValueMinor || 0) < amountMinor) {
      throw new Error("This withdrawal is higher than the current investment value.");
    }

    if (editingEvent) {
      const oldEffect = getInvestmentEventValueEffect(editingEvent);
      const newEffect = eventType === "withdrawal" ? -amountMinor : amountMinor;
      const batch = writeBatch(db);
      const transactionRow = state.transactionsRaw.find(row => row.id === editingEvent.ledgerTransactionId);
      if (transactionRow?.ref) {
        batch.update(transactionRow.ref, {
          displayKind: eventType === "withdrawal" ? "income" : "outcome",
          postingKind: eventType === "withdrawal" ? "income" : "outcome",
          accountId: ledgerAccount.id,
          accountNameSnapshot: ledgerAccount.name,
          accountPrimaryOwnerUserIdSnapshot: ledgerAccount.primaryOwnerUserId,
          categoryId: category.id,
          categoryNameSnapshot: category.name,
          amountMinor,
          transactionAt,
          note,
          updatedAt: serverTimestamp()
        });
      }
      batch.update(doc(db, "households", state.household.id, "investmentAccounts", investment.id), {
        currentValueMinor: Math.max(0, Number(investment.currentValueMinor || 0) - oldEffect + newEffect),
        updatedAt: serverTimestamp()
      });
      batch.update(doc(db, "households", state.household.id, "investmentEvents", editingEvent.id), {
        eventType,
        amountMinor,
        note,
        ledgerAccountId: ledgerAccount.id,
        ledgerAccountNameSnapshot: ledgerAccount.name,
        transactionAt,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      resetInvestmentMovementForm({ clearMessage: false });
      setMessage(els.investmentMovementMessage, "Investment activity updated.", "success");
      return;
    }

    const transactionRef = doc(collection(db, "households", state.household.id, "transactions"));
    const batch = writeBatch(db);
    batch.set(transactionRef, buildSingleRow({
      id: transactionRef.id,
      kind: eventType === "withdrawal" ? "income" : "outcome",
      amountMinor,
      note,
      transactionAt,
      account: ledgerAccount,
      category,
      investmentAccountId: investment.id
    }));
    maybeAddFeeRowToBatch(batch, {
      transactionCollection: collection(db, "households", state.household.id, "transactions"),
      feeMinor,
      note,
      fallbackNote: category.name,
      transactionAt,
      account: ledgerAccount
    });

    const nextValueMinor = Math.max(0, Number(investment.currentValueMinor || 0) + (eventType === "withdrawal" ? -amountMinor : amountMinor));
    batch.update(doc(db, "households", state.household.id, "investmentAccounts", investment.id), {
      currentValueMinor: nextValueMinor,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "households", state.household.id, "investmentEvents")), buildInvestmentEventPayload({
      investment,
      eventType,
      amountMinor,
      note,
      ledgerAccount,
      ledgerTransactionId: transactionRef.id,
      transactionGroupId: transactionRef.id,
      transactionAt
    }));
    await batch.commit();

    resetInvestmentMovementForm({ clearMessage: false });
    setMessage(els.investmentMovementMessage, "Investment movement saved.", "success");
  } catch (error) {
    setMessage(els.investmentMovementMessage, getUserErrorMessage(error), "error");
  } finally {
    setButtonLoading(els.investmentMovementSubmitBtn, false);
  }
}

async function handleInvestmentAssetSubmit(event) {
  event.preventDefault();
  setMessage(els.investmentAssetMessage, "");

  const investment = state.investmentAccounts.find(item => item.id === els.investmentAssetAccount.value && item.status === "active");
  const name = cleanText(els.investmentAssetName.value);
  const assetType = cleanText(els.investmentAssetType.value);
  const currentValueMinor = parseMinorInput(els.investmentAssetValue.value);
  const note = cleanText(els.investmentAssetNote.value);
  const editingAsset = state.editInvestmentAssetId
    ? state.investmentAssets.find(item => item.id === state.editInvestmentAssetId)
    : null;

  if (!investment || !matchesPlanningScope(investment)) {
    setMessage(els.investmentAssetMessage, "Choose a visible investment account.", "error");
    return;
  }
  if (!investment.useAssetBreakdown) {
    setMessage(els.investmentAssetMessage, "Turn on asset breakdown for this investment before adding assets.", "error");
    return;
  }
  if (!name) {
    setMessage(els.investmentAssetMessage, "Asset name is required.", "error");
    return;
  }
  if (!currentValueMinor) {
    setMessage(els.investmentAssetMessage, "Asset value is required.", "error");
    return;
  }

  const payload = {
    investmentAccountId: investment.id,
    investmentAccountNameSnapshot: investment.name,
    name,
    assetType,
    currentValueMinor,
    note,
    ...buildScopedPayload(investment.scopeType, investment.ownerUserId || null),
    updatedAt: serverTimestamp()
  };

  try {
    if (editingAsset) {
      await updateDoc(doc(db, "households", state.household.id, "investmentAssets", editingAsset.id), payload);
      await addInvestmentEvent({
        investment,
        eventType: "asset_update",
        amountMinor: currentValueMinor,
        note: `Asset updated: ${name}`,
        ledgerTransactionId: null,
        transactionGroupId: null
      });
      resetInvestmentAssetForm({ clearMessage: false });
      setMessage(els.investmentAssetMessage, "Asset updated.", "success");
    } else {
      await setDoc(doc(collection(db, "households", state.household.id, "investmentAssets")), {
        ...payload,
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        archivedAt: null
      });
      await addInvestmentEvent({
        investment,
        eventType: "asset_update",
        amountMinor: currentValueMinor,
        note: `Asset added: ${name}`,
        ledgerTransactionId: null,
        transactionGroupId: null
      });
      resetInvestmentAssetForm({ clearMessage: false });
      setMessage(els.investmentAssetMessage, "Asset saved.", "success");
    }
  } catch (error) {
    setMessage(els.investmentAssetMessage, getUserErrorMessage(error), "error");
  }
}

function openInvestmentAssetEditor(asset) {
  state.editInvestmentAssetId = asset.id;
  els.investmentAssetEditId.value = asset.id;
  setSelectValue(els.investmentAssetAccount, asset.investmentAccountId);
  els.investmentAssetName.value = asset.name || "";
  els.investmentAssetType.value = asset.assetType || "";
  setMoneyInputValue(els.investmentAssetValue, asset.currentValueMinor || 0);
  els.investmentAssetNote.value = asset.note || "";
  els.investmentAssetSubmitBtn.textContent = "Update asset";
  els.investmentAssetCancelBtn.classList.remove("hidden");
  scrollEditorIntoView(els.investmentAssetForm);
}

async function archiveInvestmentAsset(asset) {
  if (!window.confirm("Archive this investment asset?")) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "investmentAssets", asset.id), {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage(els.investmentAssetMessage, "Asset archived.", "success");
  } catch (error) {
    setMessage(els.investmentAssetMessage, getUserErrorMessage(error), "error");
  }
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  setMessage(els.accountMessage, "");

  const name = cleanText(els.accountName.value);
  const editingAccount = state.editAccountId
    ? state.accounts.find(account => account.id === state.editAccountId)
    : null;
  const primaryOwnerUserId = editingAccount?.primaryOwnerUserId || state.authUser?.uid || "";

  if (!name) {
    setMessage(els.accountMessage, "Account name is required.", "error");
    return;
  }

  if (!primaryOwnerUserId) {
    setMessage(els.accountMessage, "Each account must have an owner.", "error");
    return;
  }

  if (state.editAccountId && !editingAccount) {
    setMessage(els.accountMessage, "Choose an existing account to edit.", "error");
    return;
  }

  try {
    if (state.editAccountId) {
      await updateDoc(doc(db, "households", state.household.id, "accounts", state.editAccountId), {
        name,
        updatedAt: serverTimestamp()
      });
      setMessage(els.accountMessage, "Account name updated.", "success");
    } else {
      const openingBalanceMinor = parseMinorInput(els.accountOpeningBalance.value);
      await setDoc(doc(collection(db, "households", state.household.id, "accounts")), {
        name,
        primaryOwnerUserId,
        openingBalanceMinor,
        openingBalanceAt: Timestamp.fromDate(new Date()),
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setMessage(els.accountMessage, "Account created.", "success");
    }

    resetAccountForm();
  } catch (error) {
    setMessage(els.accountMessage, error.message, "error");
  }
}

function handleAccountListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const account = state.accounts.find(item => item.id === button.dataset.id);
  if (!account) {
    return;
  }

  if (button.dataset.action === "edit-account") {
    if (!canEditAccount(account)) {
      setMessage(els.accountMessage, "Only the account owner or a household admin can edit this account.", "error");
      return;
    }

    state.editAccountId = account.id;
    els.accountEditId.value = account.id;
    els.accountName.value = account.name;
    setMoneyInputValue(els.accountOpeningBalance, account.openingBalanceMinor);
    syncAccountOpeningBalanceField();
    syncAccountOwnerInput();
    els.accountSubmitBtn.textContent = "Update account name";
    els.accountCancelBtn.classList.remove("hidden");
    return;
  }

  if (button.dataset.action === "archive-account") {
    archiveAccount(account.id);
    return;
  }

  if (button.dataset.action === "prefill-adjustment") {
    els.adjustAccount.value = account.id;
    els.adjustActualBalance.focus();
  }
}

async function archiveAccount(accountId) {
  const account = state.accounts.find(item => item.id === accountId);
  if (!canEditAccount(account)) {
    setMessage(els.accountMessage, "Only the account owner or a household admin can archive this account.", "error");
    return;
  }

  const linkedSaving = state.savingGoals.find(goal => goal.status !== "archived" && goal.linkedAccountId === accountId);
  if (linkedSaving) {
    setMessage(els.accountMessage, "This account is still linked to an active saving goal. Update or archive that saving first.", "error");
    return;
  }

  if (!window.confirm("Archive this account? It will no longer appear in new transactions.")) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "accounts", accountId), {
      status: "archived",
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    setMessage(els.accountMessage, error.message, "error");
  }
}

async function handleAdjustmentSubmit(event) {
  event.preventDefault();
  setMessage(els.adjustmentMessage, "");

  const accountId = els.adjustAccount.value;
  const actualBalanceMinor = parseMinorInput(els.adjustActualBalance.value);
  const note = cleanText(els.adjustNote.value) || "Balance correction";
  const account = state.accounts.find(item => item.id === accountId && item.status === "active");

  if (!account) {
    setMessage(els.adjustmentMessage, "Choose an active account to adjust.", "error");
    return;
  }
  if (actualBalanceMinor < 0) {
    setMessage(els.adjustmentMessage, "Balance correction cannot set an account below zero.", "error");
    return;
  }

  const balances = computeAccountBalances();
  const currentBalanceMinor = balances.get(accountId) || 0;
  const reservedSavingMinor = getReservedSavingMinorForAccount(accountId);
  const delta = actualBalanceMinor - currentBalanceMinor;

  if (actualBalanceMinor < reservedSavingMinor) {
    setMessage(els.adjustmentMessage, "Balance correction cannot reduce an account below the amount reserved in savings.", "error");
    return;
  }

  if (delta === 0) {
    setMessage(els.adjustmentMessage, "That account already matches the balance you entered.", "error");
    return;
  }

  try {
    const transactionRef = doc(collection(db, "households", state.household.id, "transactions"));
    await setDoc(transactionRef, buildAdjustmentRow({
      id: transactionRef.id,
      account,
      amountMinor: Math.abs(delta),
      postingKind: delta > 0 ? "adjustment_increase" : "adjustment_decrease",
      note
    }));

    els.adjustActualBalance.value = "";
    els.adjustNote.value = "";
    setMessage(els.adjustmentMessage, "Balance correction created.", "success");
  } catch (error) {
    setMessage(els.adjustmentMessage, error.message, "error");
  }
}

async function handleCategorySubmit(event) {
  event.preventDefault();
  setMessage(els.categoryMessage, "");

  const name = cleanText(els.categoryName.value);
  const description = cleanText(els.categoryDescription.value);
  const direction = els.categoryDirection.value;

  if (!name) {
    setMessage(els.categoryMessage, "Category name is required.", "error");
    return;
  }
  if (cleanText(name).toLowerCase() === "saving") {
    setMessage(els.categoryMessage, "The Saving category is managed automatically by the app.", "error");
    return;
  }
  if (!state.editCategoryId && getActiveManualCategoryCount() >= 50) {
    setMessage(els.categoryMessage, "You can keep up to 50 active categories. Archive one first before creating another.", "error");
    return;
  }

  try {
    if (state.editCategoryId) {
      await updateDoc(doc(db, "households", state.household.id, "categories", state.editCategoryId), {
        name,
        description,
        direction,
        updatedAt: serverTimestamp()
      });
      setMessage(els.categoryMessage, "Category updated.", "success");
    } else {
      await setDoc(doc(collection(db, "households", state.household.id, "categories")), {
        name,
        description,
        direction,
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setMessage(els.categoryMessage, "Category created.", "success");
    }

    resetCategoryForm();
  } catch (error) {
    setMessage(els.categoryMessage, error.message, "error");
  }
}

async function handleCategoryCsvImport(event) {
  setMessage(els.categoryMessage, "");
  const fileInput = event.target;
  const file = fileInput.files?.[0] || null;
  if (!file) {
    return;
  }

  try {
    if (!state.household?.id || !state.authUser) {
      setMessage(els.categoryMessage, "Open a household first.", "error");
      return;
    }

    const text = await file.text();
    const result = parseCategoryCsv(text);
    if (result.errors.length) {
      setMessage(els.categoryMessage, `CSV import stopped. ${result.errors.slice(0, 4).join(" ")}`, "error");
      return;
    }

    const activeManualCount = getActiveManualCategoryCount();
    const existingKeys = new Set(
      state.categories
        .filter(category => category.status === "active" && !isProtectedSystemCategory(category))
        .map(category => getCategoryImportKey(category))
    );
    const seenKeys = new Set();
    const categoriesToCreate = [];
    let skippedCount = 0;

    result.categories.forEach(category => {
      const key = getCategoryImportKey(category);
      if (existingKeys.has(key) || seenKeys.has(key)) {
        skippedCount += 1;
        return;
      }
      seenKeys.add(key);
      categoriesToCreate.push(category);
    });

    if (!categoriesToCreate.length) {
      setMessage(els.categoryMessage, skippedCount
        ? `No new categories imported. Skipped ${skippedCount} duplicate row${skippedCount === 1 ? "" : "s"}.`
        : "No categories found in the CSV.", "error");
      return;
    }

    if (activeManualCount + categoriesToCreate.length > 50) {
      setMessage(els.categoryMessage, `CSV import would exceed the 50 active category limit. You can import up to ${Math.max(0, 50 - activeManualCount)} more.`, "error");
      return;
    }

    const batch = writeBatch(db);
    categoriesToCreate.forEach(category => {
      const categoryRef = doc(collection(db, "households", state.household.id, "categories"));
      batch.set(categoryRef, {
        name: category.name,
        description: category.description,
        direction: category.direction,
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    setMessage(els.categoryMessage, `Imported ${categoriesToCreate.length} categor${categoriesToCreate.length === 1 ? "y" : "ies"}.${skippedCount ? ` Skipped ${skippedCount} duplicate row${skippedCount === 1 ? "" : "s"}.` : ""}`, "success");
  } catch (error) {
    setMessage(els.categoryMessage, error.message, "error");
  } finally {
    fileInput.value = "";
  }
}

function handleCategoryListActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const category = state.categories.find(item => item.id === button.dataset.id);
  if (!category) {
    return;
  }

  if (button.dataset.action === "edit-category") {
    if (isProtectedSystemCategory(category)) {
      setMessage(els.categoryMessage, "System categories are managed by the app and cannot be edited.", "error");
      return;
    }
    state.editCategoryId = category.id;
    els.categoryEditId.value = category.id;
    els.categoryName.value = category.name;
    els.categoryDescription.value = category.description || "";
    els.categoryDirection.value = category.direction;
    els.categorySubmitBtn.textContent = "Update category";
    els.categoryCancelBtn.classList.remove("hidden");
    scrollEditorIntoView(els.categoryForm);
    return;
  }

  if (button.dataset.action === "archive-category") {
    archiveCategory(category.id);
  }
}

async function archiveCategory(categoryId) {
  const category = state.categories.find(item => item.id === categoryId);
  if (isProtectedSystemCategory(category)) {
    setMessage(els.categoryMessage, "System categories are required by NestPlan and cannot be archived.", "error");
    return;
  }

  const linkedBill = state.recurringBills.find(bill => bill.status !== "archived" && bill.categoryId === categoryId);
  if (linkedBill) {
    setMessage(els.categoryMessage, "This category is still used by an active recurring bill. Update or archive that bill first.", "error");
    return;
  }

  const linkedBudget = state.budgets.find(budget => budget.status !== "archived" && sanitizeStringArray(budget.categoryIds).includes(categoryId));
  if (linkedBudget) {
    setMessage(els.categoryMessage, "This category is still used by an active budget. Update or archive that budget first.", "error");
    return;
  }

  if (!window.confirm("Archive this category? It will no longer be available for new transactions.")) {
    return;
  }

  try {
    await updateDoc(doc(db, "households", state.household.id, "categories", categoryId), {
      status: "archived",
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    setMessage(els.categoryMessage, error.message, "error");
  }
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  setMessage(els.transactionMessage, "");

  const kind = els.transactionKind.value;
  const amountMinor = parseMinorInput(els.transactionAmount.value);
  const feeMinor = getTransactionFeeMinor();
  const note = getTransactionNoteValue(kind);
  const transactionAt = Timestamp.fromDate(new Date(`${els.transactionDate.value}T12:00:00`));

  if (!amountMinor) {
    setMessage(els.transactionMessage, "Amount is required.", "error");
    return;
  }

  try {
    if (kind === "transfer") {
      await saveTransferTransaction({ amountMinor, feeMinor, note, transactionAt });
    } else {
      await saveSingleTransaction({ kind, amountMinor, feeMinor, note, transactionAt });
    }

    const budgetWarning = buildBudgetWarningAfterSave({ kind, amountMinor, transactionAt });
    const successMessage = state.editTransactionGroupId ? "Transaction updated." : "Transaction saved.";
    setMessage(els.transactionMessage, budgetWarning ? `${successMessage} ${budgetWarning}` : successMessage, budgetWarning ? "error" : "success");
    resetTransactionForm();
  } catch (error) {
    setMessage(
      els.transactionMessage,
      isPermissionDeniedError(error)
        ? buildTransactionPermissionDeniedMessage({ kind, feeMinor })
        : error.message,
      "error"
    );
  }
}

function buildTransactionPermissionDeniedMessage({ kind, feeMinor = 0 }) {
  if (firebaseEnvironment !== "staging") {
    return "Firebase denied this transaction. Check that the selected account, saving, category, and fee are still active, then try again.";
  }

  const parts = ["Firebase denied this transaction."];
  if (kind === "transfer") {
    const fromSelection = resolveTransferSourceSelection(els.transferFromAccount.value);
    const toSelection = resolveTransferDestinationSelection(els.transferToAccount.value);
    if (toSelection.savingGoal) {
      const sameAccount = fromSelection.account?.id && fromSelection.account.id === toSelection.account?.id;
      parts.push(sameAccount
        ? "Attempted same-account saving reserve transfer."
        : "Attempted transfer into a saving.");
      parts.push(`Saving status: ${toSelection.savingGoal.status || "unknown"}.`);
    } else {
      parts.push("Attempted normal transfer.");
    }
  } else {
    const accountSelection = resolveTransactionAccountSelection(els.transactionAccount.value);
    if (accountSelection.savingGoal) {
      parts.push("Attempted spending from a saving.");
      parts.push(`Saving status: ${accountSelection.savingGoal.status || "unknown"}.`);
    } else {
      parts.push(`Attempted ${kind}.`);
    }
  }
  if (feeMinor) {
    parts.push("A transaction fee row was included.");
  }
  parts.push("Retest once; if it repeats, send this whole message.");
  return parts.join(" ");
}

async function saveSingleTransaction({ kind, amountMinor, feeMinor = 0, note, transactionAt }) {
  const accountSelection = resolveTransactionAccountSelection(els.transactionAccount.value);
  const account = accountSelection.account;
  const category = state.categories.find(item => item.id === els.transactionCategory.value && item.status === "active");
  const planningSelection = resolveSingleTransactionPlanningSelection(kind, category, account, accountSelection);
  const baseRows = getActiveRowsExcludingTransactionGroup(state.editTransactionGroupId);

  if (!account || !category) {
    throw new Error("Choose an active account and category.");
  }

  if (!isCategoryAllowedForKind(category, kind)) {
    throw new Error("That category direction does not match the selected transaction type.");
  }

  if (kind === "outcome") {
    if (planningSelection.savingGoalId && !isSavingCategory(category)) {
      const goal = state.savingGoals.find(item => item.id === planningSelection.savingGoalId && item.status !== "archived");
      assertSavingSpendAllowed(goal, amountMinor, baseRows);
      if (feeMinor) {
        assertRegularAccountSpendAllowed(account.id, feeMinor, baseRows);
      }
    } else {
      assertRegularAccountSpendAllowed(account.id, amountMinor + feeMinor, baseRows);
    }
  }

  if (state.editTransactionGroupId) {
    const entry = getGroupedEntriesAll().find(item => item.groupId === state.editTransactionGroupId);
    if (!entry || entry.kind !== kind || entry.rows.length !== 1) {
      throw new Error("This transaction can no longer be edited in place.");
    }

    await updateDoc(entry.rows[0].ref, {
      displayKind: kind,
      postingKind: kind,
      accountId: account.id,
      accountNameSnapshot: account.name,
      accountPrimaryOwnerUserIdSnapshot: account.primaryOwnerUserId,
      counterpartyAccountId: null,
      counterpartyAccountNameSnapshot: null,
      counterpartyAccountPrimaryOwnerUserIdSnapshot: null,
      categoryId: category.id,
      categoryNameSnapshot: category.name,
      amountMinor,
      transactionAt,
      note: planningSelection.note,
      savingGoalId: planningSelection.savingGoalId,
      recurringBillId: planningSelection.recurringBillId,
      recurringBillOccurrenceId: planningSelection.recurringBillOccurrenceId,
      updatedAt: serverTimestamp()
    });
    if (entry.rows[0].recurringBillOccurrenceId && entry.rows[0].recurringBillOccurrenceId !== planningSelection.recurringBillOccurrenceId) {
      await setDoc(doc(db, "households", state.household.id, "recurringBillOccurrences", entry.rows[0].recurringBillOccurrenceId), {
        status: "voided",
        voidedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await syncRecurringBillOccurrenceAfterSave({
      transactionId: entry.rows[0].id,
      transactionGroupId: entry.groupId,
      transactionAt,
      recurringBillId: planningSelection.recurringBillId,
      recurringBillOccurrenceId: planningSelection.recurringBillOccurrenceId
    });
    return;
  }

  const transactionCollection = collection(db, "households", state.household.id, "transactions");
  const transactionRef = doc(transactionCollection);
  const batch = writeBatch(db);
  batch.set(transactionRef, buildSingleRow({
    id: transactionRef.id,
    kind,
    amountMinor,
    note: planningSelection.note,
    transactionAt,
    account,
    category,
    savingGoalId: planningSelection.savingGoalId,
    recurringBillId: planningSelection.recurringBillId,
    recurringBillOccurrenceId: planningSelection.recurringBillOccurrenceId
  }));
  maybeAddFeeRowToBatch(batch, {
    transactionCollection,
    feeMinor,
    note: planningSelection.note,
    fallbackNote: category.name,
    transactionAt,
    account
  });
  await batch.commit();
  await syncRecurringBillOccurrenceAfterSave({
    transactionId: transactionRef.id,
    transactionGroupId: transactionRef.id,
    transactionAt,
    recurringBillId: planningSelection.recurringBillId,
    recurringBillOccurrenceId: planningSelection.recurringBillOccurrenceId
  });
}

async function saveTransferTransaction({ amountMinor, feeMinor = 0, note, transactionAt }) {
  const fromSelection = resolveTransferSourceSelection(els.transferFromAccount.value);
  const fromAccount = fromSelection.account;
  const toSelection = resolveTransferDestinationSelection(els.transferToAccount.value);
  const toAccount = toSelection.account;
  const savingGoal = toSelection.savingGoal;
  const fromInvestment = fromSelection.investment;
  const toInvestment = toSelection.investment;
  const baseRows = getActiveRowsExcludingTransactionGroup(state.editTransactionGroupId);

  if (fromInvestment || toInvestment) {
    await saveDashboardInvestmentTransfer({
      fromSelection,
      toSelection,
      amountMinor,
      feeMinor,
      note,
      transactionAt,
      baseRows
    });
    return;
  }

  if (!fromAccount || !toAccount) {
    throw new Error("Choose active accounts for the transfer.");
  }

  if (fromAccount.primaryOwnerUserId !== state.authUser?.uid) {
    throw new Error("Transfers must start from one of your own accounts.");
  }

  const isSavingReserveTransfer = Boolean(savingGoal && savingGoal.linkedAccountId === fromAccount.id && toAccount.id === fromAccount.id);
  if (fromAccount.id === toAccount.id && !isSavingReserveTransfer) {
    if (getSavingsForTransferSource(fromAccount.id).length) {
      throw new Error("To reserve money in a saving, choose the [Reserve to saving] option in Transfer To.");
    }
    throw new Error("Transfer source and destination must be different.");
  }

  assertRegularAccountSpendAllowed(fromAccount.id, amountMinor + feeMinor, baseRows);
  const resolvedTransferNote = cleanText(note) || (savingGoal ? cleanText(savingGoal.name) : "");

  if (state.editTransactionGroupId) {
    const entry = getGroupedEntriesAll().find(item => item.groupId === state.editTransactionGroupId);
    if (!entry || entry.kind !== "transfer" || entry.rows.length !== 2) {
      throw new Error("This transfer can no longer be edited in place.");
    }

    const outRow = entry.rows.find(row => row.postingKind === "transfer_out");
    const inRow = entry.rows.find(row => row.postingKind === "transfer_in");
    const batch = writeBatch(db);

    batch.update(outRow.ref, {
      accountId: fromAccount.id,
      accountNameSnapshot: fromAccount.name,
      accountPrimaryOwnerUserIdSnapshot: fromAccount.primaryOwnerUserId,
      counterpartyAccountId: toAccount.id,
      counterpartyAccountNameSnapshot: toAccount.name,
      counterpartyAccountPrimaryOwnerUserIdSnapshot: toAccount.primaryOwnerUserId,
      amountMinor,
      note: resolvedTransferNote,
      transactionAt,
      savingGoalId: null,
      recurringBillId: null,
      recurringBillOccurrenceId: null,
      updatedAt: serverTimestamp()
    });

    batch.update(inRow.ref, {
      accountId: toAccount.id,
      accountNameSnapshot: toAccount.name,
      accountPrimaryOwnerUserIdSnapshot: toAccount.primaryOwnerUserId,
      counterpartyAccountId: fromAccount.id,
      counterpartyAccountNameSnapshot: fromAccount.name,
      counterpartyAccountPrimaryOwnerUserIdSnapshot: fromAccount.primaryOwnerUserId,
      amountMinor,
      note: resolvedTransferNote,
      transactionAt,
      savingGoalId: savingGoal?.id || null,
      recurringBillId: null,
      recurringBillOccurrenceId: null,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
    return;
  }

  const transactionCollection = collection(db, "households", state.household.id, "transactions");
  const groupId = doc(transactionCollection).id;
  const outRef = doc(transactionCollection);
  const inRef = doc(transactionCollection);
  const batch = writeBatch(db);

  batch.set(outRef, buildTransferRow({
    id: outRef.id,
    groupId,
    postingKind: "transfer_out",
    amountMinor,
    note: resolvedTransferNote,
    transactionAt,
    account: fromAccount,
    counterpartyAccount: toAccount,
    savingGoalId: null
  }));

  batch.set(inRef, buildTransferRow({
    id: inRef.id,
    groupId,
    postingKind: "transfer_in",
    amountMinor,
    note: resolvedTransferNote,
    transactionAt,
    account: toAccount,
    counterpartyAccount: fromAccount,
    savingGoalId: savingGoal?.id || null
  }));

  maybeAddFeeRowToBatch(batch, {
    transactionCollection,
    feeMinor,
    note: resolvedTransferNote,
    fallbackNote: "Transfer",
    transactionAt,
    account: fromAccount
  });

  await batch.commit();
}

async function saveDashboardInvestmentTransfer({ fromSelection, toSelection, amountMinor, feeMinor, note, transactionAt, baseRows }) {
  if (state.editTransactionGroupId) {
    throw new Error("Investment transfers cannot be edited from the dashboard yet. Use Investment history.");
  }
  if (fromSelection.investment && toSelection.investment) {
    throw new Error("Choose one investment portfolio and one cash account.");
  }

  const isDeposit = Boolean(toSelection.investment);
  const investment = isDeposit ? toSelection.investment : fromSelection.investment;
  const ledgerAccount = isDeposit ? fromSelection.account : toSelection.account;
  const eventType = isDeposit ? "deposit" : "withdrawal";
  const category = getInvestmentCategory(eventType);
  const resolvedNote = cleanText(note) || (isDeposit ? "Investment deposit" : "Investment withdrawal");

  if (!investment || !matchesPlanningScope(investment)) {
    throw new Error("Choose a visible investment portfolio.");
  }
  if (!ledgerAccount) {
    throw new Error("Choose a cash account for this investment transfer.");
  }
  if (!category) {
    throw new Error("Investment system categories are not ready yet. Wait a moment, then try again.");
  }
  if (isDeposit) {
    assertRegularAccountSpendAllowed(ledgerAccount.id, amountMinor + feeMinor, baseRows);
  } else {
    if (Number(investment.currentValueMinor || 0) < amountMinor) {
      throw new Error("This withdrawal is higher than the current investment value.");
    }
    if (feeMinor) {
      assertRegularAccountSpendAllowed(ledgerAccount.id, feeMinor, baseRows);
    }
  }

  const transactionCollection = collection(db, "households", state.household.id, "transactions");
  const transactionRef = doc(transactionCollection);
  const batch = writeBatch(db);
  batch.set(transactionRef, buildSingleRow({
    id: transactionRef.id,
    kind: isDeposit ? "outcome" : "income",
    amountMinor,
    note: resolvedNote,
    transactionAt,
    account: ledgerAccount,
    category,
    investmentAccountId: investment.id
  }));
  maybeAddFeeRowToBatch(batch, {
    transactionCollection,
    feeMinor,
    note: resolvedNote,
    fallbackNote: category.name,
    transactionAt,
    account: ledgerAccount
  });
  batch.update(doc(db, "households", state.household.id, "investmentAccounts", investment.id), {
    currentValueMinor: Math.max(0, Number(investment.currentValueMinor || 0) + (isDeposit ? amountMinor : -amountMinor)),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(collection(db, "households", state.household.id, "investmentEvents")), buildInvestmentEventPayload({
    investment,
    eventType,
    amountMinor,
    note: resolvedNote,
    ledgerAccount,
    ledgerTransactionId: transactionRef.id,
    transactionGroupId: transactionRef.id,
    transactionAt
  }));
  await batch.commit();
}

function handleHistoryActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const groupId = button.dataset.id;
  const entry = getVisibleGroupedEntries().find(item => item.groupId === groupId);

  if (button.dataset.action === "toggle-history-menu") {
    state.openHistoryMenuId = state.openHistoryMenuId === groupId ? null : groupId;
    renderTransactions();
    return;
  }

  if (!entry) {
    return;
  }

  if (button.dataset.action === "edit-history") {
    if (!canEditEntry(entry)) {
      setMessage(els.transactionMessage, "Only the person who created this entry can edit it.", "error");
      return;
    }

    state.openHistoryMenuId = null;
    startTransactionEdit(entry);
    return;
  }

  if (button.dataset.action === "delete-history") {
    if (!canDeleteEntry(entry)) {
      setMessage(els.transactionMessage, "Only the person who created this entry can delete it.", "error");
      return;
    }

    state.openHistoryMenuId = null;
    softDeleteEntry(entry);
  }
}

function handleLedgerTableActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "sort-ledger") {
    togglePlanningLedgerSort(button.dataset.sortField || "created");
    return;
  }

  const groupId = button.dataset.id;
  const entry = getVisibleGroupedEntries().find(item => item.groupId === groupId);

  if (button.dataset.action === "toggle-ledger-menu") {
    state.openHistoryMenuId = state.openHistoryMenuId === groupId ? null : groupId;
    renderPlanningLedger();
    return;
  }

  if (!entry) {
    return;
  }

  if (button.dataset.action === "edit-ledger-entry") {
    if (!canEditEntry(entry)) {
      setMessage(els.transactionMessage, "Only the person who created this entry can edit it.", "error");
      return;
    }
    state.openHistoryMenuId = null;
    setView("dashboard");
    startTransactionEdit(entry);
    return;
  }

  if (button.dataset.action === "delete-ledger-entry") {
    if (!canDeleteEntry(entry)) {
      setMessage(els.transactionMessage, "Only the person who created this entry can delete it.", "error");
      return;
    }
    state.openHistoryMenuId = null;
    softDeleteEntry(entry);
    renderPlanningLedger();
  }
}

function handleLedgerColumnResizeStart(event) {
  const handle = event.target.closest("[data-ledger-resize-column]");
  if (!handle) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const column = handle.dataset.ledgerResizeColumn;
  const table = handle.closest(".ledger-table");
  const startX = event.clientX;
  const startWidth = Number(state.ledgerColumnWidths[column] || getLedgerColumnDefaultWidth(column));

  const handlePointerMove = moveEvent => {
    const nextWidth = clampLedgerColumnWidth(column, startWidth + moveEvent.clientX - startX);
    state.ledgerColumnWidths = {
      ...state.ledgerColumnWidths,
      [column]: nextWidth
    };
    applyLedgerTableColumnWidths(table);
  };

  const handlePointerUp = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp, { once: true });
}

function togglePlanningLedgerSort(field) {
  const normalizedField = field === "transaction" ? "transaction" : "created";
  const currentField = state.planningLedgerSort.startsWith("transaction") ? "transaction" : "created";
  const currentDirection = state.planningLedgerSort.endsWith("-asc") ? "asc" : "desc";
  const nextDirection = currentField === normalizedField && currentDirection === "desc" ? "asc" : "desc";
  state.planningLedgerSort = `${normalizedField}-${nextDirection}`;
  state.openHistoryMenuId = null;
  if (els.ledgerPageSort) {
    els.ledgerPageSort.value = state.planningLedgerSort;
  }
  renderPlanningLedger();
}

function handleLedgerNavActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "show-ledger-recent") {
    resetLedgerView();
  }

  if (button.dataset.action === "show-ledger-month") {
    state.ledgerMode = "month";
    state.ledgerMonthOffset = Number(button.dataset.offset || 0);
  }

  if (button.dataset.action === "show-older-ledger-month") {
    state.ledgerMode = "month";
    state.ledgerMonthOffset = Math.min(2, state.ledgerMonthOffset + 1);
  }

  state.openHistoryMenuId = null;
  renderTransactions();
}

function handleDashboardLedgerFilterChange() {
  state.dashboardLedgerFilters = {
    kind: els.dashboardLedgerKindFilter?.value || "",
    accountId: els.dashboardLedgerAccountFilter?.value || "",
    categoryId: els.dashboardLedgerCategoryFilter?.value || ""
  };
  state.ledgerMode = "recent";
  state.openHistoryMenuId = null;
  renderTransactions();
}

function clearDashboardLedgerFilters() {
  state.dashboardLedgerFilters = {
    kind: "",
    accountId: "",
    categoryId: ""
  };
  renderLedgerFilterControls();
  renderTransactions();
}

function handlePlanningLedgerFilterChange() {
  state.planningLedgerLoaded = true;
  state.planningLedgerVisibleCount = 50;
  state.planningLedgerFilters = {
    kind: els.ledgerPageKindFilter?.value || "",
    accountId: els.ledgerPageAccountFilter?.value || "",
    categoryId: els.ledgerPageCategoryFilter?.value || "",
    creatorUserId: els.ledgerPageCreatorFilter?.value || "",
    dateFrom: els.ledgerPageDateFrom?.value || "",
    dateTo: els.ledgerPageDateTo?.value || ""
  };
  state.planningLedgerSort = els.ledgerPageSort?.value || "created-desc";
  renderPlanningLedger();
}

function clearPlanningLedgerFilters() {
  state.planningLedgerLoaded = true;
  state.planningLedgerVisibleCount = 50;
  state.planningLedgerFilters = {
    kind: "",
    accountId: "",
    categoryId: "",
    creatorUserId: "",
    dateFrom: "",
    dateTo: ""
  };
  state.planningLedgerSort = "created-desc";
  renderLedgerFilterControls();
  renderPlanningLedger();
}

function handleLedgerLoadMore() {
  state.planningLedgerLoaded = true;
  state.planningLedgerVisibleCount += 50;
  renderPlanningLedger();
}

function handleDocumentClick(event) {
  if (!state.openHistoryMenuId && !state.openBillMenuId) {
    return;
  }

  if (event.target.closest(".history-item-actions") || event.target.closest(".overflow-actions")) {
    return;
  }

  const hadHistoryMenu = Boolean(state.openHistoryMenuId);
  const hadBillMenu = Boolean(state.openBillMenuId);
  state.openHistoryMenuId = null;
  state.openBillMenuId = null;
  if (hadHistoryMenu) {
    renderTransactions();
  }
  if (hadBillMenu) {
    renderBillRemindersList();
  }
}

function startTransactionEdit(entry) {
  if (entry.kind === "adjustment") {
    setMessage(els.transactionMessage, "Balance corrections are created from the account page. Delete and recreate them instead of editing inline.", "error");
    return;
  }

  if (state.currentView !== "dashboard") {
    setView("dashboard");
  }

  state.editTransactionGroupId = entry.groupId;
  els.transactionGroupId.value = entry.groupId;
  els.transactionKind.value = entry.kind;
  els.transactionKind.disabled = true;
  els.transactionDate.value = toDateInput(entry.transactionAt);
  setMoneyInputValue(els.transactionAmount, entry.amountMinor);
  els.transactionNote.value = entry.note || "";
  els.transferNote.value = entry.note || "";
  els.transactionRecurringBillId.value = entry.recurringBillId || "";
  els.transactionRecurringBillOccurrenceId.value = entry.recurringBillOccurrenceId || "";

  if (entry.kind === "transfer") {
    syncTransactionForm({
      fromAccountId: entry.fromAccountId,
      toAccountId: entry.toAccountId,
      transferSavingGoalId: entry.savingGoalId
    });
  } else {
    syncTransactionForm({
      categoryId: entry.categoryId,
      accountId: entry.accountId,
      savingGoalId: entry.savingGoalId
    });
  }

  els.transactionCardTitle.textContent = "Edit transaction";
  if (els.transactionCardCopy) {
    els.transactionCardCopy.textContent = "You are editing an existing ledger entry. Update the fields below, then save the change.";
  }
  els.transactionSubmitBtn.textContent = "Update transaction";
  els.transactionCancelBtn.classList.remove("hidden");
  els.transactionCard.classList.add("editing");
  setMessage(els.transactionMessage, "");
  requestAnimationFrame(() => {
    els.transactionCard.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function softDeleteEntry(entry) {
  if (!window.confirm("Delete this entry? This cannot be undone.")) {
    return;
  }

  try {
    const batch = writeBatch(db);
    entry.rows.forEach(row => {
      batch.update(row.ref, {
        status: "deleted",
        deletedAt: serverTimestamp(),
        deletedByUserId: state.authUser.uid,
        updatedAt: serverTimestamp()
      });
    });
    if (entry.recurringBillId && entry.recurringBillOccurrenceId) {
      batch.set(doc(db, "households", state.household.id, "recurringBillOccurrences", entry.recurringBillOccurrenceId), {
        status: "voided",
        voidedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    setMessage(els.transactionMessage, error.message, "error");
  }
}

function openExportModal() {
  if (!state.household?.id) {
    return;
  }

  const rows = getVisibleRawTransactions().filter(row => row.status !== "deleted");
  if (!rows.length) {
    setMessage(els.transactionMessage, "There are no active ledger rows to export.", "error");
    return;
  }

  state.exportCsvContent = buildCsv(rows, { formatDateTime, getMemberName });
  els.exportPreview.value = state.exportCsvContent;
  setMessage(els.exportMessage, "");
  els.exportModal.classList.remove("hidden");
}

function closeExportModal() {
  els.exportModal.classList.add("hidden");
  setMessage(els.exportMessage, "");
}

function handleExportDownload() {
  if (!state.exportCsvContent) {
    return;
  }

  const blob = new Blob([state.exportCsvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildExportFilename(getDisplayName() || "User");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setMessage(els.exportMessage, "CSV download started. If the in-app browser blocks it, use Copy CSV instead.", "success");
}

async function handleExportCopy() {
  if (!state.exportCsvContent) {
    return;
  }

  try {
    await copyText(state.exportCsvContent);
    setMessage(els.exportMessage, "CSV copied to the clipboard.", "success");
  } catch (error) {
    setMessage(els.exportMessage, "Could not copy automatically. Select and copy the text manually from the export box.", "error");
  }
}

async function ensureUserProfile(user, explicitDisplayName = "") {
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);
  const displayName = explicitDisplayName || user.displayName || deriveDisplayNameFromEmail(user.email);

  if (!existing.exists()) {
    const pending = loadPendingRegistration();
    if (pendingRegistrationMatchesUser(pending, user) && user.emailVerified) {
      await finalizeVerifiedRegistration();
      return;
    }

    const error = new Error("Registration is not finished for this account. Log in again, enter the assigned user creation code, and complete signup with the same email.");
    error.code = "registration/incomplete";
    throw error;
  } else {
    const data = existing.data();
    const nextHouseholdIds = sanitizeHouseholdIds(data.householdIds, data.defaultHouseholdId);
    const nextActiveHouseholdId = resolveActiveHouseholdId(nextHouseholdIds, data.activeHouseholdId || data.defaultHouseholdId || null);
    const nextProfileData = {
      email: user.email,
      emailNormalized: normalizeEmail(user.email),
      displayName,
      householdIds: nextHouseholdIds,
      activeHouseholdId: nextActiveHouseholdId,
      status: data.status || "active",
      updatedAt: serverTimestamp()
    };

    state.userProfile = normalizeUserProfile(existing.id, {
      ...data,
      ...nextProfileData,
      updatedAt: data.updatedAt || null
    });

    updateDoc(userRef, nextProfileData).catch(error => {
      console.warn("Could not refresh the existing user profile document:", error);
    });
    return;
  }

  const refreshed = await getDoc(userRef);
  state.userProfile = normalizeUserProfile(refreshed.id, refreshed.data());
}

async function loadUserHouseholds(householdIds) {
  const ids = sanitizeStringArray(householdIds);
  const docs = await Promise.all(ids.map(async householdId => {
    try {
      return await getDoc(doc(db, "households", householdId));
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        return null;
      }
      throw error;
    }
  }));
  state.households = docs
    .filter(Boolean)
    .filter(snapshot => snapshot.exists())
    .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function handleHouseholdListenerError(error) {
  console.error(error);
  teardownListeners();
  clearHouseholdContextState();

  if (state.authUser && isPermissionDeniedError(error) && !householdRecoveryPending) {
    householdRecoveryPending = true;
    Promise.resolve()
      .then(() => refreshFromCurrentUser())
      .catch(refreshError => {
        householdRecoveryPending = false;
        renderFatalError(refreshError);
      })
      .finally(() => {
        householdRecoveryPending = false;
      });
    return;
  }

  renderFatalError(error);
}

async function loadHouseholdContext(householdId) {
  teardownListeners();
  householdRecoveryPending = false;
  clearHouseholdContextState();

  const initialLoads = [];
  let initialContextReady = false;
  const scheduleHouseholdRender = () => {
    if (initialContextReady) {
      scheduleRender();
    }
  };
  const subscribe = (target, applySnapshot) => {
    let settled = false;
    const initialLoad = new Promise((resolve, reject) => {
      const unsubscribe = onSnapshot(
        target,
        snapshot => {
          try {
            applySnapshot(snapshot);
            if (!settled) {
              settled = true;
              resolve();
            }
            scheduleHouseholdRender();
          } catch (error) {
            if (!settled) {
              settled = true;
              reject(error);
            }
            handleHouseholdListenerError(error);
          }
        },
        error => {
          if (!settled) {
            settled = true;
            reject(error);
          }
          handleHouseholdListenerError(error);
        }
      );
      activeListeners.push(unsubscribe);
    });

    initialLoads.push(initialLoad);
  };

  const subscribeOptional = (label, target, applySnapshot, handleFailure) => {
    const unsubscribe = onSnapshot(
      target,
      snapshot => {
        try {
          applySnapshot(snapshot);
          scheduleRender();
        } catch (error) {
          console.warn(`Optional NestPlan listener failed while applying ${label}:`, error);
          handleFailure?.(error);
          scheduleHouseholdRender();
        }
      },
      error => {
        console.warn(`Optional NestPlan listener could not load ${label}:`, error);
        handleFailure?.(error);
        scheduleHouseholdRender();
      }
    );

    activeListeners.push(unsubscribe);
  };

  const subscribeScopedOptional = (label, collectionName, applyDocs, handleFailure) => {
    const scopedDocs = {
      household: [],
      personal: []
    };

    const emitScopedDocs = () => {
      const merged = [...scopedDocs.household, ...scopedDocs.personal];
      const deduped = Array.from(new Map(merged.map(item => [item.id, item])).values());
      applyDocs(deduped);
      scheduleHouseholdRender();
    };

    const subscribeScope = (scopeKey, target) => {
      const unsubscribe = onSnapshot(
        target,
        snapshot => {
          try {
            scopedDocs[scopeKey] = snapshot.docs.map(item => ({ id: item.id, ref: item.ref, ...item.data() }));
            emitScopedDocs();
          } catch (error) {
            console.warn(`Optional NestPlan listener failed while applying ${label} (${scopeKey}):`, error);
            scopedDocs[scopeKey] = [];
            handleFailure?.(error);
            emitScopedDocs();
          }
        },
        error => {
          console.warn(`Optional NestPlan listener could not load ${label} (${scopeKey}):`, error);
          scopedDocs[scopeKey] = [];
          handleFailure?.(error);
          emitScopedDocs();
        }
      );

      activeListeners.push(unsubscribe);
    };

    const collectionRef = collection(db, "households", householdId, collectionName);
    subscribeScope("household", query(collectionRef, where("scopeType", "==", "household")));
    subscribeScope("personal", query(collectionRef, where("scopeType", "==", "personal"), where("ownerUserId", "==", state.authUser.uid)));
  };

  subscribe(doc(db, "households", householdId), householdSnap => {
    if (!householdSnap.exists()) {
      throw new Error("The selected household does not exist.");
    }
    state.household = { id: householdSnap.id, ...householdSnap.data() };
  });

  subscribe(collection(db, "households", householdId, "members"), membersSnap => {
    state.members = toSortedDocs(
      membersSnap.docs,
      docData => (docData.displayName || docData.emailNormalized || "").toLowerCase()
    );
    state.member = state.members.find(member => (member.userId || member.id) === state.authUser?.uid) || null;
  });

  subscribe(collection(db, "households", householdId, "invites"), invitesSnap => {
    state.invites = toSortedDocs(
      invitesSnap.docs.map(snapshot => ({ id: snapshot.id, ref: snapshot.ref, ...snapshot.data() })),
      docData => reverseTimestampSortValue(docData.createdAt)
    );
  });

  subscribe(collection(db, "households", householdId, "accounts"), accountsSnap => {
    state.accounts = toSortedDocs(
      accountsSnap.docs.map(snapshot => ({
        id: snapshot.id,
        ref: snapshot.ref,
        ...snapshot.data(),
        primaryOwnerUserId: snapshot.data().primaryOwnerUserId || snapshot.data().createdByUserId || ""
      })),
      docData => (docData.name || "").toLowerCase()
    );
  });

  subscribe(collection(db, "households", householdId, "categories"), categoriesSnap => {
    state.categories = toSortedDocs(categoriesSnap.docs, docData => (docData.name || "").toLowerCase());
    void ensureSystemCategories();
  });

  subscribe(collection(db, "households", householdId, "transactions"), transactionsSnap => {
    state.transactionsRaw = transactionsSnap.docs
      .map(snapshot => ({ id: snapshot.id, ref: snapshot.ref, ...snapshot.data() }))
      .sort((a, b) => getTimestampSortValue(b.createdAt) - getTimestampSortValue(a.createdAt));
  });

  subscribeScopedOptional("budgets", "budgets", budgetDocs => {
    state.budgets = toSortedDocs(
      budgetDocs,
      docData => (docData.name || "").toLowerCase()
    );
  }, () => {
    state.budgets = [];
  });

  subscribeScopedOptional("saving goals", "savingGoals", savingDocs => {
    state.savingGoals = toSortedDocs(
      savingDocs,
      docData => (docData.name || "").toLowerCase()
    );
  }, () => {
    state.savingGoals = [];
  });

  subscribeScopedOptional("saving goal events", "savingGoalEvents", savingEventDocs => {
    state.savingGoalEvents = savingEventDocs
      .sort((a, b) => getTimestampSortValue(b.createdAt) - getTimestampSortValue(a.createdAt));
  }, () => {
    state.savingGoalEvents = [];
  });

  subscribeScopedOptional("recurring bills", "recurringBills", billDocs => {
    state.recurringBills = toSortedDocs(
      billDocs,
      docData => (docData.name || "").toLowerCase()
    );
  }, () => {
    state.recurringBills = [];
  });

  subscribeScopedOptional("recurring bill occurrences", "recurringBillOccurrences", occurrenceDocs => {
    state.recurringBillOccurrences = occurrenceDocs
      .sort((a, b) => getTimestampSortValue(b.completedAt || b.createdAt) - getTimestampSortValue(a.completedAt || a.createdAt));
  }, () => {
    state.recurringBillOccurrences = [];
  });

  subscribeScopedOptional("investment accounts", "investmentAccounts", investmentDocs => {
    state.investmentAccounts = toSortedDocs(
      investmentDocs,
      docData => (docData.name || "").toLowerCase()
    );
  }, () => {
    state.investmentAccounts = [];
  });

  subscribeScopedOptional("investment assets", "investmentAssets", assetDocs => {
    state.investmentAssets = toSortedDocs(
      assetDocs,
      docData => (docData.name || "").toLowerCase()
    );
  }, () => {
    state.investmentAssets = [];
  });

  subscribeScopedOptional("investment events", "investmentEvents", eventDocs => {
    state.investmentEvents = eventDocs
      .sort((a, b) => getTimestampSortValue(b.createdAt) - getTimestampSortValue(a.createdAt));
  }, () => {
    state.investmentEvents = [];
  });

  try {
    await Promise.all(initialLoads);
    initialContextReady = true;
  } catch (error) {
    if (householdRecoveryPending && isPermissionDeniedError(error)) {
      return;
    }
    throw error;
  }
}

async function createHouseholdFlow(householdName, messageElement, options = {}) {
  if (!state.authUser || !state.userProfile) {
    throw new Error("Sign in first.");
  }

  if (!householdName) {
    throw new Error("Please enter a household name.");
  }

  ensureHouseholdCapacity();

  const householdRef = doc(collection(db, "households"));
  const memberRef = doc(db, "households", householdRef.id, "members", state.authUser.uid);
  const userRef = doc(db, "users", state.authUser.uid);
  const nextHouseholdIds = mergeHouseholdIds(getAccessibleHouseholdIds(), householdRef.id);
  const batch = writeBatch(db);

  batch.set(householdRef, {
    name: householdName,
    currencyCode: CURRENCY_CODE,
    timezone: TIMEZONE,
    createdByUserId: state.authUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    settings: {
      visibilityMode: "multi-household",
      defaultScope: DEFAULT_SCOPE,
      categoryDefaults: null
    }
  });

  batch.set(memberRef, {
    userId: state.authUser.uid,
    emailNormalized: normalizeEmail(state.authUser.email),
    displayName: getDisplayName(),
    status: "active",
    role: "admin",
    joinedAt: serverTimestamp(),
    invitedByUserId: state.authUser.uid
  });

  batch.update(userRef, {
    householdIds: nextHouseholdIds,
    activeHouseholdId: householdRef.id,
    status: "active",
    updatedAt: serverTimestamp()
  });

  await batch.commit();
  if (messageElement) {
    setMessage(messageElement, "Household created.", "success");
  }
  if (!options.skipRefresh) {
    await refreshFromCurrentUser();
  }
}

async function joinHouseholdByCode(inviteCode, messageElement, options = {}) {
  if (!state.authUser || !state.userProfile) {
    throw new Error("Sign in first.");
  }

  if (!inviteCode) {
    throw new Error("Please enter the invite code.");
  }

  const codeRef = doc(db, "inviteCodes", inviteCode);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    throw new Error("That invite code was not found.");
  }

  const invite = { id: codeSnap.id, ref: codeRef, ...codeSnap.data() };
  await acceptInvite(invite, options);
  if (messageElement) {
    setMessage(messageElement, "Household joined.", "success");
  }
}

async function acceptInvite(invite, options = {}) {
  if (invite.status !== "pending") {
    throw new Error("This invite is no longer pending.");
  }

  if (isExpired(invite.expiresAt)) {
    throw new Error("This invite code has expired.");
  }

  const accessibleHouseholdIds = getAccessibleHouseholdIds();
  const nextHouseholdIds = mergeHouseholdIds(accessibleHouseholdIds, invite.householdId);
  if (!accessibleHouseholdIds.includes(invite.householdId) && nextHouseholdIds.length > MAX_HOUSEHOLDS) {
    throw new Error(`You can only join up to ${MAX_HOUSEHOLDS} households.`);
  }

  const memberRef = doc(db, "households", invite.householdId, "members", state.authUser.uid);
  const householdInviteRef = doc(db, "households", invite.householdId, "invites", invite.inviteId || invite.id);
  const codeRef = doc(db, "inviteCodes", invite.inviteCode);
  const userRef = doc(db, "users", state.authUser.uid);
  const normalizedEmail = normalizeEmail(state.authUser.email || "");
  const batch = writeBatch(db);
  const acceptedPayload = {
    status: "accepted",
    acceptedAt: serverTimestamp(),
    acceptedByUserId: state.authUser.uid,
    updatedAt: serverTimestamp()
  };

  batch.set(memberRef, {
    userId: state.authUser.uid,
    emailNormalized: normalizedEmail,
    displayName: getDisplayName(),
    status: "active",
    role: "member",
    joinedAt: serverTimestamp(),
    invitedByUserId: invite.invitedByUserId || null,
    acceptedInviteId: invite.inviteId || invite.id
  }, { merge: true });

  batch.set(householdInviteRef, acceptedPayload, { merge: true });
  batch.set(codeRef, acceptedPayload, { merge: true });
  batch.update(userRef, {
    householdIds: nextHouseholdIds,
    activeHouseholdId: invite.householdId,
    status: "active",
    updatedAt: serverTimestamp()
  });

  await batch.commit();
  if (!options.skipRefresh) {
    await refreshFromCurrentUser();
  }
}

async function revokeInvite(invite) {
  const batch = writeBatch(db);
  const householdInviteRef = doc(db, "households", state.household.id, "invites", invite.id);
  const codeRef = doc(db, "inviteCodes", invite.inviteCode);
  const payload = {
    status: "revoked",
    updatedAt: serverTimestamp()
  };
  batch.set(householdInviteRef, payload, { merge: true });
  batch.set(codeRef, payload, { merge: true });
  await batch.commit();
}

async function updateActiveHousehold(householdId) {
  if (!state.authUser || !getAccessibleHouseholdIds().includes(householdId)) {
    throw new Error("That household is not available to this account.");
  }

  await updateDoc(doc(db, "users", state.authUser.uid), {
    activeHouseholdId: householdId,
    status: "active",
    updatedAt: serverTimestamp()
  });
  state.userProfile.activeHouseholdId = householdId;
}

function setBootState(status, message = "") {
  state.bootStatus = status;
  if (message) {
    state.bootMessage = message;
  }
  if (els.bootMessage) {
    els.bootMessage.textContent = state.bootMessage || "Loading NestPlan...";
  }
  if (els.bootScreen) {
    els.bootScreen.classList.toggle("boot-error", status === "error");
    els.bootScreen.setAttribute("aria-busy", status === "loading" ? "true" : "false");
  }
}

function isBootLoading() {
  return state.bootStatus === "loading";
}

function renderScreens() {
  if (els.bootScreen) {
    els.bootScreen.classList.toggle("hidden", !isBootLoading() && state.bootStatus !== "error");
  }
  if (isBootLoading()) {
    els.authScreen.classList.add("hidden");
    els.emailVerificationScreen.classList.add("hidden");
    els.masterAdminScreen.classList.add("hidden");
    els.setupScreen.classList.add("hidden");
    els.appScreen.classList.add("hidden");
    return;
  }

  if (state.authFlowLock) {
    els.authScreen.classList.remove("hidden");
    els.emailVerificationScreen.classList.add("hidden");
    els.masterAdminScreen.classList.add("hidden");
    els.setupScreen.classList.add("hidden");
    els.appScreen.classList.add("hidden");
    return;
  }

  if (isMasterAdminRoute()) {
    els.authScreen.classList.toggle("hidden", Boolean(state.authUser));
    els.emailVerificationScreen.classList.add("hidden");
    els.masterAdminScreen.classList.toggle("hidden", !state.authUser);
    els.setupScreen.classList.add("hidden");
    els.appScreen.classList.add("hidden");
    return;
  }

  const hasAuth = Boolean(state.authUser);
  const hasAccessibleHouseholds = Boolean(state.household?.id || state.households.length);
  const showSetup = hasAuth && !hasAccessibleHouseholds;
  const showApp = hasAuth && hasAccessibleHouseholds && Boolean(state.household?.id);

  els.authScreen.classList.toggle("hidden", hasAuth);
  els.emailVerificationScreen.classList.add("hidden");
  els.masterAdminScreen.classList.add("hidden");
  els.setupScreen.classList.toggle("hidden", !showSetup);
  els.appScreen.classList.toggle("hidden", !showApp);
}

function renderEmailVerification(message = "", type = "") {
  els.bootScreen?.classList.add("hidden");
  els.authScreen.classList.add("hidden");
  els.emailVerificationScreen.classList.remove("hidden");
  els.masterAdminScreen.classList.add("hidden");
  els.setupScreen.classList.add("hidden");
  els.appScreen.classList.add("hidden");
  [els.verificationRefreshBtn, els.verificationResendBtn, els.verificationLogoutBtn].forEach(button => {
    button?.classList.remove("hidden");
  });
  if (els.verificationLogoutBtn) {
    els.verificationLogoutBtn.textContent = "Logout";
  }
  els.verificationEmailLabel.textContent = state.authUser?.email
    ? `Verification required for ${state.authUser.email}.`
    : "Verification required.";
  if (message) {
    setMessage(els.verificationMessage, message, type);
  }
}

function renderVerificationReturn(message) {
  els.bootScreen?.classList.add("hidden");
  els.authScreen.classList.add("hidden");
  els.emailVerificationScreen.classList.remove("hidden");
  els.masterAdminScreen.classList.add("hidden");
  els.setupScreen.classList.add("hidden");
  els.appScreen.classList.add("hidden");
  els.verificationEmailLabel.textContent = "Email verification completed.";
  [els.verificationRefreshBtn, els.verificationResendBtn].forEach(button => {
    button?.classList.add("hidden");
  });
  if (els.verificationLogoutBtn) {
    els.verificationLogoutBtn.classList.remove("hidden");
    els.verificationLogoutBtn.textContent = "Back to login";
  }
  setMessage(els.verificationMessage, message, "success");
}

function renderMasterAdminScreen(message = "", type = "") {
  renderScreens();
  els.masterAdminUserLabel.textContent = state.authUser
    ? `Signed in as ${state.authUser.email}`
    : "Log in with a master admin account.";

  const disabled = !state.masterAdmin.authorized;
  [
    els.masterAdminRefreshBtn,
    els.masterCodeEmail,
    els.masterCodeExpiryDays,
    els.masterCodeNote,
    els.masterOverrideEmail,
    els.masterDefaultCategoryName,
    els.masterDefaultCategoryDirection,
    els.masterDefaultCategoryDescription,
    els.masterGreetingEditId,
    els.masterGreetingText,
    els.masterMaintenanceEnabled,
    els.masterMaintenanceBlockWrites,
    els.masterMaintenanceMessageInput,
    els.masterGreetingCancelBtn,
    els.masterDefaultCategoryCancelBtn
  ].forEach(element => {
    if (element) {
      element.disabled = disabled;
    }
  });

  els.masterCodeForm.querySelector("button[type='submit']").disabled = disabled;
  els.masterOverrideForm.querySelector("button[type='submit']").disabled = disabled;
  els.masterBlockedDomainForm.querySelector("button[type='submit']").disabled = disabled;
  els.masterGreetingForm.querySelector("button[type='submit']").disabled = disabled;
  els.masterBlockedDomain.disabled = disabled;
  els.masterGreetingSeedBtn.disabled = disabled;
  els.masterDefaultCategoryForm.querySelector("button[type='submit']").disabled = disabled;
  const maintenanceSubmitButton = els.masterMaintenanceForm?.querySelector("button[type='submit']");
  if (maintenanceSubmitButton) {
    maintenanceSubmitButton.disabled = disabled;
  }

  if (message) {
    setMessage(els.masterCodeMessage, message, type);
  }

  renderMasterMaintenance();
  renderMasterRegistrationCodes();
  renderMasterEmailOverrides();
  renderMasterBlockedDomains();
  renderMasterGreetingQuotes();
  renderMasterDefaultCategories();
}

function renderMasterMaintenance() {
  if (!els.masterMaintenanceForm) {
    return;
  }

  const maintenance = state.masterAdmin.maintenance || state.platformMaintenance || getDefaultMaintenanceState();
  els.masterMaintenanceEnabled.checked = Boolean(maintenance.enabled);
  els.masterMaintenanceBlockWrites.checked = Boolean(maintenance.blockWrites);
  els.masterMaintenanceMessageInput.value = maintenance.message || "";
  els.masterMaintenanceStatus.textContent = maintenance.enabled
    ? `Maintenance is ON${maintenance.blockWrites ? " and write actions are paused." : "."}`
    : "Maintenance is off.";
}

function renderMasterRegistrationCodes() {
  if (!state.masterAdmin.authorized) {
    els.masterCodeList.innerHTML = `<p class="status-copy">Master admin access is required.</p>`;
    return;
  }

  if (!state.masterAdmin.codes.length) {
    els.masterCodeList.innerHTML = `<p class="status-copy">No registration codes yet.</p>`;
    return;
  }

  els.masterCodeList.innerHTML = `
    <div class="admin-table">
      <div class="admin-table-row admin-table-head">
        <span>Code</span>
        <span>Email</span>
        <span>Status</span>
        <span>Expires</span>
        <span>Note</span>
        <span></span>
      </div>
      ${state.masterAdmin.codes.map(item => {
    const canRevoke = item.status === "unused";
    return `
      <div class="admin-table-row">
        <span class="admin-table-strong">${escapeHtml(item.code)}</span>
        <span>${escapeHtml(item.emailNormalized || "")}</span>
        <span>${escapeHtml(item.status || "unused")}</span>
        <span>${escapeHtml(item.expiresAtFormatted || "-")}</span>
        <span>${escapeHtml(item.note || "-")}</span>
        <span>${canRevoke ? `<button class="danger-btn small-btn" type="button" data-action="revoke-registration-code" data-code="${escapeHtml(item.code)}">Revoke</button>` : ""}</span>
      </div>
    `;
  }).join("")}
    </div>
  `;
}

function renderMasterEmailOverrides() {
  if (!state.masterAdmin.authorized) {
    els.masterOverrideList.innerHTML = `<p class="status-copy">Master admin access is required.</p>`;
    return;
  }

  if (!state.masterAdmin.overrides.length) {
    els.masterOverrideList.innerHTML = `<p class="status-copy">No email overrides yet.</p>`;
    return;
  }

  els.masterOverrideList.innerHTML = `
    <div class="admin-table">
      <div class="admin-table-row four-col admin-table-head">
        <span>Email</span>
        <span>Status</span>
        <span>Added</span>
        <span></span>
      </div>
      ${state.masterAdmin.overrides.map(item => `
        <div class="admin-table-row four-col">
          <span class="admin-table-strong">${escapeHtml(item.emailNormalized || item.id || "")}</span>
          <span>${escapeHtml(item.status || "active")}</span>
          <span>${escapeHtml(item.createdAtFormatted || "-")}</span>
          <span><button class="ghost-btn small-btn" type="button" data-action="remove-email-override" data-email="${escapeHtml(item.emailNormalized || item.id || "")}">Remove</button></span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMasterBlockedDomains() {
  if (!state.masterAdmin.authorized) {
    els.masterBlockedDomainList.innerHTML = `<p class="status-copy">Master admin access is required.</p>`;
    return;
  }

  if (!state.masterAdmin.blockedDomains.length) {
    els.masterBlockedDomainList.innerHTML = `<p class="status-copy">No blocked domains yet.</p>`;
    return;
  }

  els.masterBlockedDomainList.innerHTML = `
    <div class="admin-table compact-admin-table">
      <div class="admin-table-row four-col admin-table-head">
        <span>Domain</span>
        <span>Status</span>
        <span>Added</span>
        <span></span>
      </div>
      ${state.masterAdmin.blockedDomains.map(item => `
        <div class="admin-table-row four-col">
          <span class="admin-table-strong">${escapeHtml(item.domain || item.id || "")}</span>
          <span>${escapeHtml(item.status || "active")}</span>
          <span>${escapeHtml(item.createdAtFormatted || "-")}</span>
          <span><button class="ghost-btn small-btn" type="button" data-action="remove-blocked-domain" data-domain="${escapeHtml(item.domain || item.id || "")}">Remove</button></span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMasterGreetingQuotes() {
  if (!state.masterAdmin.authorized) {
    els.masterGreetingList.innerHTML = `<p class="status-copy">Master admin access is required.</p>`;
    return;
  }

  if (!state.masterAdmin.greetingQuotes.length) {
    els.masterGreetingList.innerHTML = `<p class="status-copy">No greeting sentences yet.</p>`;
    return;
  }

  els.masterGreetingList.innerHTML = `
    <div class="admin-table compact-admin-table">
      <div class="admin-table-row three-col admin-table-head">
        <span>Sentence</span>
        <span>Added</span>
        <span></span>
      </div>
      ${state.masterAdmin.greetingQuotes.map(item => `
        <div class="admin-table-row three-col">
          <span class="admin-table-strong">${escapeHtml(item.text || "")}</span>
          <span>${escapeHtml(item.createdAtFormatted || "-")}</span>
          <span>
            <button class="ghost-btn small-btn" type="button" data-action="edit-greeting-quote" data-id="${escapeHtml(item.id || "")}">Edit</button>
            <button class="ghost-btn small-btn" type="button" data-action="remove-greeting-quote" data-id="${escapeHtml(item.id || "")}">Remove</button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMasterDefaultCategories() {
  if (!state.masterAdmin.authorized) {
    els.masterDefaultCategoryList.innerHTML = `<p class="status-copy">Master admin access is required.</p>`;
    return;
  }

  if (!state.masterAdmin.defaultCategories.length) {
    els.masterDefaultCategoryList.innerHTML = `<p class="status-copy">No default categories yet.</p>`;
    return;
  }

  els.masterDefaultCategoryList.innerHTML = `
    <div class="admin-table compact-admin-table">
      <div class="admin-table-row default-category-row admin-table-head">
        <span>Name</span>
        <span>Direction</span>
        <span>Description</span>
        <span></span>
      </div>
      ${state.masterAdmin.defaultCategories.map(item => `
        <div class="admin-table-row default-category-row">
          <span class="admin-table-strong">${escapeHtml(item.name || "")}</span>
          <span>${escapeHtml(item.direction || "")}</span>
          <span>${escapeHtml(item.description || "-")}</span>
          <span>
            ${item.readonly
              ? `<span class="status-copy">Built-in</span>`
              : `<button class="ghost-btn small-btn" type="button" data-action="edit-default-category" data-id="${escapeHtml(item.id || "")}">Edit</button>
                 <button class="ghost-btn small-btn" type="button" data-action="remove-default-category" data-id="${escapeHtml(item.id || "")}">Remove</button>`}
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSetup() {
  renderScreens();
  els.setupUserLabel.textContent = state.authUser ? `Signed in as ${state.authUser.email}` : "";
  if (els.setupAvatar) {
    els.setupAvatar.textContent = getInitials(getDisplayName());
  }
}

function renderApp() {
  [
    ["screens", renderScreens],
    ["header", renderHeader],
    ["view state", renderViewState],
    ["onboarding", renderOnboarding],
    ["summaries", renderSummaries],
    ["dashboard bill reminders", renderDashboardBillReminders],
    ["dashboard budgets", renderDashboardBudgets],
    ["dashboard savings", renderDashboardSavings],
    ["planning state", renderPlanningState],
    ["insights state", renderInsightsState],
    ["planning scope copy", renderPlanningScopeCopy],
    ["budgets list", renderBudgetsList],
    ["savings list", renderSavingsList],
    ["bill reminders", renderBillRemindersList],
    ["bills list", renderBillsList],
    ["performance", renderPerformanceView],
    ["investments", renderInvestmentsView],
    ["ledger controls", renderLedgerFilterControls],
    ["planning ledger", renderPlanningLedger],
    ["report", renderReportView],
    ["accounts", renderAccountsList],
    ["categories", renderCategories],
    ["category seed access", renderCategorySeedAccess],
    ["invite access", renderInviteAccess],
    ["members", renderMembersList],
    ["invites", renderInvitesList],
    ["transactions", renderTransactions],
    ["category helper", renderCategoryHelperContent],
    ["account owner sync", syncAccountOwnerInput],
    ["budget form sync", syncBudgetForm],
    ["budget category options", populateBudgetCategoryOptions],
    ["saving selects", populateSavingSelects],
    ["bill category selects", populateBillCategorySelects],
    ["transaction selects", populateTransactionSelects],
    ["investment selects", populateInvestmentSelects],
    ["transaction fee sync", syncTransactionFeeField],
    ["investment fee sync", syncInvestmentMovementFeeField],
    ["investment form sync", syncInvestmentForm],
    ["household rename access", renderHouseholdRenameAccess],
    ["maintenance", renderMaintenanceMode]
  ].forEach(([label, renderStep]) => safeRenderStep(label, renderStep));
}

function safeRenderStep(label, renderStep) {
  try {
    renderStep();
  } catch (error) {
    console.error(`NestPlan render step failed: ${label}`, error);
    renderNonBlockingRenderError(error, label);
  }
}

function renderNonBlockingRenderError(error, label = "") {
  const message = `A display section failed to update${label ? ` (${label})` : ""}. Reload once; if it repeats, send this text: ${error?.message || error}`;
  const visibleMessages = [
    els.budgetMessage,
    els.savingMessage,
    els.billMessage,
    els.transactionMessage,
    els.profileMessage
  ];
  const target = visibleMessages.find(element => element && !element.closest(".hidden"));
  setMessage(target || els.setupMessage || els.loginMessage, message, "error");
}

function renderMaintenanceMode() {
  const maintenance = state.platformMaintenance || getDefaultMaintenanceState();
  const showBanner = Boolean(maintenance.enabled);
  const message = maintenance.message || "NestPlan is being updated. Please pause changes for a few minutes.";

  els.appMaintenanceBanner?.classList.toggle("hidden", !showBanner);
  if (els.appMaintenanceMessage) {
    els.appMaintenanceMessage.textContent = message;
  }

  setMaintenanceWriteControlsDisabled(isMaintenanceWriteBlocked());
}

function renderHeader() {
  els.greetingText.textContent = state.sessionGreeting;
  els.householdLabel.textContent = "";
  els.userLabel.textContent = `Signed in as ${state.authUser?.email || ""}${firebaseEnvironment === "staging" ? " | staging" : ""}`;
  if (els.userAvatar) {
    els.userAvatar.textContent = getInitials(getDisplayName());
  }
  els.scopePersonal.classList.toggle("active", state.scope === "personal");
  els.scopeHousehold.classList.toggle("active", state.scope === "household");
  els.navDashboard.classList.toggle("active", state.currentView === "dashboard");
  els.navPlanning.classList.toggle("active", state.currentView === "planning");
  els.navInvestments.classList.toggle("active", state.currentView === "investments");
  els.navInsights?.classList.toggle("active", state.currentView === "insights");
  els.navSettings?.classList.toggle("active", state.currentView === "settings");
  if (els.scopeCopy) {
    els.scopeCopy.textContent = state.scope === "personal"
      ? "Showing your owned accounts, your personal planning items, and the activity you created or touched."
      : "Showing every household account, ledger row, and shared planning item in this household.";
  }
  els.profileDisplayName.value = getDisplayName();
  renderHouseholdSwitchers();
}

function renderHouseholdSwitchers() {
  const options = state.households
    .map(household => `<option value="${household.id}">${escapeHtml(household.name)}</option>`)
    .join("");
  const fallback = `<option value="">No households yet</option>`;

  els.householdSwitcher.innerHTML = options || fallback;
  els.settingsHouseholdSwitcher.innerHTML = options || fallback;
  syncHouseholdSwitcherValue();
}

function renderHouseholdRenameAccess() {
  if (!els.householdRenameForm) {
    return;
  }
  const isAdmin = state.member?.role === "admin";
  if (document.activeElement !== els.householdRenameName) {
    els.householdRenameName.value = state.household?.name || "";
  }
  els.householdRenameName.disabled = !isAdmin;
  els.householdRenameForm.querySelector("button[type='submit']").disabled = !isAdmin;
  if (isAdmin && els.householdRenameMessage.textContent === "Only the household admin can rename this household.") {
    setMessage(els.householdRenameMessage, "");
  }
  if (!isAdmin && !els.householdRenameMessage.textContent) {
    setMessage(els.householdRenameMessage, "Only the household admin can rename this household.", "error");
  }
}

function syncHouseholdSwitcherValue() {
  const activeHouseholdId = state.household?.id || state.userProfile?.activeHouseholdId || "";
  els.householdSwitcher.value = activeHouseholdId;
  els.settingsHouseholdSwitcher.value = activeHouseholdId;
}

function renderViewState() {
  const onboardingRequired = isOnboardingRequired();
  const showOnboarding = state.currentView === "dashboard" && onboardingRequired;
  els.onboardingView.classList.toggle("hidden", !showOnboarding);
  els.dashboardView.classList.toggle("hidden", state.currentView !== "dashboard" || showOnboarding);
  els.planningView.classList.toggle("hidden", state.currentView !== "planning");
  els.managementView.classList.toggle("hidden", state.currentView !== "planning" || state.planningTab !== "accounts");
  els.performanceView.classList.toggle("hidden", state.currentView !== "planning" || state.planningTab !== "performance");
  els.investmentsView.classList.toggle("hidden", state.currentView !== "investments");
  els.insightsView?.classList.toggle("hidden", state.currentView !== "insights");
  els.settingsView.classList.toggle("hidden", state.currentView !== "settings");
}

function renderOnboarding() {
  const status = getOnboardingStatus();
  const missing = [];
  if (!status.hasAccount) {
    missing.push("create the first account");
  }
  if (!status.hasIncomeCategory) {
    missing.push("add at least 1 income category");
  }
  if (!status.hasOutcomeCategory) {
    missing.push("add at least 1 outcome category");
  }

  els.onboardingSummary.textContent = missing.length
    ? `Missing: ${missing.join(". ")}.`
    : "Setup complete. You can start using the dashboard now.";
}

function renderSummaries() {
  const balances = computeAccountBalances();
  const visibleAccounts = getVisibleAccounts();
  const visibleRawTransactions = getVisibleRawTransactions().filter(row => row.status !== "deleted");
  const monthRows = visibleRawTransactions.filter(row => isCurrentMonth(row.transactionAt));
  const currentMonthLabel = getCurrentMonthLabel();

  const visibleBalance = visibleAccounts.reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
  const inflow = monthRows.reduce((sum, row) => {
    if (isMonthlyIncomeRow(row)) {
      return sum + Number(row.amountMinor || 0);
    }
    return sum;
  }, 0);
  const outflow = monthRows.reduce((sum, row) => {
    if (isMonthlyExpenseRow(row)) {
      return sum + Number(row.amountMinor || 0);
    }
    return sum;
  }, 0);

  els.summaryBalance.textContent = formatRupiah(visibleBalance);
  if (els.summaryInflowLabel) {
    els.summaryInflowLabel.textContent = `${currentMonthLabel} income`;
  }
  els.summaryInflow.textContent = formatRupiah(inflow);
  if (els.summaryOutflowLabel) {
    els.summaryOutflowLabel.textContent = `${currentMonthLabel} expense`;
  }
  els.summaryOutflow.textContent = formatRupiah(outflow);
}

function isMonthlyIncomeRow(row) {
  return row.postingKind === "income" && !isInvestmentCategoryId(row.categoryId);
}

function isMonthlyExpenseRow(row) {
  return row.postingKind === "outcome" && !isInvestmentCategoryId(row.categoryId);
}

function getBudgetStatusCopy(summary) {
  if (!summary.amountMinor) {
    return "0%";
  }

  const usagePercent = Math.min(999, Math.round((summary.spentMinor / summary.amountMinor) * 100));
  return `${Math.max(0, usagePercent)}%`;
}

function getBudgetProgressPercent(summary) {
  if (!summary.amountMinor) {
    return 0;
  }
  return clampPercent(Math.round((summary.spentMinor / summary.amountMinor) * 100));
}

function getSavingProgressPercent(summary) {
  if (!summary.targetAmountMinor) {
    return 0;
  }
  return clampPercent(summary.percent);
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function getCurrentMonthLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: TIMEZONE
  }).format(new Date());
}

function renderDashboardBudgets() {
  if (!els.dashboardBudgetsList) {
    return;
  }

  const budgetSummaries = getVisibleBudgets().map(budget => buildBudgetSummary(budget));
  els.dashboardBudgetsList.innerHTML = budgetSummaries.length
    ? budgetSummaries.map(summary => {
        const progressPercent = getBudgetProgressPercent(summary);
        const statusCopy = getBudgetStatusCopy(summary);
        return `
        <article class="dashboard-snapshot-row overlay-snapshot-row ${escapeHtml(summary.stateClass)}" style="--snapshot-progress: ${progressPercent}%;">
          <div class="dashboard-snapshot-head">
            <div>
              <p class="dashboard-snapshot-title">${escapeHtml(summary.name)}</p>
            </div>
            <p class="dashboard-snapshot-amount ${summary.stateClass}">${escapeHtml(formatRupiah(summary.remainingMinor))}</p>
          </div>
          <div class="dashboard-snapshot-bar overlay-snapshot-bar">
            <span></span>
            <div class="dashboard-snapshot-bar-copy">
              <span class="dashboard-snapshot-bar-period">${escapeHtml(summary.periodLabel)}</span>
              <span class="dashboard-snapshot-bar-status">${escapeHtml(statusCopy)}</span>
            </div>
          </div>
        </article>
      `;
      }).join("")
    : `<div class="empty-card"><h4>No budgets yet</h4><p>Create a budget in Planning to see a compact snapshot here.</p></div>`;
}

function renderDashboardSavings() {
  if (!els.dashboardSavingsList) {
    return;
  }

  const savingSummaries = getVisibleSavingGoals().map(goal => ({
    goal,
    summary: buildSavingSummary(goal)
  }));

  els.dashboardSavingsList.innerHTML = savingSummaries.length
    ? savingSummaries.map(({ goal, summary }) => {
        const progressPercent = getSavingProgressPercent(summary);
        return `
        <article class="dashboard-snapshot-row overlay-snapshot-row ${escapeHtml(summary.stateClass)}" style="--snapshot-progress: ${progressPercent}%;">
          <div class="dashboard-snapshot-head">
            <div>
              <p class="dashboard-snapshot-title">${escapeHtml(goal.name)}</p>
            </div>
            <p class="dashboard-snapshot-amount ${summary.stateClass}">${escapeHtml(formatRupiah(summary.progressMinor))}</p>
          </div>
          <div class="dashboard-snapshot-bar overlay-snapshot-bar">
            <span></span>
            <div class="dashboard-snapshot-bar-copy">
              <span class="dashboard-snapshot-bar-period">${escapeHtml(formatMonthKey(goal.targetMonthKey))}</span>
              <span class="dashboard-snapshot-bar-status">${escapeHtml(`${summary.percent}%`)}</span>
            </div>
          </div>
        </article>
      `;
      }).join("")
    : `<div class="empty-card"><h4>No savings yet</h4><p>Create a saving goal in Planning to see a compact snapshot here.</p></div>`;
}

function renderDashboardBillReminders() {
  if (!els.dashboardBillReminders || !els.dashboardBillRemindersList) {
    return;
  }

  syncDashboardBillDismissals();
  const reminders = getDashboardBillReminders();
  els.dashboardBillReminders.classList.toggle("hidden", !reminders.length);
  els.dashboardBillRemindersList.innerHTML = reminders.map(reminder => `
    <article class="dashboard-reminder-row">
      <p class="dashboard-reminder-copy">
        <strong>${escapeHtml(reminder.bill.name)}</strong> due ${escapeHtml(formatDate(Timestamp.fromDate(reminder.dueDate)))}
      </p>
      <button class="dashboard-reminder-pay" type="button" data-action="pay-dashboard-bill" data-id="${reminder.bill.id}" data-occurrence-key="${reminder.occurrenceKey}">Pay</button>
      <button class="dashboard-reminder-dismiss" type="button" data-action="dismiss-dashboard-bill" data-id="${reminder.bill.id}" data-occurrence-key="${reminder.occurrenceKey}" aria-label="Hide reminder">x</button>
    </article>
  `).join("");
}

function setPlanningTab(tab) {
  state.planningTab = tab;
  renderApp();
}

function renderPlanningState() {
  els.planningTabAccounts?.classList.toggle("active", state.planningTab === "accounts");
  els.planningTabBudgets?.classList.toggle("active", state.planningTab === "budgets");
  els.planningTabSavings?.classList.toggle("active", state.planningTab === "savings");
  els.planningTabBills?.classList.toggle("active", state.planningTab === "bills");
  els.planningTabPerformance?.classList.toggle("active", state.planningTab === "performance");
  els.planningBudgetsPanel?.classList.toggle("hidden", state.planningTab !== "budgets");
  els.planningSavingsPanel?.classList.toggle("hidden", state.planningTab !== "savings");
  els.planningBillsPanel?.classList.toggle("hidden", state.planningTab !== "bills");
  els.planningLedgerPanel?.classList.toggle("hidden", state.currentView !== "insights" || state.insightsTab !== "ledger");
}

function setInsightsTab(tab) {
  state.insightsTab = tab;
  if (tab === "ledger") {
    state.planningLedgerLoaded = true;
  }
  renderApp();
}

function renderInsightsState() {
  if (!els.insightsView) {
    return;
  }
  els.insightsTabLedger?.classList.toggle("active", state.insightsTab === "ledger");
  els.insightsTabReport?.classList.toggle("active", state.insightsTab === "report");
  els.insightsLedgerPanel?.classList.toggle("hidden", state.insightsTab !== "ledger");
  els.insightsReportPanel?.classList.toggle("hidden", state.insightsTab !== "report");
}

function renderBudgetsList() {
  if (!els.budgetsList) {
    return;
  }
  const budgets = getVisibleBudgets();
  els.budgetsList.innerHTML = "";

  if (!budgets.length) {
    els.budgetsList.innerHTML = `<div class="empty-card"><h4>No visible budgets</h4><p>Create a personal or household budget to start tracking category-based spending.</p></div>`;
    return;
  }

  budgets.forEach(budget => {
    const summary = buildBudgetSummary(budget);
    const item = document.createElement("article");
    item.className = "list-row";
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">${escapeHtml(budget.name)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(resolvePlanningScopeLabel(budget))}</span>
            <span>|</span>
            <span>${escapeHtml(summary.periodLabel)}</span>
            <span>|</span>
            <span>${escapeHtml(summary.categoryLabel)}</span>
          </div>
        </div>
        <div class="list-row-actions">
          <button class="text-btn" type="button" data-action="edit-budget" data-id="${budget.id}">Edit</button>
          <button class="text-btn danger" type="button" data-action="delete-budget" data-id="${budget.id}">Delete</button>
        </div>
      </div>
      <div class="planning-metric-grid">
        <div class="metric-chip">
          <span>Allocated</span>
          <strong>${escapeHtml(formatRupiah(summary.amountMinor))}</strong>
        </div>
        <div class="metric-chip">
          <span>Spent</span>
          <strong>${escapeHtml(formatRupiah(summary.spentMinor))}</strong>
        </div>
        <div class="metric-chip ${summary.stateClass}">
          <span>${escapeHtml(summary.stateLabel)}</span>
          <strong>${escapeHtml(formatRupiah(summary.remainingMinor))}</strong>
        </div>
      </div>
    `;
    els.budgetsList.appendChild(item);
  });
}

function renderSavingsList() {
  if (!els.savingsList) {
    return;
  }
  const savings = getVisibleSavingGoals();
  els.savingsList.innerHTML = "";
  const hasClampedSavings = savings.some(goal => buildSavingSummary(goal).isClamped);

  if (els.savingsListNote) {
    els.savingsListNote.classList.toggle("hidden", !hasClampedSavings);
  }

  if (!savings.length) {
    els.savingsList.innerHTML = `<div class="empty-card"><h4>No visible savings</h4><p>Create a saving goal, then fund it from the dashboard with a Transfer into that saving.</p></div>`;
    return;
  }

  savings.forEach(goal => {
    const summary = buildSavingSummary(goal);
    const linkedAccount = getLinkedActiveAccountForSaving(goal);
    const completionAction = goal.status === "completed"
      ? `<button class="text-btn" type="button" data-action="reopen-saving" data-id="${goal.id}">Reopen</button>`
      : summary.isTargetReached
        ? `<button class="text-btn" type="button" data-action="complete-saving" data-id="${goal.id}">Mark complete</button>`
        : "";
    const item = document.createElement("article");
    item.className = "list-row";
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">${escapeHtml(goal.name)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(resolvePlanningScopeLabel(goal))}</span>
            <span>|</span>
            <span>${escapeHtml(linkedAccount ? getAccountOptionLabel(linkedAccount) : (getAccountName(goal.linkedAccountId) || goal.linkedAccountNameSnapshot))}</span>
            <span>|</span>
            <span>Target ${escapeHtml(formatMonthKey(goal.targetMonthKey))}</span>
          </div>
        </div>
        <div class="list-row-actions">
          ${completionAction}
          <button class="text-btn" type="button" data-action="edit-saving" data-id="${goal.id}">Edit</button>
          <button class="text-btn danger" type="button" data-action="delete-saving" data-id="${goal.id}">Delete</button>
        </div>
      </div>
      <div class="planning-metric-grid">
        <div class="metric-chip">
          <span>Saved</span>
          <strong>${escapeHtml(formatRupiah(summary.progressMinor))}</strong>
        </div>
        <div class="metric-chip">
          <span>Target</span>
          <strong>${escapeHtml(formatRupiah(summary.targetAmountMinor))}</strong>
        </div>
        <div class="metric-chip ${summary.stateClass}">
          <span>${escapeHtml(summary.stateLabel)}</span>
          <strong>${escapeHtml(`${summary.percent}%`)}</strong>
        </div>
      </div>
    `;
    els.savingsList.appendChild(item);
  });
}

function renderBillRemindersList() {
  if (!els.billRemindersList) {
    return;
  }
  const reminders = getVisibleBillStatusRows();
  els.billRemindersList.innerHTML = "";

  if (!reminders.length) {
    els.billRemindersList.innerHTML = `<div class="empty-card"><h4>No active bills yet</h4><p>Create a recurring bill and it will appear here with its paid or unpaid status.</p></div>`;
    return;
  }

  reminders.forEach(reminder => {
    const item = document.createElement("article");
    item.className = "list-row";
    const statusPillClass = reminder.isPaid ? "income" : "outcome";
    const isMenuOpen = state.openBillMenuId === reminder.bill.id;
    const menuItems = [
      !reminder.isPaid
        ? `<button class="overflow-item" type="button" data-action="mark-bill-paid" data-id="${reminder.bill.id}" data-occurrence-key="${reminder.payOccurrenceKey}">Mark as paid</button>`
        : "",
      `<button class="overflow-item" type="button" data-action="edit-bill" data-id="${reminder.bill.id}">Edit</button>`,
      `<button class="overflow-item danger" type="button" data-action="delete-bill" data-id="${reminder.bill.id}">Delete</button>`
    ].filter(Boolean).join("");
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">${escapeHtml(reminder.bill.name)}</p>
          <div class="list-row-meta">
            <span class="pill ${statusPillClass}">${escapeHtml(reminder.statusLabel)}</span>
            <span>|</span>
            <span>${escapeHtml(reminder.dueLabel)}</span>
            <span>|</span>
            <span>${escapeHtml(getCategoryName(reminder.bill.categoryId) || reminder.bill.categoryNameSnapshot)}</span>
          </div>
        </div>
        <div class="list-row-actions">
          <button class="text-btn" type="button" data-action="pay-bill" data-id="${reminder.bill.id}" data-occurrence-key="${reminder.payOccurrenceKey}">Pay</button>
          <div class="overflow-actions">
            <button class="overflow-btn" type="button" aria-label="Open bill actions" data-action="toggle-bill-menu" data-id="${reminder.bill.id}">&#8942;</button>
            <div class="overflow-menu${isMenuOpen ? "" : " hidden"}">
              ${menuItems}
            </div>
          </div>
        </div>
      </div>
    `;
    els.billRemindersList.appendChild(item);
  });
}

function renderBillsList() {
  if (els.billsList) {
    els.billsList.innerHTML = "";
  }
}

function handleReportControlsChange() {
  state.reportRange = els.reportRange?.value || "this-month";
  state.reportCustomFrom = els.reportDateFrom?.value || "";
  state.reportCustomTo = els.reportDateTo?.value || "";
  state.reportFilters = {
    accountIds: getMultiSelectValues(els.reportAccountFilter),
    categoryIds: getMultiSelectValues(els.reportCategoryFilter),
    kind: els.reportKindFilter?.value || "outcome",
    memberIds: getMultiSelectValues(els.reportMemberFilter),
    includeSavingSpending: Boolean(els.reportIncludeSavingSpending?.checked)
  };
  state.reportBudgetMode = els.reportBudgetMode?.value || "average";
  state.reportBudgetRanking = els.reportBudgetRanking?.value || "frequent";
  state.reportBudgetBuffer = els.reportBudgetBuffer?.value || "normal";
  if (state.reportRange !== "custom") {
    state.reportCustomFrom = "";
    state.reportCustomTo = "";
  }
  state.reportDrillCategoryId = "";
  renderReportView();
}

function getMultiSelectValues(select) {
  if (!select) {
    return [];
  }
  return [...select.selectedOptions].map(option => option.value).filter(Boolean);
}

function renderReportView() {
  if (!els.insightsReportPanel || state.currentView !== "insights") {
    return;
  }

  renderReportControls();
  const model = buildReportModel();
  renderReportKpis(model);
  renderReportCategoryBreakdown(model);
  renderReportCategoryDrill(model);
  renderReportMonthlyTable(model);
  renderReportBudgetPerformance(model);
  renderReportBudgetSuggestions(model);
}

function renderReportControls() {
  if (!els.reportRange) {
    return;
  }

  els.reportRange.value = state.reportRange;
  if (els.reportDateFrom) {
    els.reportDateFrom.value = state.reportCustomFrom || "";
  }
  if (els.reportDateTo) {
    els.reportDateTo.value = state.reportCustomTo || "";
  }
  els.reportCustomRange?.classList.toggle("hidden", state.reportRange !== "custom");
  if (els.reportFiltersToggle) {
    els.reportFiltersToggle.checked = state.reportFiltersVisible;
  }
  els.reportFiltersPanel?.classList.toggle("hidden", !state.reportFiltersVisible);
  if (els.reportIncludeSavingSpending) {
    els.reportIncludeSavingSpending.checked = state.reportFilters.includeSavingSpending;
  }
  if (els.reportKindFilter) {
    els.reportKindFilter.value = state.reportFilters.kind || "outcome";
  }
  if (els.reportBudgetMode) {
    els.reportBudgetMode.value = state.reportBudgetMode;
  }
  if (els.reportBudgetRanking) {
    els.reportBudgetRanking.value = state.reportBudgetRanking;
  }
  if (els.reportBudgetBuffer) {
    els.reportBudgetBuffer.value = state.reportBudgetBuffer;
  }
  if (els.reportScopeNote) {
    els.reportScopeNote.textContent = state.scope === "household"
    ? "Household view includes shared household activity. Member filters apply here."
    : "My view includes your own and touched activity only.";
  }
  els.reportMemberFilterGroup?.classList.toggle("hidden", state.scope !== "household");

  renderReportMultiOptions(els.reportAccountFilter, getVisibleAccounts().map(account => ({
    value: account.id,
    label: getAccountOptionLabel(account)
  })), state.reportFilters.accountIds);
  renderReportMultiOptions(els.reportCategoryFilter, getActiveCategories()
    .filter(category => !isProtectedSystemCategory(category))
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""))
    .map(category => ({
      value: category.id,
      label: category.name
    })), state.reportFilters.categoryIds);
  renderReportMultiOptions(els.reportMemberFilter, state.members
    .filter(member => member.status !== "removed")
    .map(member => ({
      value: member.id,
      label: member.displayName || member.emailNormalized || member.id
    })), state.reportFilters.memberIds);
  renderReportFilterButtons();
}

function renderReportMultiOptions(select, options, selectedValues = []) {
  if (!select) {
    return;
  }
  const selectedSet = new Set(selectedValues);
  select.innerHTML = options.map(option => `
    <option value="${escapeHtml(option.value)}" ${selectedSet.has(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>
  `).join("");
}

function renderReportFilterButtons() {
  ["accounts", "categories"].forEach(type => {
    const config = getReportFilterConfig(type);
    if (!config?.button) {
      return;
    }
    const selectedValues = state.reportFilters[config.filterKey] || [];
    const selectedCount = selectedValues.length;
    config.button.textContent = selectedCount === 0
      ? config.emptyLabel
      : selectedCount === config.options.length
        ? config.allSelectedLabel
        : `${selectedCount} ${selectedCount === 1 ? config.singularLabel : config.pluralLabel} selected`;
  });
}

function buildReportModel() {
  const windowData = getReportDateWindow();
  const rows = getReportRows(windowData);
  const previousRows = getReportRows(getPreviousReportWindow(windowData));
  const months = getMonthKeysBetween(windowData.startDate, windowData.endDate);
  const totalSpentMinor = rows.reduce((sum, row) => sum + Number(row.amountMinor || 0), 0);
  const categoryRows = buildReportCategoryRows(rows, previousRows, months.length);
  const monthlyRows = buildReportMonthlyRows(windowData, rows);

  return {
    ...windowData,
    rows,
    previousRows,
    months,
    totalSpentMinor,
    averageMonthlyMinor: months.length ? Math.round(totalSpentMinor / months.length) : 0,
    categoryRows,
    monthlyRows
  };
}

function getReportDateWindow() {
  if (state.reportLockedMonthKey) {
    const startDate = getMonthStartDate(state.reportLockedMonthKey);
    return {
      startDate,
      endDate: getMonthEndDate(startDate),
      label: formatMonthKey(state.reportLockedMonthKey),
      lockedMonthKey: state.reportLockedMonthKey
    };
  }

  const today = startOfDay(new Date());
  const currentMonthStart = getMonthStartDate(toMonthInput(today));
  if (state.reportRange === "last-month") {
    const startDate = addMonthsClamped(currentMonthStart, -1);
    return { startDate, endDate: getMonthEndDate(startDate), label: "Last month" };
  }
  if (state.reportRange === "custom") {
    const startDate = state.reportCustomFrom ? startOfDay(dateFromDateInput(state.reportCustomFrom)) : currentMonthStart;
    const endDate = state.reportCustomTo ? endOfDay(dateFromDateInput(state.reportCustomTo)) : today;
    return {
      startDate,
      endDate: endDate.getTime() < startDate.getTime() ? getMonthEndDate(startDate) : endDate,
      label: "Custom range"
    };
  }
  const rangeMonths = {
    "last-3": 3,
    "last-6": 6,
    "last-12": 12
  }[state.reportRange] || 1;
  const startDate = addMonthsClamped(currentMonthStart, -(rangeMonths - 1));
  return {
    startDate,
    endDate: endOfDay(today),
    label: rangeMonths === 1 ? "This month" : `Last ${rangeMonths} months`
  };
}

function getPreviousReportWindow(windowData) {
  const duration = windowData.endDate.getTime() - windowData.startDate.getTime();
  const endDate = new Date(windowData.startDate.getTime() - 1);
  const startDate = new Date(endDate.getTime() - duration);
  return { startDate, endDate };
}

function getReportRows(windowData) {
  const filters = state.reportFilters;
  const kind = filters.kind || "outcome";
  const accountIds = new Set(filters.accountIds || []);
  const categoryIds = new Set(filters.categoryIds || []);
  const memberIds = new Set(filters.memberIds || []);

  return getVisibleRawTransactions().filter(row => {
    const transactionMillis = getTimestampSortValue(row.transactionAt);
    if (transactionMillis < windowData.startDate.getTime() || transactionMillis > windowData.endDate.getTime()) {
      return false;
    }
    if (kind !== "all") {
      if (kind === "spent" || kind === "outcome") {
        if (row.postingKind !== "outcome") {
          return false;
        }
      } else if (row.displayKind !== kind && row.postingKind !== kind) {
        return false;
      }
    }
    if (!filters.includeSavingSpending && row.postingKind === "outcome" && row.savingGoalId) {
      return false;
    }
    if (isInvestmentCategoryId(row.categoryId)) {
      return false;
    }
    if (accountIds.size && !accountIds.has(row.accountId)) {
      return false;
    }
    if (categoryIds.size && !categoryIds.has(row.categoryId || "")) {
      return false;
    }
    if (state.scope === "household" && memberIds.size && !memberIds.has(row.createdByUserId || "")) {
      return false;
    }
    return true;
  });
}

function buildReportCategoryRows(rows, previousRows, monthCount) {
  const currentTotals = groupRowsByCategory(rows);
  const previousTotals = groupRowsByCategory(previousRows);
  const totalMinor = [...currentTotals.values()].reduce((sum, item) => sum + item.amountMinor, 0);

  return [...currentTotals.values()]
    .map(item => {
      const previousMinor = previousTotals.get(item.categoryId)?.amountMinor || 0;
      const trendDelta = item.amountMinor - previousMinor;
      return {
        ...item,
        averageMinor: monthCount ? Math.round(item.amountMinor / monthCount) : item.amountMinor,
        sharePercent: totalMinor ? Math.round((item.amountMinor / totalMinor) * 100) : 0,
        trendLabel: Math.abs(trendDelta) < 100 ? "Flat" : trendDelta > 0 ? "Up" : "Down",
        trendClass: Math.abs(trendDelta) < 100 ? "metric-neutral" : trendDelta > 0 ? "metric-over" : "metric-good"
      };
    })
    .sort((left, right) => right.amountMinor - left.amountMinor);
}

function groupRowsByCategory(rows) {
  return rows.reduce((map, row) => {
    const categoryId = row.categoryId || "uncategorized";
    const existing = map.get(categoryId) || {
      categoryId,
      categoryName: row.categoryNameSnapshot || getCategoryName(categoryId) || "Uncategorized",
      amountMinor: 0,
      rows: []
    };
    existing.amountMinor += Number(row.amountMinor || 0);
    existing.rows.push(row);
    map.set(categoryId, existing);
    return map;
  }, new Map());
}

function buildReportMonthlyRows(windowData, rows) {
  const monthKeys = getMonthKeysBetween(windowData.startDate, windowData.endDate);
  return monthKeys.map(monthKey => {
    const monthRows = rows.filter(row => toMonthInput(row.transactionAt?.toDate?.() || new Date(0)) === monthKey);
    const spentMinor = monthRows
      .filter(row => row.postingKind === "outcome")
      .reduce((sum, row) => sum + Number(row.amountMinor || 0), 0);
    const incomeMinor = monthRows
      .filter(row => row.postingKind === "income")
      .reduce((sum, row) => sum + Number(row.amountMinor || 0), 0);
    return {
      monthKey,
      spentMinor,
      incomeMinor,
      netMinor: incomeMinor - spentMinor
    };
  });
}

function renderReportKpis(model) {
  if (!els.reportTotalSpent) {
    return;
  }
  const topCategory = model.categoryRows[0];
  els.reportTotalSpent.textContent = formatRupiah(model.totalSpentMinor);
  els.reportAverageMonthly.textContent = formatRupiah(model.averageMonthlyMinor);
  els.reportTopCategoryShare.textContent = topCategory ? `${topCategory.sharePercent}%` : "0%";
  els.reportMonthsCovered.textContent = String(model.months.length || 0);
  els.reportMonthBackBtn.classList.toggle("hidden", !model.lockedMonthKey);
}

function renderReportCategoryBreakdown(model) {
  if (!els.reportCategoryBreakdown) {
    return;
  }
  els.reportCategoryBreakdown.innerHTML = model.categoryRows.length
    ? model.categoryRows.map(item => `
      <button class="report-list-row" type="button" data-action="drill-category" data-id="${escapeHtml(item.categoryId)}">
        <span>
          <strong>${escapeHtml(item.categoryName)}</strong>
          <small>${escapeHtml(formatRupiah(item.averageMinor))}/month | ${item.sharePercent}% of total</small>
        </span>
        <span class="report-row-end">
          <strong>${escapeHtml(formatRupiah(item.amountMinor))}</strong>
          <small class="${escapeHtml(item.trendClass)}">${escapeHtml(item.trendLabel)}</small>
        </span>
      </button>
    `).join("")
    : `<div class="empty-card"><h4>No category data</h4><p>Try a wider range or record matching transactions first.</p></div>`;
}

function handleReportCategoryActions(event) {
  const button = event.target.closest("[data-action='drill-category']");
  if (!button) {
    return;
  }
  state.reportDrillCategoryId = button.dataset.id || "";
  renderReportView();
}

function handleReportDrillActions(event) {
  if (event.target.closest("[data-action='close-category-drill']")) {
    state.reportDrillCategoryId = "";
    renderReportView();
  }
}

function renderReportCategoryDrill(model) {
  if (!els.reportCategoryDrill) {
    return;
  }
  const category = model.categoryRows.find(item => item.categoryId === state.reportDrillCategoryId);
  els.reportCategoryDrill.classList.toggle("hidden", !category);
  if (!category) {
    els.reportCategoryDrill.innerHTML = "";
    return;
  }

  const monthly = model.months.map(monthKey => {
    const amountMinor = category.rows
      .filter(row => toMonthInput(row.transactionAt?.toDate?.() || new Date(0)) === monthKey)
      .reduce((sum, row) => sum + Number(row.amountMinor || 0), 0);
    return `<div class="mini-table-row"><span>${escapeHtml(formatMonthKey(monthKey))}</span><strong>${escapeHtml(formatRupiah(amountMinor))}</strong></div>`;
  }).join("");
  const biggest = [...category.rows]
    .sort((left, right) => Number(right.amountMinor || 0) - Number(left.amountMinor || 0))
    .slice(0, 10)
    .map(row => `
      <div class="mini-table-row">
        <span>${escapeHtml(formatDate(row.transactionAt))} | ${escapeHtml(row.accountNameSnapshot || getAccountName(row.accountId))} | ${escapeHtml(row.note || "-")}</span>
        <strong>${escapeHtml(formatRupiah(row.amountMinor || 0))}</strong>
      </div>
    `).join("");

  els.reportCategoryDrill.innerHTML = `
    <div class="report-drawer-card">
      <div class="card-header space-between">
        <div>
          <h3 class="card-title">${escapeHtml(category.categoryName)}</h3>
          <p class="card-subtle">Monthly totals and biggest transactions in the selected range.</p>
        </div>
        <div class="action-row compact-actions">
          <button class="icon-btn subtle app-info-btn" type="button" data-info-topic="report-category-breakdown" aria-label="Explain category drill-in">i</button>
          <button class="ghost-btn small-btn" type="button" data-action="close-category-drill">Close</button>
        </div>
      </div>
      <div class="mini-table">${monthly}</div>
      <div class="section-divider"></div>
      <div class="mini-table">${biggest || `<p class="status-copy">No transactions in this category.</p>`}</div>
    </div>
  `;
}

function renderReportMonthlyTable(model) {
  if (!els.reportMonthlyTable) {
    return;
  }
  els.reportMonthlyTable.innerHTML = model.monthlyRows.length
    ? `
      <div class="report-table">
        <div class="report-table-row report-table-head">
          <span>Month</span>
          <span>Spent</span>
          <span>Income</span>
          <span>Net</span>
        </div>
        ${model.monthlyRows.map(row => `
          <button class="report-table-row" type="button" data-action="open-report-month" data-month="${escapeHtml(row.monthKey)}">
            <span>${escapeHtml(formatMonthKey(row.monthKey))}</span>
            <span>${escapeHtml(formatRupiah(row.spentMinor))}</span>
            <span>${escapeHtml(formatRupiah(row.incomeMinor))}</span>
            <span>${escapeHtml(formatRupiah(row.netMinor))}</span>
          </button>
        `).join("")}
      </div>
    `
    : `<div class="empty-card"><h4>No monthly data</h4><p>Choose a different time range.</p></div>`;
}

function handleReportMonthlyActions(event) {
  const button = event.target.closest("[data-action='open-report-month']");
  if (!button) {
    return;
  }
  state.reportLockedMonthKey = button.dataset.month || "";
  renderReportView();
}

function renderReportBudgetPerformance(model) {
  if (!els.reportBudgetPerformance) {
    return;
  }
  const rows = buildReportBudgetRows(model);
  els.reportBudgetPerformance.innerHTML = rows.length
    ? rows.map(item => `
      <article class="report-list-row static">
        <span>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.categoryLabel)} | hit rate ${item.hitRatePercent}%</small>
        </span>
        <span class="report-row-end">
          <strong>${escapeHtml(formatRupiah(item.actualMinor))}</strong>
          <small>Budget ${escapeHtml(formatRupiah(item.budgetedMinor))}</small>
        </span>
      </article>
    `).join("")
    : `<div class="empty-card"><h4>No budget performance yet</h4><p>Create budgets for the current view to compare actual spending.</p></div>`;
}

function buildReportBudgetRows(model) {
  const monthKeys = model.months;
  const rowsByMonth = new Map(monthKeys.map(monthKey => [monthKey, model.rows.filter(row => toMonthInput(row.transactionAt?.toDate?.() || new Date(0)) === monthKey)]));
  const budgetRows = getVisibleBudgets().map(budget => {
    const budgetCategoryIds = new Set(sanitizeStringArray(budget.categoryIds));
    const monthlyActuals = monthKeys.map(monthKey => (rowsByMonth.get(monthKey) || []).reduce((sum, row) => {
      if (row.postingKind !== "outcome" || !budgetCategoryIds.has(row.categoryId || "")) {
        return sum;
      }
      return sum + Number(row.amountMinor || 0);
    }, 0));
    const budgetedMinor = normalizeBudgetAmountToMonthly(budget);
    const overages = monthlyActuals.map(value => Math.max(0, value - budgetedMinor)).filter(Boolean);
    const monthsWithinBudget = monthlyActuals.filter(value => value <= budgetedMinor).length;
    const actualMinor = state.reportBudgetMode === "month"
      ? (monthlyActuals[monthlyActuals.length - 1] || 0)
      : Math.round(monthlyActuals.reduce((sum, value) => sum + value, 0) / Math.max(1, monthlyActuals.length));
    return {
      id: budget.id,
      name: budget.name,
      categoryLabel: summarizeBudgetCategories(budget),
      budgetedMinor,
      actualMinor,
      hitRatePercent: monthKeys.length ? Math.round((monthsWithinBudget / monthKeys.length) * 100) : 0,
      medianOverspendMinor: median(overages),
      overCount: overages.length,
      variance: variance(monthlyActuals)
    };
  });

  return budgetRows.sort((left, right) => {
    if (state.reportBudgetRanking === "average-over") {
      return right.medianOverspendMinor - left.medianOverspendMinor;
    }
    if (state.reportBudgetRanking === "volatile") {
      return right.variance - left.variance;
    }
    return right.overCount - left.overCount;
  });
}

function renderReportBudgetSuggestions(model) {
  if (!els.reportBudgetSuggestions) {
    return;
  }
  const buffer = getBudgetSuggestionBuffer();
  const suggestions = model.categoryRows
    .filter(item => model.months.length >= 2)
    .map(item => {
      const monthlyActuals = model.months.map(monthKey => item.rows
        .filter(row => toMonthInput(row.transactionAt?.toDate?.() || new Date(0)) === monthKey)
        .reduce((sum, row) => sum + Number(row.amountMinor || 0), 0));
      const nonZeroMonths = monthlyActuals.filter(Boolean).length;
      const suggestedMinor = Math.round(median(monthlyActuals) * (1 + buffer));
      return {
        ...item,
        suggestedMinor,
        confidence: nonZeroMonths >= 6 ? "High" : nonZeroMonths >= 3 ? "Medium" : "Low"
      };
    })
    .filter(item => item.suggestedMinor > 0)
    .slice(0, 8);

  els.reportBudgetSuggestions.innerHTML = suggestions.length
    ? suggestions.map(item => `
      <article class="report-list-row static">
        <span>
          <strong>${escapeHtml(item.categoryName)}</strong>
          <small>${escapeHtml(item.confidence)} confidence | ${escapeHtml(state.reportBudgetBuffer)} buffer</small>
        </span>
        <span class="report-row-end">
          <strong>${escapeHtml(formatRupiah(item.suggestedMinor))}</strong>
        </span>
      </article>
    `).join("")
    : `<div class="empty-card"><h4>No suggestions yet</h4><p>Use at least two months of category spending for suggested budgets.</p></div>`;
}

function getBudgetSuggestionBuffer() {
  if (state.reportBudgetBuffer === "tight") {
    return 0.05;
  }
  if (state.reportBudgetBuffer === "conservative") {
    return 0.2;
  }
  return 0.1;
}

function normalizeBudgetAmountToMonthly(budget) {
  const amountMinor = Number(budget.amountMinor || 0);
  if (budget.cycleType === "weekly") {
    return Math.round(amountMinor * 4.33);
  }
  if (budget.cycleType === "biweekly") {
    return Math.round(amountMinor * 2.17);
  }
  if (budget.cycleType === "quarterly") {
    return Math.round(amountMinor / 3);
  }
  if (budget.cycleType === "yearly") {
    return Math.round(amountMinor / 12);
  }
  return amountMinor;
}

function getMonthStartDate(monthKey) {
  return startOfDay(new Date(`${monthKey}-01T12:00:00`));
}

function getMonthEndDate(dateLike) {
  const date = startOfDay(dateLike);
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0));
}

function getMonthKeysBetween(startDate, endDate) {
  const keys = [];
  let cursor = getMonthStartDate(toMonthInput(startDate));
  const finalKey = toMonthInput(endDate);
  for (let guard = 0; guard < 240; guard += 1) {
    const key = toMonthInput(cursor);
    keys.push(key);
    if (key === finalKey) {
      break;
    }
    cursor = addMonthsClamped(cursor, 1);
  }
  return keys;
}

function median(values) {
  const sorted = values.filter(value => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) {
    return 0;
  }
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

function variance(values) {
  const cleanValues = values.filter(value => Number.isFinite(value));
  if (!cleanValues.length) {
    return 0;
  }
  const average = cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
  return cleanValues.reduce((sum, value) => sum + ((value - average) ** 2), 0) / cleanValues.length;
}

function renderPerformanceView() {
  const budgetSummaries = getVisibleBudgets().map(budget => buildBudgetSummary(budget));
  const savingSummaries = getVisibleSavingGoals().map(buildSavingSummary);
  const reminders = getVisibleBillReminders();
  const completedBills = getRecentlyCompletedBillOccurrences();

  const overBudgetCount = budgetSummaries.filter(item => item.state === "over").length;
  const nearBudgetCount = budgetSummaries.filter(item => item.state === "near").length;
  const activeSavingsCount = savingSummaries.filter(item => item.state !== "completed").length;
  const completedSavingsCount = savingSummaries.filter(item => item.state === "completed").length;

  els.performanceBudgetSummary.textContent = budgetSummaries.length
    ? `${overBudgetCount} over | ${nearBudgetCount} near`
    : "0 tracked";
  els.performanceSavingsSummary.textContent = savingSummaries.length
    ? `${completedSavingsCount} achieved | ${activeSavingsCount} active`
    : "0 active";
  els.performanceBillsSummary.textContent = reminders.length
    ? `${reminders.length} due`
    : "0 due";

  els.performanceBudgetsList.innerHTML = budgetSummaries.length
    ? budgetSummaries.map(summary => `
        <article class="list-row compact-row">
          <div class="list-row-head">
            <div>
              <p class="list-row-title">${escapeHtml(summary.name)}</p>
              <div class="list-row-meta">
                <span>${escapeHtml(summary.periodLabel)}</span>
                <span>|</span>
                <span>${escapeHtml(summary.stateLabel)}</span>
              </div>
            </div>
            <p class="history-amount ${summary.stateClass}">${escapeHtml(formatRupiah(summary.remainingMinor))}</p>
          </div>
        </article>
      `).join("")
    : `<div class="empty-card"><h4>No budget data yet</h4><p>Create budgets in Planning to see read-only status here.</p></div>`;

  els.performanceSavingsList.innerHTML = savingSummaries.length
    ? savingSummaries.map(summary => `
        <article class="list-row compact-row">
          <div class="list-row-head">
            <div>
              <p class="list-row-title">${escapeHtml(summary.name)}</p>
              <div class="list-row-meta">
                <span>${escapeHtml(summary.stateLabel)}</span>
                <span>|</span>
                <span>${escapeHtml(formatRupiah(summary.progressMinor))} / ${escapeHtml(formatRupiah(summary.targetAmountMinor))}</span>
              </div>
            </div>
            <p class="history-amount ${summary.stateClass}">${escapeHtml(`${summary.percent}%`)}</p>
          </div>
        </article>
      `).join("")
    : `<div class="empty-card"><h4>No savings data yet</h4><p>Create savings in Planning to track progress and achievements here.</p></div>`;

  els.performanceBillsList.innerHTML = reminders.length || completedBills.length
    ? [
        ...reminders.map(reminder => `
          <article class="list-row compact-row">
            <div class="list-row-head">
              <div>
                <p class="list-row-title">${escapeHtml(reminder.bill.name)}</p>
                <div class="list-row-meta">
                  <span>${escapeHtml(reminder.stateLabel)}</span>
                  <span>|</span>
                  <span>${escapeHtml(formatDate(Timestamp.fromDate(reminder.dueDate)))}</span>
                </div>
              </div>
            </div>
          </article>
        `),
        ...completedBills.slice(0, 5).map(occurrence => `
          <article class="list-row compact-row">
            <div class="list-row-head">
              <div>
                <p class="list-row-title">${escapeHtml(getBillName(occurrence.billId))}</p>
                <div class="list-row-meta">
                  <span>Completed</span>
                  <span>|</span>
                  <span>${escapeHtml(formatDate(occurrence.dueAt))}</span>
                </div>
              </div>
            </div>
          </article>
        `)
      ].join("")
    : `<div class="empty-card"><h4>No bill data yet</h4><p>Create recurring bills in Planning to monitor due and completed periods here.</p></div>`;
}

function renderInvestmentsView() {
  if (!els.investmentsList) {
    return;
  }

  const investments = getVisibleInvestments();
  const totalSummary = buildInvestmentScopeSummary(investments);
  els.investmentTotalValue.textContent = formatRupiah(totalSummary.currentValueMinor);
  if (els.investmentTotalDeposit) {
    els.investmentTotalDeposit.textContent = formatRupiah(totalSummary.totalContributedMinor);
  }
  if (els.investmentTotalWithdrawal) {
    els.investmentTotalWithdrawal.textContent = formatRupiah(totalSummary.totalWithdrawnMinor);
  }
  els.investmentNetInvested.textContent = formatRupiah(totalSummary.netInvestedMinor);
  els.investmentGainLoss.textContent = `${totalSummary.gainLossMinor >= 0 ? "+" : "-"}${formatRupiah(Math.abs(totalSummary.gainLossMinor))}`;
  els.investmentGainLoss.className = `summary-value ${totalSummary.gainLossMinor >= 0 ? "income" : "outcome"}`;
  els.investmentFormCard?.classList.toggle("hidden", !state.showInvestmentForm);
  if (els.investmentAddPortfolioBtn) {
    els.investmentAddPortfolioBtn.textContent = state.showInvestmentForm ? "Hide form" : "Add a portfolio";
  }

  els.investmentsList.innerHTML = investments.length
    ? investments.map(investment => {
        const summary = buildInvestmentSummary(investment);
        const pnlPercent = summary.netInvestedMinor > 0
          ? Math.round((summary.gainLossMinor / summary.netInvestedMinor) * 100)
          : 0;
        return `
          <article class="list-row">
            <div class="list-row-head">
              <div>
                <p class="list-row-title">${escapeHtml(investment.name)}</p>
                <div class="list-row-meta">
                  <span>${escapeHtml(resolvePlanningScopeLabel(investment))}</span>
                  <span>|</span>
                  <span>Owner: ${escapeHtml(getMemberName(getInvestmentOwnerUserId(investment)))}</span>
                </div>
                ${investment.note ? `<p class="status-copy">${escapeHtml(investment.note)}</p>` : ""}
              </div>
              <div class="list-row-actions">
                <button class="text-btn" type="button" data-action="edit-investment" data-id="${escapeHtml(investment.id)}">Edit</button>
                <button class="text-btn" type="button" data-action="toggle-investment-scope" data-id="${escapeHtml(investment.id)}">${investment.scopeType === "household" ? "Move to My view" : "Move to Household"}</button>
                <button class="text-btn danger" type="button" data-action="archive-investment" data-id="${escapeHtml(investment.id)}">Archive</button>
              </div>
            </div>
            <div class="planning-metric-grid">
              <div class="metric-chip">
                <span>Valuation</span>
                <strong>${escapeHtml(formatRupiah(summary.currentValueMinor))}</strong>
              </div>
              <div class="metric-chip">
                <span>Net Deposits</span>
                <strong>${escapeHtml(formatRupiah(summary.netInvestedMinor))}</strong>
              </div>
              <div class="metric-chip ${summary.gainLossMinor >= 0 ? "metric-good" : "metric-over"}">
                <span>Total P&amp;L</span>
                <strong>${escapeHtml(`${summary.gainLossMinor >= 0 ? "+" : "-"}${formatRupiah(Math.abs(summary.gainLossMinor))} (${pnlPercent}%)`)}</strong>
              </div>
            </div>
          </article>
        `;
      }).join("")
    : `<div class="empty-card"><h4>No investments yet</h4><p>Create a portfolio to track deposits, withdrawals, and manual value updates.</p></div>`;

  if (els.investmentActivityList) {
    const visibleInvestmentIds = new Set(investments.map(investment => investment.id));
    const events = state.investmentEvents
      .filter(event => visibleInvestmentIds.has(event.investmentAccountId) && event.status !== "deleted")
      .sort((left, right) => getTimestampSortValue(right.createdAt) - getTimestampSortValue(left.createdAt))
      .slice(0, 20);
    els.investmentActivityList.innerHTML = events.length
      ? events.map(event => `
          <article class="list-row compact-row">
            <div class="list-row-head">
              <div>
                <p class="list-row-title">${escapeHtml(getInvestmentEventLabel(event.eventType))}</p>
                <div class="list-row-meta">
                  <span>${escapeHtml(event.investmentAccountNameSnapshot || getInvestmentName(event.investmentAccountId))}</span>
                  <span>|</span>
                  <span>${escapeHtml(formatDate(event.transactionAt || event.createdAt))}</span>
                  <span>|</span>
                  <span>Created ${escapeHtml(formatDateTime(event.createdAt))}</span>
                  ${event.note ? `<span>|</span><span>${escapeHtml(event.note)}</span>` : ""}
                </div>
              </div>
                <div class="list-row-actions investment-event-actions">
                  <p class="history-amount ${event.eventType === "withdrawal" ? "income" : event.eventType === "deposit" || event.eventType === "contribution" ? "outcome" : "transfer"}">${escapeHtml(formatRupiah(event.amountMinor || 0))}</p>
                  <div class="overflow-actions">
                  <button class="overflow-btn tiny-overflow-btn" type="button" aria-label="Open investment activity actions" data-action="toggle-investment-event-menu" data-id="${escapeHtml(event.id)}">&#8942;</button>
                  <div class="overflow-menu${state.openInvestmentEventMenuId === event.id ? "" : " hidden"}">
                    <button class="overflow-item" type="button" data-action="edit-investment-event" data-id="${escapeHtml(event.id)}">Edit</button>
                    <button class="overflow-item danger" type="button" data-action="delete-investment-event" data-id="${escapeHtml(event.id)}">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        `).join("")
      : `<div class="empty-card"><h4>No investment activity yet</h4><p>Deposits, withdrawals, and value updates will appear here.</p></div>`;
  }
}

function populateBudgetCategoryOptions(options = {}) {
  if (!els.budgetCategoryList) {
    return;
  }
  const { preserveSelection = true } = options;
  const currentSelection = preserveSelection ? getSelectedBudgetCategoryIds() : [];
  const selectedIds = new Set(
    state.editBudgetId
      ? sanitizeStringArray(state.budgets.find(item => item.id === state.editBudgetId)?.categoryIds)
      : currentSelection
  );
  const categories = getBudgetEligibleCategories();

  if (!categories.length) {
    els.budgetCategoryList.innerHTML = `<p class="status-copy">Create at least one non-saving outcome category first.</p>`;
    updateBudgetCategorySummary();
    return;
  }

  els.budgetCategoryList.innerHTML = categories.map(category => `
    <label class="choice-item">
      <input type="checkbox" value="${category.id}" ${selectedIds.has(category.id) ? "checked" : ""} />
      <span>${escapeHtml(category.name)}</span>
    </label>
  `).join("");
  updateBudgetCategorySummary();
}

function populateSavingSelects() {
  if (!els.savingLinkedAccount) {
    return;
  }
  const editingSaving = state.editSavingGoalId
    ? state.savingGoals.find(item => item.id === state.editSavingGoalId)
    : null;
  const currentLinkedAccountId = els.savingLinkedAccount.value;
  const savingScopeType = editingSaving?.scopeType || getCurrentPlanningScopeType();
  const accountOptions = getEligibleAccountsForScope(savingScopeType)
    .map(account => `<option value="${account.id}">${escapeHtml(getAccountOptionLabel(account))}</option>`)
    .join("");

  els.savingLinkedAccount.innerHTML = accountOptions || `<option value="">No eligible accounts</option>`;
  if (editingSaving?.linkedAccountId) {
    setSelectValue(els.savingLinkedAccount, editingSaving.linkedAccountId);
  } else if (currentLinkedAccountId) {
    setSelectValue(els.savingLinkedAccount, currentLinkedAccountId);
  }

}

function populateBillCategorySelects() {
  if (!els.billCategory) {
    return;
  }
  const categories = getBillEligibleCategories();
  const currentCategoryId = els.billCategory.value;
  const options = categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("");
  els.billCategory.innerHTML = options || `<option value="">No eligible categories</option>`;

  const editingBill = state.editBillId
    ? state.recurringBills.find(item => item.id === state.editBillId)
    : null;
  if (editingBill?.categoryId) {
    setSelectValue(els.billCategory, editingBill.categoryId);
  } else if (currentCategoryId) {
    setSelectValue(els.billCategory, currentCategoryId);
  }
}

function populateInvestmentSelects() {
  if (!els.investmentMovementAccount) {
    return;
  }

  const investments = getVisibleInvestments();
  const selectedInvestmentId = els.investmentMovementAccount.value;
  const selectedLedgerAccountId = els.investmentMovementLedgerAccount.value;
  const investmentOptions = investments
    .map(investment => `<option value="${investment.id}">${escapeHtml(investment.name)}</option>`)
    .join("");
  els.investmentMovementAccount.innerHTML = investmentOptions || `<option value="">No visible investments</option>`;
  if (selectedInvestmentId) {
    setSelectValue(els.investmentMovementAccount, selectedInvestmentId);
  }

  const selectedInvestment = investments.find(investment => investment.id === els.investmentMovementAccount.value);
  const accountOptions = getInvestmentMovementAccountOptions(selectedInvestment, els.investmentMovementType.value)
    .map(account => `<option value="${account.id}">${escapeHtml(getAccountOptionLabel(account))}</option>`)
    .join("");
  els.investmentMovementLedgerAccount.innerHTML = accountOptions || `<option value="">No available accounts</option>`;
  if (selectedLedgerAccountId) {
    setSelectValue(els.investmentMovementLedgerAccount, selectedLedgerAccountId);
  }
  if (els.investmentMovementLedgerLabel) {
    els.investmentMovementLedgerLabel.textContent = els.investmentMovementType.value === "withdrawal"
      ? "Return account"
      : "Source account";
  }
  if (els.investmentAssetAccount) {
    els.investmentAssetAccount.innerHTML = investmentOptions || `<option value="">No visible investments</option>`;
  }
}

function syncInvestmentForm() {
  if (!els.investmentCurrentValue) {
    return;
  }
  els.investmentCurrentValue.disabled = false;
  els.investmentInitialFields?.classList.toggle("hidden", Boolean(state.editInvestmentId));
  els.investmentFormCard?.classList.toggle("hidden", !state.showInvestmentForm);
}

function syncBudgetForm() {
  const isCustom = els.budgetCycleType.value === "custom";
  els.budgetEndDateField.classList.toggle("hidden", !isCustom);
  els.budgetEndDate.required = isCustom;
}

function resetBudgetForm(options = {}) {
  const { clearMessage = true } = options;
  state.editBudgetId = null;
  els.budgetEditId.value = "";
  els.budgetForm.reset();
  els.budgetHouseholdScope.checked = state.scope === "household";
  els.budgetCycleType.value = "monthly";
  els.budgetStartDate.value = toDateInput(new Date());
  els.budgetEndDate.value = "";
  setMoneyInputValue(els.budgetAmount, 0);
  els.budgetSubmitBtn.textContent = "Save budget";
  els.budgetCancelBtn.classList.add("hidden");
  if (clearMessage) {
    setMessage(els.budgetMessage, "");
  }
  if (els.budgetCategoryPicker) {
    els.budgetCategoryPicker.open = false;
  }
  syncBudgetForm();
  populateBudgetCategoryOptions({ preserveSelection: false });
}

function resetSavingForm(options = {}) {
  const { clearMessage = true } = options;
  state.editSavingGoalId = null;
  els.savingEditId.value = "";
  els.savingForm.reset();
  els.savingHouseholdScope.checked = state.scope === "household";
  els.savingTargetMonth.value = toMonthInput(new Date());
  setMoneyInputValue(els.savingTargetAmount, 0);
  els.savingSubmitBtn.textContent = "Save saving";
  els.savingCancelBtn.classList.add("hidden");
  if (clearMessage) {
    setMessage(els.savingMessage, "");
  }
  populateSavingSelects();
}

function resetBillForm(options = {}) {
  const { clearMessage = true } = options;
  state.editBillId = null;
  els.billEditId.value = "";
  els.billForm.reset();
  els.billHouseholdScope.checked = state.scope === "household";
  els.billSchedule.value = "monthly";
  els.billAnchorDate.value = toDateInput(new Date());
  els.billSubmitBtn.textContent = "Save bill";
  els.billCancelBtn.classList.add("hidden");
  if (clearMessage) {
    setMessage(els.billMessage, "");
  }
  populateBillCategorySelects();
}

function resetInvestmentForm(options = {}) {
  const { clearMessage = true } = options;
  if (!els.investmentForm) {
    return;
  }
  state.editInvestmentId = null;
  els.investmentEditId.value = "";
  els.investmentForm.reset();
  setMoneyInputValue(els.investmentCurrentValue, 0);
  setMoneyInputValue(els.investmentInitialDeposit, 0);
  setMoneyInputValue(els.investmentInitialWithdrawal, 0);
  els.investmentSubmitBtn.textContent = "Save portfolio";
  els.investmentCancelBtn.classList.add("hidden");
  state.showInvestmentForm = false;
  if (clearMessage) {
    setMessage(els.investmentMessage, "");
  }
  syncInvestmentForm();
  populateInvestmentSelects();
}

function resetInvestmentMovementForm(options = {}) {
  const { clearMessage = true } = options;
  state.editInvestmentEventId = null;
  els.investmentMovementForm.reset();
  els.investmentMovementDate.value = toDateInput(new Date());
  setMoneyInputValue(els.investmentMovementAmount, 0);
  setMoneyInputValue(els.investmentMovementFeeAmount, 0);
  els.investmentMovementSubmitBtn.textContent = "Save movement";
  if (clearMessage) {
    setMessage(els.investmentMovementMessage, "");
  }
  syncInvestmentMovementFeeField();
  populateInvestmentSelects();
}

function resetInvestmentAssetForm(options = {}) {
  const { clearMessage = true } = options;
  if (!els.investmentAssetForm) {
    return;
  }
  state.editInvestmentAssetId = null;
  els.investmentAssetEditId.value = "";
  els.investmentAssetForm.reset();
  setMoneyInputValue(els.investmentAssetValue, 0);
  els.investmentAssetSubmitBtn.textContent = "Save asset";
  els.investmentAssetCancelBtn.classList.add("hidden");
  if (clearMessage) {
    setMessage(els.investmentAssetMessage, "");
  }
  populateInvestmentSelects();
}

function resetHouseholdLocalForms() {
  resetAccountForm();
  resetCategoryForm();
  resetTransactionForm();
  resetBudgetForm();
  resetSavingForm();
  resetBillForm();
  resetInvestmentForm();
  resetInvestmentMovementForm();
  resetInvestmentAssetForm();
}

function getVisibleBudgets() {
  return getVisiblePlanningItems(state.budgets);
}

function getVisibleSavingGoals() {
  return getVisiblePlanningItems(state.savingGoals, { includeCompleted: true });
}

function getActiveManualCategoryCount() {
  return state.categories.filter(category => category.status === "active" && !isProtectedSystemCategory(category)).length;
}

function getVisibleBills() {
  return getVisiblePlanningItems(state.recurringBills);
}

function getVisibleInvestments() {
  return getVisiblePlanningItems(state.investmentAccounts);
}

function getInvestmentAssets(investmentId) {
  return state.investmentAssets
    .filter(asset => asset.investmentAccountId === investmentId && asset.status !== "archived")
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""));
}

function getInvestmentEvents(investmentId) {
  return state.investmentEvents.filter(event => event.investmentAccountId === investmentId && event.status !== "deleted");
}

function buildInvestmentSummary(investment) {
  const events = getInvestmentEvents(investment.id);
  const totalContributedMinor = events
    .filter(event => event.eventType === "contribution" || event.eventType === "deposit")
    .reduce((sum, event) => sum + Number(event.amountMinor || 0), 0);
  const totalWithdrawnMinor = events
    .filter(event => event.eventType === "withdrawal")
    .reduce((sum, event) => sum + Number(event.amountMinor || 0), 0);
  const currentValueMinor = Number(investment.currentValueMinor || 0);
  const netContributedMinor = totalContributedMinor - totalWithdrawnMinor;
  const gainLossMinor = currentValueMinor + totalWithdrawnMinor - totalContributedMinor;

  return {
    currentValueMinor,
    totalContributedMinor,
    totalWithdrawnMinor,
    netContributedMinor,
    netInvestedMinor: netContributedMinor,
    gainLossMinor,
    unrealizedMinor: gainLossMinor
  };
}

function getInvestmentCategory(eventType) {
  return eventType === "withdrawal"
    ? getSystemCategoryByKey("investment_withdrawal")
    : getSystemCategoryByKey("investment_deposit");
}

function buildInvestmentScopeSummary(investments = getVisibleInvestments()) {
  return investments.reduce((summary, investment) => {
    const item = buildInvestmentSummary(investment);
    summary.currentValueMinor += item.currentValueMinor;
    summary.totalContributedMinor += item.totalContributedMinor;
    summary.totalWithdrawnMinor += item.totalWithdrawnMinor;
    summary.netInvestedMinor += item.netInvestedMinor;
    summary.gainLossMinor += item.gainLossMinor;
    return summary;
  }, {
    currentValueMinor: 0,
    totalContributedMinor: 0,
    totalWithdrawnMinor: 0,
    netInvestedMinor: 0,
    gainLossMinor: 0
  });
}

function getInvestmentEventValueEffect(eventRecord) {
  if (!eventRecord) {
    return 0;
  }
  if (eventRecord.eventType === "withdrawal") {
    return -Number(eventRecord.amountMinor || 0);
  }
  if (eventRecord.eventType === "deposit" || eventRecord.eventType === "contribution") {
    return Number(eventRecord.amountMinor || 0);
  }
  return 0;
}

function getInvestmentOwnerUserId(investment) {
  return investment?.ownerUserId || investment?.createdByUserId || "";
}

function getInvestmentMovementAccountOptions(investment, eventType) {
  if (!investment) {
    return [];
  }
  if (eventType === "withdrawal") {
    if (investment.scopeType === "household") {
      return getOwnedActiveAccounts();
    }
    const ownerUserId = getInvestmentOwnerUserId(investment);
    return getActiveAccounts().filter(account => account.primaryOwnerUserId === ownerUserId);
  }
  return getOwnedActiveAccounts();
}

function getInvestmentName(investmentId = "") {
  return state.investmentAccounts.find(item => item.id === investmentId)?.name || "Investment";
}

function getInvestmentEventLabel(eventType = "") {
  if (eventType === "deposit" || eventType === "contribution") {
    return "Investment deposit";
  }
  if (eventType === "withdrawal") {
    return "Investment withdrawal";
  }
  if (eventType === "valuation" || eventType === "valuation_update") {
    return "Value update";
  }
  if (eventType === "archive") {
    return "Archived";
  }
  return "Investment activity";
}

function buildInvestmentEventPayload({ investment, eventType, amountMinor, note, ledgerAccount = null, ledgerTransactionId = null, transactionGroupId = null, transactionAt = null }) {
  return {
    investmentAccountId: investment.id,
    investmentAccountNameSnapshot: investment.name,
    eventType,
    amountMinor,
    note: cleanText(note),
    ledgerAccountId: ledgerAccount?.id || null,
    ledgerAccountNameSnapshot: ledgerAccount?.name || null,
    ledgerTransactionId,
    transactionGroupId,
    transactionAt,
    scopeType: investment.scopeType,
    ownerUserId: investment.ownerUserId || null,
    status: "active",
    createdByUserId: state.authUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

async function addInvestmentEvent({ investment, eventType, amountMinor, note, ledgerAccount = null, ledgerTransactionId = null, transactionGroupId = null, transactionAt = null }) {
  await setDoc(doc(collection(db, "households", state.household.id, "investmentEvents")), buildInvestmentEventPayload({
    investment,
    eventType,
    amountMinor,
    note,
    ledgerAccount,
    ledgerTransactionId,
    transactionGroupId,
    transactionAt
  }));
}

function getVisiblePlanningItems(items, options = {}) {
  const { includeArchived = false, includeCompleted = false } = options;
  return items.filter(item => {
    if (!item || !matchesPlanningScope(item)) {
      return false;
    }
    if (includeArchived) {
      return true;
    }
    if (item.status === "archived") {
      return false;
    }
    if (!includeCompleted && item.status === "completed") {
      return false;
    }
    return true;
  });
}

function matchesPlanningScope(item) {
  if (!item || !state.authUser) {
    return false;
  }
  if (state.scope === "personal") {
    return item.scopeType !== "household" && item.ownerUserId === state.authUser.uid;
  }
  return item.scopeType === "household";
}

function isCurrentScopeHousehold() {
  return state.scope === "household";
}

function getCurrentPlanningScopeType() {
  return isCurrentScopeHousehold() ? "household" : "personal";
}

function getPlanningScopeDescription(scopeType, itemLabelPlural) {
  if (scopeType === "household") {
    return `Current view: Household view. New ${itemLabelPlural} created here belong to the whole household.`;
  }
  return `Current view: My view. New ${itemLabelPlural} created here belong to you only.`;
}

function syncPlanningScopeDefaults() {
  if (!state.editBudgetId) {
    els.budgetHouseholdScope.checked = isCurrentScopeHousehold();
  }
  if (!state.editSavingGoalId) {
    els.savingHouseholdScope.checked = isCurrentScopeHousehold();
  }
  if (!state.editBillId) {
    els.billHouseholdScope.checked = isCurrentScopeHousehold();
  }
}

function renderPlanningScopeCopy() {
  const budgetScopeType = state.editBudgetId
    ? state.budgets.find(item => item.id === state.editBudgetId)?.scopeType || getCurrentPlanningScopeType()
    : getCurrentPlanningScopeType();
  const savingScopeType = state.editSavingGoalId
    ? state.savingGoals.find(item => item.id === state.editSavingGoalId)?.scopeType || getCurrentPlanningScopeType()
    : getCurrentPlanningScopeType();
  const billScopeType = state.editBillId
    ? state.recurringBills.find(item => item.id === state.editBillId)?.scopeType || getCurrentPlanningScopeType()
    : getCurrentPlanningScopeType();
  const investmentScopeType = state.editInvestmentId
    ? state.investmentAccounts.find(item => item.id === state.editInvestmentId)?.scopeType || getCurrentPlanningScopeType()
    : getCurrentPlanningScopeType();

  if (els.budgetScopeCopy) {
    els.budgetScopeCopy.textContent = getPlanningScopeDescription(budgetScopeType, "budgets");
  }
  if (els.savingScopeCopy) {
    els.savingScopeCopy.textContent = getPlanningScopeDescription(savingScopeType, "savings");
  }
  if (els.billScopeCopy) {
    els.billScopeCopy.textContent = getPlanningScopeDescription(billScopeType, "recurring bills");
  }
  if (els.investmentScopeCopy) {
    els.investmentScopeCopy.textContent = getPlanningScopeDescription(investmentScopeType, "investment accounts");
  }
}

function getPlanningCreateMessage(itemLabel, scopeType) {
  const visibleInCurrentScope = scopeType === "household"
    ? isCurrentScopeHousehold()
    : !isCurrentScopeHousehold();

  if (visibleInCurrentScope) {
    return `${itemLabel} created.`;
  }

  return `${itemLabel} created. Switch to ${scopeType === "household" ? "Household view" : "My view"} to see it.`;
}

function getSelectedBudgetCategoryIds() {
  return [...els.budgetCategoryList.querySelectorAll("input[type='checkbox']:checked")]
    .map(input => input.value)
    .filter(Boolean);
}

function summarizeSelectedBudgetCategories(categoryIds) {
  const names = sanitizeStringArray(categoryIds)
    .map(categoryId => getCategoryName(categoryId))
    .filter(Boolean);

  if (!names.length) {
    return "Choose one or more categories";
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names[0]} +${names.length - 1} more`;
}

function updateBudgetCategorySummary() {
  if (!els.budgetCategorySummary) {
    return;
  }

  const selectedIds = getSelectedBudgetCategoryIds();
  els.budgetCategorySummary.textContent = summarizeSelectedBudgetCategories(selectedIds);
}

function resolvePlanningScopeLabel(item) {
  return item.scopeType === "household" ? "Household" : "Personal";
}

function buildSavingAccountOptionValue(goalId = "") {
  return `${SAVING_ACCOUNT_OPTION_PREFIX}${goalId}`;
}

function buildInvestmentAccountOptionValue(investmentId = "") {
  return `${INVESTMENT_ACCOUNT_OPTION_PREFIX}${investmentId}`;
}

function isSavingAccountOptionValue(value = "") {
  return String(value).startsWith(SAVING_ACCOUNT_OPTION_PREFIX);
}

function isInvestmentAccountOptionValue(value = "") {
  return String(value).startsWith(INVESTMENT_ACCOUNT_OPTION_PREFIX);
}

function parseSavingAccountOptionValue(value = "") {
  return isSavingAccountOptionValue(value)
    ? String(value).slice(SAVING_ACCOUNT_OPTION_PREFIX.length)
    : "";
}

function parseInvestmentAccountOptionValue(value = "") {
  return isInvestmentAccountOptionValue(value)
    ? String(value).slice(INVESTMENT_ACCOUNT_OPTION_PREFIX.length)
    : "";
}

function getOwnedActiveAccounts() {
  return getActiveAccounts().filter(account => account.primaryOwnerUserId === state.authUser?.uid);
}

function getEligibleAccountsForScope(scopeType = "personal") {
  const activeAccounts = getActiveAccounts();
  if (scopeType === "household") {
    return activeAccounts;
  }
  return activeAccounts.filter(account => account.primaryOwnerUserId === state.authUser?.uid);
}

function getBudgetEligibleCategories() {
  return getActiveCategories().filter(category => {
    if (isProtectedSystemCategory(category)) {
      return false;
    }
    return ["outcome", "both"].includes(category.direction);
  });
}

function getBillEligibleCategories() {
  return getBudgetEligibleCategories();
}

function getSavingCategory() {
  return state.categories.find(category => isSavingCategory(category)) || null;
}

function isSavingCategory(category) {
  if (!category) {
    return false;
  }
  return category.systemKey === "saving" || cleanText(category.name || "").toLowerCase() === "saving";
}

function isProtectedSystemCategory(category) {
  return Boolean(category?.systemKey && PROTECTED_SYSTEM_CATEGORY_KEYS.has(category.systemKey));
}

function getCategorySystemKey(categoryId = "") {
  return state.categories.find(category => category.id === categoryId)?.systemKey || "";
}

function isInvestmentCategoryId(categoryId = "") {
  return INVESTMENT_CATEGORY_KEYS.has(getCategorySystemKey(categoryId));
}

function getSystemCategoryByKey(systemKey) {
  return state.categories.find(category => category.status === "active" && category.systemKey === systemKey) || null;
}

async function ensureSystemCategories() {
  if (state.ensuringSystemCategories || !state.household?.id || !state.authUser || !state.member) {
    return;
  }

  const missingSeeds = SYSTEM_CATEGORY_SEEDS.filter(seed => !getSystemCategoryByKey(seed.systemKey));
  if (!missingSeeds.length) {
    return;
  }

  state.ensuringSystemCategories = true;
  try {
    const batch = writeBatch(db);
    missingSeeds.forEach(seed => {
      batch.set(doc(db, "households", state.household.id, "categories", seed.id), {
        name: seed.name,
        description: seed.description,
        direction: seed.direction,
        systemKey: seed.systemKey,
        status: "active",
        createdByUserId: state.authUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    console.warn("Could not ensure system categories:", error);
  } finally {
    state.ensuringSystemCategories = false;
  }
}

function getLinkedActiveAccountForSaving(goal) {
  if (!goal) {
    return null;
  }
  return state.accounts.find(account => account.id === goal.linkedAccountId && account.status === "active") || null;
}

function getAccessibleSavingGoals(options = {}) {
  const { includeArchived = false, includeCompleted = true } = options;
  return state.savingGoals.filter(goal => {
    if (!goal) {
      return false;
    }
    if (!includeArchived && goal.status === "archived") {
      return false;
    }
    if (!includeCompleted && goal.status === "completed") {
      return false;
    }
    return Boolean(getLinkedActiveAccountForSaving(goal));
  });
}

function getSelectableSavingsForSource(options = {}) {
  const { includeGoalId = "" } = options;
  return getAccessibleSavingGoals({ includeCompleted: true }).filter(goal => {
    const linkedAccount = getLinkedActiveAccountForSaving(goal);
    if (!goal || !linkedAccount) {
      return false;
    }
    if (linkedAccount.primaryOwnerUserId !== state.authUser?.uid) {
      return false;
    }
    if (goal.id === includeGoalId) {
      return goal.status !== "archived";
    }
    return goal.status !== "archived" && getSavingAvailableMinor(goal.id) > 0;
  }).sort((left, right) => (left.name || "").localeCompare(right.name || ""));
}

function getSelectableSavingsForTransferDestination(options = {}) {
  const { includeGoalId = "" } = options;
  return getAccessibleSavingGoals({ includeCompleted: true }).filter(goal => {
    if (!goal) {
      return false;
    }
    if (goal.id === includeGoalId) {
      return goal.status !== "archived";
    }
    return goal.status === "active";
  });
}

function getSavingsForTransferSource(accountId = "") {
  if (!accountId) {
    return [];
  }
  return getSelectableSavingsForTransferDestination()
    .filter(goal => goal.status === "active" && goal.linkedAccountId === accountId)
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""));
}

function getSavingAccountOptionLabel(goal) {
  const linkedAccount = getLinkedActiveAccountForSaving(goal);
  const linkedAccountName = linkedAccount ? getAccountOptionLabel(linkedAccount) : getAccountName(goal.linkedAccountId);
  const completedSuffix = goal.status === "completed" ? " | completed" : "";
  return `[Saving] ${goal.name} | ${linkedAccountName}${completedSuffix}`;
}

function getSavingTransferTargetOptionLabel(goal) {
  const linkedAccount = getLinkedActiveAccountForSaving(goal);
  const linkedAccountName = linkedAccount ? getAccountOptionLabel(linkedAccount) : getAccountName(goal.linkedAccountId);
  return `[Reserve to saving] ${goal.name} | ${linkedAccountName}`;
}

function scrollEditorIntoView(element) {
  if (!element) {
    return;
  }

  requestAnimationFrame(() => {
    const target = element.closest(".card") || element;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function resolveSavingGoalByAccountOption(value, options = {}) {
  const { includeCompleted = true } = options;
  const goalId = parseSavingAccountOptionValue(value);
  if (!goalId) {
    return null;
  }
  return getAccessibleSavingGoals({ includeCompleted }).find(goal => {
    if (goal.id !== goalId || goal.status === "archived") {
      return false;
    }
    if (!includeCompleted && goal.status === "completed") {
      return false;
    }
    return Boolean(getLinkedActiveAccountForSaving(goal));
  }) || null;
}

function resolveTransactionAccountSelection(optionValue = els.transactionAccount.value, options = {}) {
  const { includeCompleted = true } = options;
  const savingGoal = resolveSavingGoalByAccountOption(optionValue, { includeCompleted });
  if (savingGoal) {
    return {
      optionType: "saving",
      account: getLinkedActiveAccountForSaving(savingGoal),
      savingGoal
    };
  }

  return {
    optionType: "account",
    account: state.accounts.find(account => account.id === optionValue && account.status === "active") || null,
    savingGoal: null
  };
}

function resolveTransferDestinationSelection(optionValue = els.transferToAccount.value) {
  const investmentId = parseInvestmentAccountOptionValue(optionValue);
  if (investmentId) {
    return {
      optionType: "investment",
      account: null,
      savingGoal: null,
      investment: state.investmentAccounts.find(item => item.id === investmentId && item.status === "active") || null
    };
  }

  const savingGoal = resolveSavingGoalByAccountOption(optionValue, { includeCompleted: false });
  if (savingGoal) {
    return {
      optionType: "saving",
      account: getLinkedActiveAccountForSaving(savingGoal),
      savingGoal
    };
  }

  return {
    optionType: "account",
    account: state.accounts.find(account => account.id === optionValue && account.status === "active") || null,
    savingGoal: null,
    investment: null
  };
}

function resolveTransferSourceSelection(optionValue = els.transferFromAccount.value) {
  const investmentId = parseInvestmentAccountOptionValue(optionValue);
  if (investmentId) {
    return {
      optionType: "investment",
      account: null,
      investment: state.investmentAccounts.find(item => item.id === investmentId && item.status === "active") || null
    };
  }

  return {
    optionType: "account",
    account: state.accounts.find(account => account.id === optionValue && account.status === "active") || null,
    investment: null
  };
}

function getTransactionAccountOptionValue(kind, selected = {}) {
  if (selected.accountOptionValue) {
    return selected.accountOptionValue;
  }

  if (
    kind === "outcome"
    && selected.savingGoalId
    && selected.categoryId
    && !isSavingCategory(state.categories.find(item => item.id === selected.categoryId))
  ) {
    return buildSavingAccountOptionValue(selected.savingGoalId);
  }

  return selected.accountId || "";
}

function getTransferDestinationOptionValue(selected = {}) {
  if (selected.toAccountOptionValue) {
    return selected.toAccountOptionValue;
  }
  if (selected.transferSavingGoalId) {
    return buildSavingAccountOptionValue(selected.transferSavingGoalId);
  }
  if (selected.investmentAccountId) {
    return buildInvestmentAccountOptionValue(selected.investmentAccountId);
  }
  return selected.toAccountId || "";
}

function getEligibleSavingsForFunding(accountId = "", options = {}) {
  const { includeSavingGoalId = "" } = options;
  return getAccessibleSavingGoals({ includeCompleted: true })
    .filter(goal => {
      if (goal.linkedAccountId !== accountId) {
        return false;
      }
      if (goal.id === includeSavingGoalId) {
        return goal.status !== "archived";
      }
      return goal.status === "active";
    });
}

function getEligibleSavingsForAccount(accountId = "") {
  return getAccessibleSavingGoals({ includeCompleted: true })
    .filter(goal => goal.status !== "archived" && goal.linkedAccountId === accountId);
}

function getBudgetSpentMinor(budget, rows = getActiveRawTransactions()) {
  const { startDate, endDate } = getBudgetPeriodWindow(budget);
  const startMillis = startDate.getTime();
  const endMillis = endDate.getTime();
  return rows.reduce((sum, row) => {
    if (row.postingKind !== "outcome") {
      return sum;
    }
    if (!sanitizeStringArray(budget.categoryIds).includes(row.categoryId || "")) {
      return sum;
    }
    if (budget.scopeType !== "household" && !isRowVisibleInPersonalScope(row)) {
      return sum;
    }
    const rowTime = row.transactionAt?.toDate ? row.transactionAt.toDate().getTime() : 0;
    if (rowTime < startMillis || rowTime > endMillis) {
      return sum;
    }
    return sum + Number(row.amountMinor || 0);
  }, 0);
}

function buildBudgetSummary(budget, rows = getActiveRawTransactions()) {
  const { periodLabel } = getBudgetPeriodWindow(budget);
  const spentMinor = getBudgetSpentMinor(budget, rows);
  const amountMinor = Number(budget.amountMinor || 0);
  const remainingMinor = amountMinor - spentMinor;
  const ratio = amountMinor > 0 ? spentMinor / amountMinor : 0;
  const stateKey = spentMinor > amountMinor ? "over" : ratio >= 0.8 ? "near" : "on-track";
  const stateLabel = stateKey === "over"
    ? "Over budget"
    : stateKey === "near"
      ? "Near limit"
      : "On track";

  return {
    id: budget.id,
    name: budget.name,
    amountMinor,
    spentMinor,
    remainingMinor,
    state: stateKey,
    stateLabel,
    stateClass: stateKey === "over" ? "metric-over" : stateKey === "near" ? "metric-near" : "metric-good",
    categoryLabel: summarizeBudgetCategories(budget),
    periodLabel
  };
}

function summarizeBudgetCategories(budget) {
  const names = sanitizeStringArray(budget.categoryIds)
    .map(categoryId => getCategoryName(categoryId))
    .filter(Boolean);
  if (!names.length) {
    return "No categories";
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names[0]} +${names.length - 1}`;
}

function getBudgetPeriodWindow(budget) {
  const startDate = budget.startDate?.toDate ? cloneDate(budget.startDate.toDate()) : new Date();
  const cycleType = budget.cycleType || "monthly";
  const today = startOfDay(new Date());

  if (cycleType === "custom") {
    const customEnd = budget.endDate?.toDate ? endOfDay(budget.endDate.toDate()) : endOfDay(startDate);
    return {
      startDate: startOfDay(startDate),
      endDate: customEnd,
      periodLabel: `${formatDate(Timestamp.fromDate(startOfDay(startDate)))} - ${formatDate(Timestamp.fromDate(customEnd))}`
    };
  }

  let windowStart = startOfDay(startDate);
  let windowEnd = endOfDay(addScheduleDate(windowStart, cycleType, 1, true));
  let loops = 0;
  while (today.getTime() > windowEnd.getTime() && loops < 400) {
    windowStart = startOfDay(addScheduleDate(windowStart, cycleType));
    windowEnd = endOfDay(addScheduleDate(windowStart, cycleType, 1, true));
    loops += 1;
  }

  return {
    startDate: windowStart,
    endDate: windowEnd,
    periodLabel: `${formatDate(Timestamp.fromDate(windowStart))} - ${formatDate(Timestamp.fromDate(windowEnd))}`
  };
}

function buildBudgetWarningAfterSave({ kind, amountMinor, transactionAt }) {
  if (kind !== "outcome") {
    return "";
  }

  const categoryId = els.transactionCategory.value;
  if (!categoryId) {
    return "";
  }

  const projectedRows = [
    ...getActiveRawTransactions(),
    {
      postingKind: "outcome",
      categoryId,
      amountMinor,
      transactionAt,
      createdByUserId: state.authUser?.uid,
      accountPrimaryOwnerUserIdSnapshot: state.authUser?.uid,
      counterpartyAccountPrimaryOwnerUserIdSnapshot: null
    }
  ];
  const overBudgets = getVisibleBudgets()
    .map(budget => buildBudgetSummary(budget, projectedRows))
    .filter(summary => summary.state === "over")
    .map(summary => summary.name);

  if (!overBudgets.length) {
    return "";
  }

  return `Budget warning: ${overBudgets.join(", ")} ${overBudgets.length === 1 ? "is" : "are"} over budget.`;
}

function buildSavingSummary(goal) {
  const targetAmountMinor = Number(goal.targetAmountMinor || 0);
  const rawProgressMinor = Math.max(0, calculateSavingProgressMinor(goal.id));
  const progressMinor = Math.max(0, getSavingAvailableMinor(goal.id));
  const percent = targetAmountMinor > 0
    ? Math.min(999, Math.round((progressMinor / targetAmountMinor) * 100))
    : 0;
  const isTargetReached = targetAmountMinor > 0 && progressMinor >= targetAmountMinor;
  const isCompleted = goal.status === "completed";
  const isClamped = rawProgressMinor > progressMinor;
  return {
    id: goal.id,
    name: goal.name,
    rawProgressMinor,
    progressMinor,
    targetAmountMinor,
    remainingMinor: targetAmountMinor - progressMinor,
    percent,
    isTargetReached,
    isClamped,
    state: isCompleted ? "completed" : "active",
    stateLabel: isCompleted
      ? "Achievement"
      : isClamped
        ? "Limited by linked account"
        : isTargetReached
          ? "Ready to complete"
          : "In progress",
    stateClass: isCompleted || isTargetReached
      ? "metric-good"
      : isClamped
        ? "metric-near"
        : "metric-neutral"
  };
}

function calculateSavingProgressMinor(goalId, rows = getActiveRawTransactions()) {
  const savingCategoryId = getSavingCategory()?.id || "";
  const transactionDelta = rows.reduce((sum, row) => {
    if (row.savingGoalId !== goalId) {
      return sum;
    }
    if (row.displayKind === "transfer") {
      if (row.postingKind === "transfer_in") {
        return sum + Number(row.amountMinor || 0);
      }
      if (row.postingKind === "transfer_out") {
        return sum - Number(row.amountMinor || 0);
      }
    }
    if (row.categoryId === savingCategoryId) {
      return sum + Number(row.amountMinor || 0);
    }
    if (row.postingKind === "outcome") {
      return sum - Number(row.amountMinor || 0);
    }
    return sum;
  }, 0);

  const eventDelta = state.savingGoalEvents.reduce((sum, event) => {
    if (event.savingGoalId !== goalId || event.status === "deleted") {
      return sum;
    }
    return sum + Number(event.deltaMinor || 0);
  }, 0);

  return transactionDelta + eventDelta;
}

function getEffectiveSavingAllocations(rows = getActiveRawTransactions()) {
  const balances = computeAccountBalances(rows);
  const allocations = new Map();
  const goalsByAccount = new Map();

  getAccessibleSavingGoals({ includeCompleted: true }).forEach(goal => {
    if (!goal || goal.status === "archived" || !goal.linkedAccountId) {
      allocations.set(goal.id, 0);
      return;
    }
    const bucket = goalsByAccount.get(goal.linkedAccountId) || [];
    bucket.push(goal);
    goalsByAccount.set(goal.linkedAccountId, bucket);
  });

  goalsByAccount.forEach((goals, accountId) => {
    let remainingBalanceMinor = Math.max(0, balances.get(accountId) || 0);
    goals
      .sort((left, right) => (
        getTimestampSortValue(left.createdAt) - getTimestampSortValue(right.createdAt)
        || String(left.id || "").localeCompare(String(right.id || ""))
      ))
      .forEach(goal => {
        const rawProgressMinor = Math.max(0, calculateSavingProgressMinor(goal.id, rows));
        const effectiveProgressMinor = Math.min(rawProgressMinor, remainingBalanceMinor);
        allocations.set(goal.id, effectiveProgressMinor);
        remainingBalanceMinor = Math.max(0, remainingBalanceMinor - effectiveProgressMinor);
      });
  });

  getAccessibleSavingGoals({ includeCompleted: true }).forEach(goal => {
    if (!allocations.has(goal.id)) {
      allocations.set(goal.id, 0);
    }
  });

  return allocations;
}

function buildNextBillReminder(bill) {
  const completedKeys = new Set(
    state.recurringBillOccurrences
      .filter(occurrence => occurrence.billId === bill.id && occurrence.status === "completed")
      .map(occurrence => occurrence.occurrenceKey)
  );
  let dueDate = bill.anchorDate?.toDate ? startOfDay(bill.anchorDate.toDate()) : startOfDay(new Date());
  const today = startOfDay(new Date());

  for (let index = 0; index < 400; index += 1) {
    const occurrenceKey = toDateInput(dueDate);
    if (!completedKeys.has(occurrenceKey)) {
      const stateLabel = dueDate.getTime() < today.getTime()
        ? "Overdue"
        : dueDate.getTime() === today.getTime()
          ? "Due today"
          : "Upcoming";
      return {
        bill,
        occurrenceKey,
        dueDate,
        stateLabel
      };
    }
    dueDate = startOfDay(addScheduleDate(dueDate, bill.scheduleType || "monthly"));
  }

  return null;
}

function getVisibleBillReminders() {
  return getVisibleBills()
    .map(buildNextBillReminder)
    .filter(Boolean)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

function getDashboardBillReminders() {
  const todayMillis = startOfDay(new Date()).getTime();
  return getVisibleBillReminders()
    .filter(reminder => reminder.dueDate.getTime() <= todayMillis)
    .filter(reminder => !state.dismissedDashboardBillReminderIds.has(getDashboardBillReminderKey(reminder)));
}

function getDashboardBillReminderKey(reminder) {
  return `${reminder.bill.id}__${reminder.occurrenceKey}`;
}

function getDashboardBillDismissStorageKey() {
  if (!state.authUser?.uid || !state.household?.id) {
    return "";
  }
  return `nestplan.dashboardBillDismissals.${state.authUser.uid}.${state.household.id}`;
}

function syncDashboardBillDismissals() {
  const storageKey = getDashboardBillDismissStorageKey();
  if (state.dashboardBillDismissStorageKey === storageKey) {
    return;
  }

  state.dashboardBillDismissStorageKey = storageKey;
  state.dismissedDashboardBillReminderIds = new Set(readStoredStringArray(storageKey));
}

function saveDashboardBillDismissals() {
  const storageKey = getDashboardBillDismissStorageKey();
  if (!storageKey) {
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify([...state.dismissedDashboardBillReminderIds]));
  } catch (error) {
    console.warn("Could not save dashboard bill reminder dismissal:", error);
  }
}

function readStoredStringArray(storageKey) {
  if (!storageKey) {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch (error) {
    console.warn("Could not read dashboard bill reminder dismissals:", error);
    return [];
  }
}

function buildBillStatusRow(bill) {
  const completedKeys = new Set(
    state.recurringBillOccurrences
      .filter(occurrence => occurrence.billId === bill.id && occurrence.status === "completed")
      .map(occurrence => occurrence.occurrenceKey)
  );
  const today = startOfDay(new Date());
  const anchorDate = bill.anchorDate?.toDate ? startOfDay(bill.anchorDate.toDate()) : startOfDay(new Date());
  let dueDate = anchorDate;
  let lastDue = null;
  let nextDue = null;

  for (let index = 0; index < 400; index += 1) {
    const occurrenceKey = toDateInput(dueDate);
    const occurrence = {
      occurrenceKey,
      dueDate,
      isCompleted: completedKeys.has(occurrenceKey)
    };

    if (dueDate.getTime() <= today.getTime()) {
      lastDue = occurrence;
      dueDate = startOfDay(addScheduleDate(dueDate, bill.scheduleType || "monthly"));
      continue;
    }

    nextDue = occurrence;
    break;
  }

  if (lastDue && !lastDue.isCompleted) {
    return {
      bill,
      isPaid: false,
      statusLabel: "Unpaid",
      dueLabel: `Due ${formatDate(Timestamp.fromDate(lastDue.dueDate))}`,
      dueDate: lastDue.dueDate,
      payOccurrenceKey: lastDue.occurrenceKey
    };
  }

  if (lastDue?.isCompleted) {
    const upcoming = nextDue || {
      occurrenceKey: toDateInput(startOfDay(addScheduleDate(lastDue.dueDate, bill.scheduleType || "monthly"))),
      dueDate: startOfDay(addScheduleDate(lastDue.dueDate, bill.scheduleType || "monthly"))
    };
    return {
      bill,
      isPaid: true,
      statusLabel: "Paid",
      dueLabel: `Next due ${formatDate(Timestamp.fromDate(upcoming.dueDate))}`,
      dueDate: upcoming.dueDate,
      payOccurrenceKey: upcoming.occurrenceKey
    };
  }

  const firstDue = nextDue || {
    occurrenceKey: toDateInput(anchorDate),
    dueDate: anchorDate
  };
  return {
    bill,
    isPaid: false,
    statusLabel: "Unpaid",
    dueLabel: `First due ${formatDate(Timestamp.fromDate(firstDue.dueDate))}`,
    dueDate: firstDue.dueDate,
    payOccurrenceKey: firstDue.occurrenceKey
  };
}

async function markBillReminderPaid(reminder) {
  if (!window.confirm("Mark this bill as paid without creating a transaction?")) {
    return;
  }

  const occurrenceId = getOccurrenceDocId(reminder.bill.id, reminder.occurrenceKey);
  try {
    await setDoc(doc(db, "households", state.household.id, "recurringBillOccurrences", occurrenceId), {
      billId: reminder.bill.id,
      billNameSnapshot: reminder.bill.name,
      occurrenceKey: reminder.occurrenceKey,
      dueAt: Timestamp.fromDate(reminder.dueDate),
      transactionId: null,
      transactionGroupId: null,
      transactionAt: null,
      scopeType: reminder.bill.scopeType,
      ownerUserId: reminder.bill.ownerUserId || null,
      status: "completed",
      completedByUserId: state.authUser.uid,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.openBillMenuId = null;
    setMessage(els.billMessage, "Bill marked as paid.", "success");
  } catch (error) {
    setMessage(els.billMessage, error.message, "error");
  }
}

function getVisibleBillStatusRows() {
  return getVisibleBills()
    .map(buildBillStatusRow)
    .filter(Boolean)
    .sort((left, right) => {
      if (left.isPaid !== right.isPaid) {
        return left.isPaid ? 1 : -1;
      }
      return left.dueDate.getTime() - right.dueDate.getTime();
    });
}

function getRecentlyCompletedBillOccurrences() {
  return state.recurringBillOccurrences
    .filter(occurrence => occurrence.status === "completed" && matchesPlanningScope(occurrence))
    .sort((a, b) => getTimestampSortValue(b.completedAt || b.updatedAt) - getTimestampSortValue(a.completedAt || a.updatedAt));
}

function getOccurrenceDocId(billId, occurrenceKey) {
  return `${billId}__${occurrenceKey.replace(/[^0-9-]/g, "")}`;
}

function getAccountName(accountId) {
  return state.accounts.find(account => account.id === accountId)?.name || "Unknown account";
}

function getCategoryName(categoryId) {
  return state.categories.find(category => category.id === categoryId)?.name || "Unknown category";
}

function getCategoryDefaultsStatus() {
  return state.household?.settings?.categoryDefaults || null;
}

function normalizeCategorySeedName(name = "") {
  return cleanText(name).toLowerCase().replace(/\s+/g, " ");
}

function isCompatibleSeedMatch(category, seed) {
  if (!category || category.status !== "active") {
    return false;
  }
  if (normalizeCategorySeedName(category.name) !== normalizeCategorySeedName(seed.name)) {
    return false;
  }
  return category.direction === seed.direction || category.direction === "both";
}

function getDefaultCategorySeeds() {
  return state.defaultCategoryLibrary.map(item => ({
    name: item.name,
    direction: item.direction,
    description: item.description || ""
  }));
}

function renderCategorySeedAccess() {
  if (!els.categoryDefaultsBtn || !els.categoryDefaultsNote) {
    return;
  }
  const defaultsStatus = getCategoryDefaultsStatus();
  const alreadyApplied = Boolean(defaultsStatus?.version);
  els.categoryDefaultsBtn.classList.toggle("hidden", alreadyApplied);
  els.categoryDefaultsBtn.disabled = alreadyApplied;
  els.categoryDefaultsNote.classList.toggle("hidden", alreadyApplied);
  els.categoryDefaultsNote.textContent = alreadyApplied
    ? ""
    : "Merge the starter set into this household once. Existing active categories stay untouched.";
}

async function applyDefaultCategories() {
  if (!state.household?.id || !state.authUser) {
    setMessage(els.categoryMessage, "Open a household first.", "error");
    return;
  }
  if (getCategoryDefaultsStatus()?.version) {
    setMessage(els.categoryMessage, "Default categories were already applied in this household.", "error");
    return;
  }
  if (!window.confirm("Merge the default category starter set into this household? Existing active categories will be preserved.")) {
    return;
  }

  const householdRef = doc(db, "households", state.household.id);
  const batch = writeBatch(db);
  let createdCount = 0;
  let updatedCount = 0;
  const activeCategoryCount = getActiveManualCategoryCount();
  const categorySeeds = getDefaultCategorySeeds();
  if (!categorySeeds.length) {
    setMessage(els.categoryMessage, "No default category library is configured yet. Ask a master admin to add default categories first.", "error");
    return;
  }

  const missingSeedsCount = categorySeeds.filter(seed => !state.categories.some(category => isCompatibleSeedMatch(category, seed))).length;

  if (activeCategoryCount + missingSeedsCount > 50) {
    setMessage(els.categoryMessage, "The starter set would exceed the 50 active category limit. Archive some categories first.", "error");
    return;
  }

  categorySeeds.forEach(seed => {
    const matchingActive = state.categories.find(category => isCompatibleSeedMatch(category, seed));
    if (matchingActive) {
      if (!cleanText(matchingActive.description || "")) {
        batch.update(doc(db, "households", state.household.id, "categories", matchingActive.id), {
          description: seed.description,
          updatedAt: serverTimestamp()
        });
        updatedCount += 1;
      }
      return;
    }

    const categoryRef = doc(collection(db, "households", state.household.id, "categories"));
    batch.set(categoryRef, {
      name: seed.name,
      description: seed.description,
      direction: seed.direction,
      status: "active",
      createdByUserId: state.authUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    createdCount += 1;
  });

  batch.update(householdRef, {
    updatedAt: serverTimestamp(),
    settings: {
      ...(state.household.settings || {}),
      categoryDefaults: {
        appliedAt: serverTimestamp(),
        appliedByUserId: state.authUser.uid,
        version: DEFAULT_CATEGORY_SEED_VERSION
      }
    }
  });

  try {
    await batch.commit();
    setMessage(els.categoryMessage, `Default categories applied. Added ${createdCount}, updated ${updatedCount}.`, "success");
  } catch (error) {
    setMessage(els.categoryMessage, error.message, "error");
  }
}

function getBillName(billId) {
  return state.recurringBills.find(bill => bill.id === billId)?.name || "Recurring bill";
}

function getCategoryHelperCategories() {
  const kind = els.transactionKind.value;
  if (kind === "transfer") {
    return [];
  }

  return getActiveCategories()
    .filter(category => !isProtectedSystemCategory(category) && isCategoryAllowedForKind(category, kind))
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""));
}

function renderCategoryHelperContent() {
  if (!els.categoryHelperList || !els.categoryHelperTitle || !els.categoryHelperCopy) {
    return;
  }

  const kind = els.transactionKind.value;
  const kindLabel = capitalize(kind);
  els.categoryHelperTitle.textContent = `${kindLabel} category guide`;
  els.categoryHelperCopy.textContent = kind === "transfer"
    ? "Transfers do not use categories."
    : `Browse the ${kindLabel.toLowerCase()} categories available right now.`;

  const categories = getCategoryHelperCategories();
  if (!categories.length) {
    els.categoryHelperList.innerHTML = `<div class="empty-card"><h4>No categories available</h4><p>${escapeHtml(kind === "transfer" ? "Transfers do not use categories." : "Create a category first, or apply the default starter set from Accounts & Categories.")}</p></div>`;
    return;
  }

  els.categoryHelperList.innerHTML = categories.map(category => `
    <article class="list-row compact-row">
      <div>
        <p class="list-row-title">${escapeHtml(category.name)}</p>
        <p class="status-copy">${escapeHtml(cleanText(category.description || "") || "No description yet.")}</p>
      </div>
    </article>
  `).join("");
}

function openCategoryHelperModal() {
  if (!els.categoryHelperModal) {
    return;
  }
  if (els.transactionKind.value === "transfer") {
    return;
  }
  renderCategoryHelperContent();
  els.categoryHelperModal.classList.remove("hidden");
}

function closeCategoryHelperModal() {
  if (els.categoryHelperModal) {
    els.categoryHelperModal.classList.add("hidden");
  }
}

function handleInfoButtonClick(event) {
  const button = event.target.closest("[data-info-topic]");
  if (!button) {
    return;
  }

  openInfoModal(button.dataset.infoTopic);
}

function openInfoModal(topic) {
  const content = INFO_TOPICS[topic];
  if (!content || !els.infoModal || !els.infoModalTitle || !els.infoModalCopy) {
    return;
  }

  els.infoModalTitle.textContent = content.title;
  const paragraphsHtml = (content.paragraphs || [])
    .map(paragraph => `<p class="status-copy">${escapeHtml(paragraph)}</p>`)
    .join("");
  const tableHtml = content.table ? renderInfoExampleTable(content.table) : "";
  const footnotesHtml = (content.footnotes || [])
    .map(note => `<p class="status-copy compact-note">${escapeHtml(note)}</p>`)
    .join("");
  els.infoModalCopy.innerHTML = `${paragraphsHtml}${tableHtml}${footnotesHtml}`;
  els.infoModal.classList.remove("hidden");
}

function renderInfoExampleTable(table = {}) {
  const headers = sanitizeStringArray(table.headers);
  const rows = Array.isArray(table.rows) ? table.rows : [];
  if (!headers.length || !rows.length) {
    return "";
  }

  return `
    <div class="info-example-table" role="table">
      <div class="info-example-row info-example-head" role="row">
        ${headers.map(header => `<span role="columnheader">${escapeHtml(header)}</span>`).join("")}
      </div>
      ${rows.map(row => `
        <div class="info-example-row" role="row">
          ${headers.map((header, index) => `<span role="cell" data-label="${escapeHtml(header)}">${escapeHtml(row[index] || "")}</span>`).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function closeInfoModal() {
  if (els.infoModal) {
    els.infoModal.classList.add("hidden");
  }
}

function getReportFilterConfig(type = state.reportFilterModalType) {
  if (type === "accounts") {
    return {
      title: "Choose accounts",
      filterKey: "accountIds",
      button: els.reportAccountOpenBtn,
      emptyLabel: "All accounts (auto)",
      allSelectedLabel: "All accounts selected",
      singularLabel: "account",
      pluralLabel: "accounts",
      options: getVisibleAccounts().map(account => ({
        value: account.id,
        label: getAccountOptionLabel(account)
      }))
    };
  }
  if (type === "categories") {
    return {
      title: "Choose categories",
      filterKey: "categoryIds",
      button: els.reportCategoryOpenBtn,
      emptyLabel: "All categories (auto)",
      allSelectedLabel: "All categories selected",
      singularLabel: "category",
      pluralLabel: "categories",
      options: getActiveCategories()
        .filter(category => !isProtectedSystemCategory(category))
        .sort((left, right) => (left.name || "").localeCompare(right.name || ""))
        .map(category => ({
          value: category.id,
          label: category.name
        }))
    };
  }
  return null;
}

function openReportFilterModal(type) {
  state.reportFilterModalType = type;
  renderReportFilterModal();
  els.reportFilterModal?.classList.remove("hidden");
}

function closeReportFilterModal() {
  state.reportFilterModalType = "";
  els.reportFilterModal?.classList.add("hidden");
}

function renderReportFilterModal() {
  const config = getReportFilterConfig();
  if (!config || !els.reportFilterModalTitle || !els.reportFilterModalList) {
    return;
  }

  const selectedSet = new Set(state.reportFilters[config.filterKey] || []);
  els.reportFilterModalTitle.textContent = config.title;
  els.reportFilterModalList.innerHTML = config.options.length
    ? config.options.map(option => `
      <label class="report-filter-row">
        <input type="checkbox" value="${escapeHtml(option.value)}" ${selectedSet.has(option.value) ? "checked" : ""} />
        <span>${escapeHtml(option.label)}</span>
      </label>
    `).join("")
    : `<p class="status-copy">No options available.</p>`;
}

function applyReportFilterAutoAll() {
  const config = getReportFilterConfig();
  if (!config) {
    return;
  }
  state.reportFilters[config.filterKey] = [];
  state.reportDrillCategoryId = "";
  closeReportFilterModal();
  renderReportView();
}

function selectAllReportFilterOptions() {
  if (!els.reportFilterModalList) {
    return;
  }
  els.reportFilterModalList
    .querySelectorAll("input[type='checkbox']")
    .forEach(input => {
      input.checked = true;
    });
}

function applyReportFilterModal() {
  const config = getReportFilterConfig();
  if (!config || !els.reportFilterModalList) {
    return;
  }
  state.reportFilters[config.filterKey] = [...els.reportFilterModalList.querySelectorAll("input[type='checkbox']:checked")]
    .map(input => input.value)
    .filter(Boolean);
  state.reportDrillCategoryId = "";
  closeReportFilterModal();
  renderReportView();
}

function buildScopedPayload(scopeType, ownerUserId = null) {
  return {
    scopeType,
    ownerUserId: scopeType === "household" ? null : (ownerUserId || state.authUser.uid)
  };
}

function buildReminderFromAction(bill, occurrenceKey) {
  if (!bill) {
    return null;
  }

  if (!occurrenceKey) {
    return buildNextBillReminder(bill);
  }

  return {
    bill,
    occurrenceKey,
    dueDate: dateFromDateInput(occurrenceKey),
    stateLabel: "Reminder"
  };
}

function prefillRecurringBillTransaction(reminder) {
  const category = state.categories.find(item => item.id === reminder.bill.categoryId && item.status === "active");
  if (!category) {
    setMessage(els.billMessage, "This bill's category is no longer active. Update the bill before using the reminder.", "error");
    return;
  }

  if (state.currentView !== "dashboard") {
    state.currentView = "dashboard";
    renderApp();
  }

  resetTransactionForm();
  els.transactionKind.value = "outcome";
  els.transactionRecurringBillId.value = reminder.bill.id;
  els.transactionRecurringBillOccurrenceId.value = getOccurrenceDocId(reminder.bill.id, reminder.occurrenceKey);
  els.transactionDate.value = toDateInput(new Date());
  els.transactionNote.value = reminder.bill.note || reminder.bill.name;
  syncTransactionForm({
    categoryId: reminder.bill.categoryId
  });
  setMessage(
    els.transactionMessage,
    `Reminder loaded for ${reminder.bill.name}. Save the transaction to mark ${formatDate(Timestamp.fromDate(reminder.dueDate))} complete.`,
    "success"
  );
  requestAnimationFrame(() => {
    els.transactionCard.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function timestampFromOccurrenceId(occurrenceId, fallbackTimestamp = null) {
  const parts = String(occurrenceId || "").split("__");
  const occurrenceKey = parts.length > 1 ? parts.slice(1).join("__") : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(occurrenceKey)) {
    return timestampFromDateInput(occurrenceKey);
  }
  return fallbackTimestamp || Timestamp.fromDate(new Date());
}

function renderInviteAccess() {
  const isAdmin = state.member?.role === "admin";
  els.inviteForm.classList.toggle("hidden", !isAdmin);
  els.inviteAdminHint.classList.toggle("hidden", isAdmin);
}

function renderMembers() {
  els.membersList.innerHTML = "";
  if (!state.members.length) {
    els.membersList.innerHTML = `<p class="status-copy">No members loaded yet.</p>`;
    return;
  }

  state.members.forEach(member => {
    const canRemove = state.member?.role === "admin"
      && member.id !== state.authUser?.uid
      && member.status !== "removed";
    const item = document.createElement("article");
    item.className = "list-row";
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">${escapeHtml(member.displayName || member.emailNormalized)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(member.emailNormalized || "")}</span>
            <span>•</span>
            <span>${escapeHtml(member.role || "member")}</span>
            <span>|</span>
            <span>${escapeHtml(member.status || "active")}</span>
          </div>
        </div>
        ${canRemove ? `
          <div class="list-row-actions">
            <button class="text-btn danger" type="button" data-action="remove-member" data-id="${member.id}">Remove</button>
          </div>
        ` : ""}
      </div>
    `;
    els.membersList.appendChild(item);
  });
}

function renderInvites() {
  els.inviteList.innerHTML = "";
  const visibleInvites = state.invites.filter(item => item.status === "pending" && !isExpired(item.expiresAt));
  const canRevokeInvite = state.member?.role === "admin";

  if (!visibleInvites.length) {
    els.inviteList.innerHTML = `<p class="status-copy">No active invite codes.</p>`;
    return;
  }

  visibleInvites.forEach(invite => {
    const item = document.createElement("article");
    item.className = "list-row";
      item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">Code ${escapeHtml(invite.inviteCode)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(invite.householdName || state.household?.name || "Household")}</span>
            <span>•</span>
            <span>Expires ${escapeHtml(formatDateTime(invite.expiresAt, false))}</span>
          </div>
        </div>
        <div class="list-row-actions">
          <button class="text-btn" type="button" data-action="copy-invite-code" data-id="${invite.id}">Copy code</button>
          ${canRevokeInvite ? `<button class="text-btn danger" type="button" data-action="revoke-invite" data-id="${invite.id}">Revoke</button>` : ""}
        </div>
      </div>
    `;
    els.inviteList.appendChild(item);
  });
}

function renderAccounts() {
  const balances = computeAccountBalances();
  const visibleAccounts = getVisibleAccounts();
  els.accountsList.innerHTML = "";

  if (!visibleAccounts.length) {
    els.accountsList.innerHTML = `<div class="empty-card"><h4>No visible accounts</h4><p>Create an account for yourself or switch to household view.</p></div>`;
  } else {
    visibleAccounts.forEach(account => {
      const owner = getMemberName(account.primaryOwnerUserId);
      const canEdit = canEditAccount(account);
      const activeMinor = balances.get(account.id) || 0;
      const lockedMinor = getReservedSavingMinorForAccount(account.id);
      const item = document.createElement("article");
      item.className = "list-row";
      item.innerHTML = `
        <div class="list-row-head">
          <div>
            <p class="list-row-title">${escapeHtml(account.name)}</p>
            <div class="list-row-meta">
              <span>${escapeHtml(owner)}</span>
              <span>•</span>
              <span>Active: ${escapeHtml(formatRupiah(activeMinor))}</span>
              <span>|</span>
              <span>Locked: ${escapeHtml(formatRupiah(lockedMinor))}</span>
            </div>
          </div>
          <div class="list-row-actions">
            ${canEdit ? `<button class="text-btn" type="button" data-action="edit-account" data-id="${account.id}">Edit</button>` : ""}
            <button class="text-btn danger" type="button" data-action="archive-account" data-id="${account.id}">Archive</button>
          </div>
        </div>
      `;
      els.accountsList.appendChild(item);
    });
  }

  populateOwnerSelects();
}

function renderCategories() {
  const categories = getActiveCategories();
  els.categoriesList.innerHTML = "";

  if (!categories.length) {
    els.categoriesList.innerHTML = `<div class="empty-card"><h4>No categories yet</h4><p>Use default categories once or create at least one income category and one outcome category to unlock the main dashboard.</p></div>`;
    return;
  }

  categories.forEach(category => {
    const systemLocked = isProtectedSystemCategory(category);
    const description = cleanText(category.description || "");
    const item = document.createElement("article");
    item.className = "list-row";
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">${escapeHtml(category.name)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(category.direction)}</span>
            ${systemLocked ? `<span>|</span><span>system</span>` : ""}
          </div>
          ${description ? `<p class="status-copy">${escapeHtml(description)}</p>` : ""}
        </div>
        ${systemLocked ? "" : `
          <div class="list-row-actions">
            <button class="text-btn" type="button" data-action="edit-category" data-id="${category.id}">Edit</button>
            <button class="text-btn danger" type="button" data-action="archive-category" data-id="${category.id}">Archive</button>
          </div>
        `}
      </div>
    `;
    els.categoriesList.appendChild(item);
  });
}

function renderTransactions() {
  const entries = getLedgerEntriesForCurrentMode();
  const totalVisibleEntries = filterLedgerEntries(getVisibleGroupedEntries(), state.dashboardLedgerFilters).length;
  const scopeLabel = state.scope === "personal" ? "personal filter" : "household filter";
  els.historyList.innerHTML = "";
  renderLedgerNav();

  if (state.ledgerMode === "recent") {
    els.historyMeta.textContent = `Showing ${entries.length} of ${totalVisibleEntries} recent visible ${totalVisibleEntries === 1 ? "entry" : "entries"} | ${scopeLabel}`;
  } else {
    els.historyMeta.textContent = `Showing ${entries.length} ${entries.length === 1 ? "entry" : "entries"} from ${formatLedgerMonthLabel(state.ledgerMonthOffset)} | ${scopeLabel}`;
  }

  if (!entries.length) {
    const emptyMessage = state.ledgerMode === "recent"
      ? "Start with an account and both category directions, then create your first transaction."
      : `No transactions match ${formatLedgerMonthLabel(state.ledgerMonthOffset)} in the current scope.`;
    els.historyList.innerHTML = `<div class="empty-card"><h4>No ledger history yet</h4><p>${escapeHtml(emptyMessage)}</p></div>`;
    return;
  }

  entries.forEach(entry => {
    const article = document.createElement("article");
    article.className = "history-item";
    article.innerHTML = buildHistoryMarkup(entry);
    els.historyList.appendChild(article);
  });
}

function renderLedgerFilterControls() {
  renderDashboardLedgerFilters();
  renderPlanningLedgerFilters();
}

function renderDashboardLedgerFilters() {
  if (!els.dashboardLedgerKindFilter) {
    return;
  }

  if (els.dashboardLedgerFilterToggle) {
    els.dashboardLedgerFilterToggle.checked = state.showDashboardLedgerFilters;
  }
  els.dashboardLedgerKindFilter.closest("#dashboard-ledger-filters")?.classList.toggle("hidden", !state.showDashboardLedgerFilters);
  renderLedgerKindOptions(els.dashboardLedgerKindFilter, state.dashboardLedgerFilters.kind, { includeInvestment: true });
  renderLedgerAccountOptions(els.dashboardLedgerAccountFilter, state.dashboardLedgerFilters.accountId);
  renderLedgerCategoryOptions(els.dashboardLedgerCategoryFilter, state.dashboardLedgerFilters.categoryId);
}

function renderPlanningLedgerFilters() {
  if (!els.ledgerPageKindFilter) {
    return;
  }

  renderPlanningLedgerFilterPanel();
  renderLedgerKindOptions(els.ledgerPageKindFilter, state.planningLedgerFilters.kind, { includeInvestment: true });
  renderLedgerAccountOptions(els.ledgerPageAccountFilter, state.planningLedgerFilters.accountId);
  renderLedgerCategoryOptions(els.ledgerPageCategoryFilter, state.planningLedgerFilters.categoryId);
  renderLedgerCreatorOptions(els.ledgerPageCreatorFilter, state.planningLedgerFilters.creatorUserId);
  els.ledgerPageDateFrom.value = state.planningLedgerFilters.dateFrom || "";
  els.ledgerPageDateTo.value = state.planningLedgerFilters.dateTo || "";
  els.ledgerPageSort.value = state.planningLedgerSort;
  if (els.ledgerPageActionsToggle) {
    els.ledgerPageActionsToggle.checked = state.showLedgerPageActions;
  }
}

function renderPlanningLedgerFilterPanel() {
  els.ledgerPageFilterCard?.classList.toggle("is-collapsed", !state.showLedgerFilters);
  if (els.ledgerPageFilterBody) {
    els.ledgerPageFilterBody.classList.toggle("hidden", !state.showLedgerFilters);
  }
  if (els.ledgerPageFilterToggle) {
    els.ledgerPageFilterToggle.setAttribute("aria-expanded", String(state.showLedgerFilters));
    els.ledgerPageFilterToggle.setAttribute("aria-label", state.showLedgerFilters ? "Hide ledger filters" : "Show ledger filters");
    els.ledgerPageFilterToggle.title = state.showLedgerFilters ? "Hide ledger filters" : "Show ledger filters";
  }
}

function renderLedgerKindOptions(select, value = "", options = {}) {
  if (!select) {
    return;
  }

  const kinds = [
    ["", "All types"],
    ["income", "Income"],
    ["outcome", "Outcome"],
    ["transfer", "Transfer"],
    ["adjustment", "Balance correction"]
  ];
  if (options.includeInvestment) {
    kinds.push(["investment", "Investment movement"]);
  }
  select.innerHTML = kinds
    .map(([kind, label]) => `<option value="${escapeHtml(kind)}">${escapeHtml(label)}</option>`)
    .join("");
  setSelectValue(select, value);
}

function renderLedgerAccountOptions(select, value = "") {
  if (!select) {
    return;
  }

  const accounts = getVisibleAccounts();
  select.innerHTML = [
    `<option value="">All accounts</option>`,
    ...accounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(getAccountOptionLabel(account))}</option>`)
  ].join("");
  setSelectValue(select, value);
}

function renderLedgerCategoryOptions(select, value = "") {
  if (!select) {
    return;
  }

  const categories = state.categories
    .filter(category => category.status === "active")
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""));
  select.innerHTML = [
    `<option value="">All categories</option>`,
    ...categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
  ].join("");
  setSelectValue(select, value);
}

function renderLedgerCreatorOptions(select, value = "") {
  if (!select) {
    return;
  }

  const creatorIds = new Set(
    getVisibleGroupedEntries()
      .map(entry => entry.createdByUserId || "")
      .filter(Boolean)
  );
  const creators = Array.from(creatorIds)
    .map(userId => ({ userId, name: getMemberName(userId) }))
    .sort((left, right) => left.name.localeCompare(right.name));

  select.innerHTML = [
    `<option value="">All creators</option>`,
    ...creators.map(creator => `<option value="${escapeHtml(creator.userId)}">${escapeHtml(creator.name)}</option>`)
  ].join("");
  setSelectValue(select, value);
}

function renderPlanningLedger() {
  if (!els.ledgerTable) {
    return;
  }

  syncLedgerTableLayoutControl();

  if (!state.planningLedgerLoaded) {
    els.ledgerPageMeta.textContent = "Open the Ledger tab to load ledger rows.";
    els.ledgerTable.innerHTML = `<p class="status-copy">Ledger rows load when this tab is opened.</p>`;
    els.ledgerLoadMoreBtn?.classList.add("hidden");
    return;
  }

  const entries = getPlanningLedgerEntries();
  const visibleEntries = entries.slice(0, state.planningLedgerVisibleCount);
  els.ledgerPageMeta.textContent = `Showing ${visibleEntries.length} of ${entries.length} matching ${entries.length === 1 ? "entry" : "entries"}.`;
  els.ledgerLoadMoreBtn?.classList.toggle("hidden", visibleEntries.length >= entries.length);

  if (!visibleEntries.length) {
    els.ledgerTable.innerHTML = `<div class="empty-card"><h4>No matching ledger rows</h4><p>Adjust the filters or create transactions first.</p></div>`;
    return;
  }

  els.ledgerTable.innerHTML = `
    <div class="ledger-table" style="${escapeHtml(getLedgerTableColumnStyle())}">
      <div class="ledger-table-row ${state.showLedgerPageActions ? "with-actions" : ""} ledger-table-head">
        ${buildLedgerHeaderCell("Transaction Date", "transaction", { sortable: true })}
        ${buildLedgerHeaderCell("Created", "created", { sortable: true })}
        ${buildLedgerHeaderCell("Type", "type")}
        ${buildLedgerHeaderCell("Creator", "creator")}
        ${buildLedgerHeaderCell("Account", "account")}
        ${buildLedgerHeaderCell("Category / Route", "route")}
        ${buildLedgerHeaderCell("Note", "note")}
        ${buildLedgerHeaderCell("Amount", "amount")}
        ${state.showLedgerPageActions ? `<span></span>` : ""}
      </div>
      ${visibleEntries.map(buildLedgerTableRow).join("")}
    </div>
  `;
}

function syncLedgerTableLayoutControl() {
  const layout = normalizeLedgerTableLayout(state.ledgerTableLayout);
  state.ledgerTableLayout = layout;
  if (els.ledgerTableLayout) {
    els.ledgerTableLayout.value = layout;
  }
  if (els.ledgerTable) {
    els.ledgerTable.classList.toggle("layout-wide", layout === "wide");
    els.ledgerTable.classList.toggle("layout-stacked", layout === "stacked");
  }
}

function getSelectedLedgerTableLayout() {
  return normalizeLedgerTableLayout(els.ledgerTableLayout?.value || state.ledgerTableLayout);
}

function normalizeLedgerTableLayout(value) {
  return ["wide", "stacked"].includes(value) ? value : getDefaultLedgerTableLayout();
}

function getDefaultLedgerTableLayout() {
  return window.matchMedia?.("(max-width: 719px)")?.matches ? "stacked" : "wide";
}

function buildLedgerHeaderCell(label, column, options = {}) {
  const labelMarkup = options.sortable
    ? buildLedgerSortHeader(label, column)
    : `<span>${escapeHtml(label)}</span>`;
  return `
    <span class="ledger-head-cell">
      ${labelMarkup}
      <button class="ledger-resize-handle" type="button" data-ledger-resize-column="${escapeHtml(column)}" aria-label="Resize ${escapeHtml(label)} column"></button>
    </span>
  `;
}

function buildLedgerSortHeader(label, field) {
  const activeField = state.planningLedgerSort.startsWith("transaction") ? "transaction" : "created";
  const direction = state.planningLedgerSort.endsWith("-asc") ? "asc" : "desc";
  const indicator = activeField === field
    ? direction === "asc" ? " &uarr;" : " &darr;"
    : "";
  return `<button class="table-sort-btn" type="button" data-action="sort-ledger" data-sort-field="${field}" aria-label="Sort by ${escapeHtml(label)}">${escapeHtml(label)}${indicator}</button>`;
}

function getLedgerTableColumnStyle() {
  const columns = getLedgerTableColumnTemplate();
  const minimumWidth = columns.reduce((total, value) => total + Number.parseInt(value, 10), 0)
    + (state.showLedgerPageActions ? 42 : 0);
  return `--ledger-table-columns: ${columns.join(" ")}; --ledger-table-min-width: ${Math.max(900, minimumWidth)}px;`;
}

function getLedgerTableColumnTemplate() {
  return [
    "transaction",
    "created",
    "type",
    "creator",
    "account",
    "route",
    "note",
    "amount"
  ].map(column => `${clampLedgerColumnWidth(column, state.ledgerColumnWidths[column] || getLedgerColumnDefaultWidth(column))}px`);
}

function applyLedgerTableColumnWidths(table = els.ledgerTable?.querySelector(".ledger-table")) {
  if (!table) {
    return;
  }
  const [columnsStyle, minimumWidthStyle] = getLedgerTableColumnStyle().split("; ");
  table.style.setProperty("--ledger-table-columns", columnsStyle.replace("--ledger-table-columns: ", ""));
  table.style.setProperty("--ledger-table-min-width", minimumWidthStyle.replace("--ledger-table-min-width: ", "").replace(";", ""));
}

function getLedgerColumnDefaultWidth(column) {
  return {
    transaction: 128,
    created: 148,
    type: 92,
    creator: 130,
    account: 150,
    route: 180,
    note: 190,
    amount: 128
  }[column] || 120;
}

function clampLedgerColumnWidth(column, width) {
  const minimums = {
    transaction: 104,
    created: 118,
    type: 76,
    creator: 96,
    account: 108,
    route: 128,
    note: 120,
    amount: 96
  };
  const maximums = {
    route: 360,
    note: 420
  };
  const minimum = minimums[column] || 90;
  const maximum = maximums[column] || 300;
  return Math.max(minimum, Math.min(maximum, Math.round(Number(width) || getLedgerColumnDefaultWidth(column))));
}

function buildLedgerTableRow(entry) {
  const route = entry.kind === "transfer"
    ? `${entry.fromAccountDisplayName || entry.fromAccountName} to ${entry.toAccountDisplayName || entry.toAccountName}`
    : entry.kind === "adjustment"
      ? entry.accountName
      : entry.categoryName || "-";
  const account = entry.kind === "transfer"
    ? entry.fromAccountDisplayName || entry.fromAccountName
    : entry.accountName || "-";
  const typeLabel = isInvestmentEntry(entry)
    ? getInvestmentEntryLabel(entry)
    : entry.kind === "adjustment"
      ? "Balance correction"
      : entry.kindLabel;
  const amountPrefix = getLedgerAmountPrefix(entry);
  const amountClass = getLedgerAmountClass(entry);
  const isMenuOpen = state.openHistoryMenuId === entry.groupId;
  const menuItems = [
    canEditEntry(entry)
      ? `<button class="overflow-item" type="button" data-action="edit-ledger-entry" data-id="${entry.groupId}">Edit</button>`
      : "",
    canDeleteEntry(entry)
      ? `<button class="overflow-item danger" type="button" data-action="delete-ledger-entry" data-id="${entry.groupId}">Delete</button>`
      : ""
  ].filter(Boolean).join("");
  const actionsMarkup = state.showLedgerPageActions
    ? `<span data-label="" class="ledger-action-cell">
        ${menuItems ? `
          <button class="overflow-btn tiny-overflow-btn" type="button" aria-label="Open ledger actions" data-action="toggle-ledger-menu" data-id="${entry.groupId}">&#8942;</button>
          <div class="overflow-menu${isMenuOpen ? "" : " hidden"}">${menuItems}</div>
        ` : ""}
      </span>`
    : "";

  return `
    <div class="ledger-table-row ${state.showLedgerPageActions ? "with-actions" : ""}">
      <span data-label="Transaction Date">${escapeHtml(formatDate(entry.transactionAt))}</span>
      <span data-label="Created">${escapeHtml(formatDateTime(entry.createdAt))}</span>
      <span data-label="Type">${escapeHtml(typeLabel)}</span>
      <span data-label="Creator">${escapeHtml(getMemberName(entry.createdByUserId))}</span>
      <span data-label="Account">${escapeHtml(account)}</span>
      <span data-label="Category / Route">${escapeHtml(route)}</span>
      <span data-label="Note">${escapeHtml(entry.note || "-")}</span>
      <span data-label="Amount" class="history-amount ${amountClass}">${escapeHtml(`${amountPrefix}${formatRupiah(entry.amountMinor)}`)}</span>
      ${actionsMarkup}
    </div>
  `;
}

function buildHistoryMarkup(entry) {
  const typePillClass = getLedgerAmountClass(entry);
  const amountClass = entry.kind === "adjustment" ? "adjustment" : typePillClass;
  const amountPrefix = getLedgerAmountPrefix(entry);

  const display = buildHistoryDisplay(entry, { formatDate, formatDateTime });

  const pills = [];
  if (entry.kind === "adjustment") {
    pills.push(`<span class="pill adjustment">Balance correction</span>`);
    pills.push(`<span class="pill neutral">${escapeHtml(entry.accountName)}</span>`);
  } else {
    pills.push(`<span class="pill ${typePillClass}">${escapeHtml(entry.kindLabel)}</span>`);
    if (entry.kind === "transfer") {
      pills.push(`<span class="pill neutral">${escapeHtml(entry.fromAccountDisplayName || entry.fromAccountName)}</span>`);
      pills.push(`<span class="pill neutral">${escapeHtml(entry.toAccountDisplayName || entry.toAccountName)}</span>`);
    } else {
      if (entry.categoryName) {
        pills.push(`<span class="pill neutral">${escapeHtml(entry.categoryName)}</span>`);
      }
      if (entry.accountName) {
        pills.push(`<span class="pill neutral">${escapeHtml(entry.accountName)}</span>`);
      }
    }
  }

  const isMenuOpen = state.openHistoryMenuId === entry.groupId;
  const menuItems = [
    canEditEntry(entry)
      ? `<button class="overflow-item" type="button" data-action="edit-history" data-id="${entry.groupId}">Edit</button>`
      : "",
    canDeleteEntry(entry)
      ? `<button class="overflow-item danger" type="button" data-action="delete-history" data-id="${entry.groupId}">Delete</button>`
      : ""
  ].filter(Boolean).join("");
  const actionsMarkup = menuItems
    ? `
      <div class="history-item-actions">
        <button class="overflow-btn" type="button" aria-label="Open history actions" data-action="toggle-history-menu" data-id="${entry.groupId}">&#8942;</button>
        <div class="overflow-menu${isMenuOpen ? "" : " hidden"}">
          ${menuItems}
        </div>
      </div>
    `
    : "";

  return `
    <div class="history-main">
      <div class="history-supporting">
        <div>
          <p class="history-title">${escapeHtml(display.title)}</p>
          <div class="history-meta">${escapeHtml(display.subtitle)}</div>
        </div>
        <div class="pill-row">${pills.join("")}</div>
      </div>
      <p class="history-amount ${amountClass}">${escapeHtml(`${amountPrefix}${formatRupiah(entry.amountMinor)}`)}</p>
    </div>
    <div class="history-footer">
      <div class="list-row-meta">
        <span>Created by ${escapeHtml(getMemberName(entry.createdByUserId))}</span>
      </div>
      ${actionsMarkup}
    </div>
  `;
}

function populateOwnerSelects() {
  const editingAccount = state.editAccountId
    ? state.accounts.find(account => account.id === state.editAccountId)
    : null;
  const ownerUserId = editingAccount?.primaryOwnerUserId || state.authUser?.uid || "";
  const ownerLabel = editingAccount ? getMemberName(ownerUserId) : getDisplayName();

  els.accountOwner.innerHTML = ownerUserId
    ? `<option value="${escapeHtml(ownerUserId)}">${escapeHtml(ownerLabel)}</option>`
    : `<option value="">No owner available</option>`;
  els.accountOwner.value = ownerUserId;
  els.accountOwner.disabled = true;

  const activeAccounts = getActiveAccounts();
  const previousAdjustValue = els.adjustAccount.value;
  const accountOptions = activeAccounts.map(account => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("");
  els.adjustAccount.innerHTML = accountOptions || `<option value="">No active accounts</option>`;

  if (previousAdjustValue && activeAccounts.some(account => account.id === previousAdjustValue)) {
    els.adjustAccount.value = previousAdjustValue;
  }
}

function syncAccountOwnerInput() {
  const editingAccount = state.editAccountId
    ? state.accounts.find(account => account.id === state.editAccountId)
    : null;
  const ownerUserId = editingAccount?.primaryOwnerUserId || state.authUser?.uid || "";
  if (els.accountOwner) {
    els.accountOwner.value = ownerUserId;
  }

  const activeAccounts = getActiveAccounts();
  const previousAdjustValue = els.adjustAccount.value;
  const accountOptions = activeAccounts.map(account => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("");
  els.adjustAccount.innerHTML = accountOptions || `<option value="">No active accounts</option>`;

  if (previousAdjustValue && activeAccounts.some(account => account.id === previousAdjustValue)) {
    els.adjustAccount.value = previousAdjustValue;
  }
}

function renderMembersList() {
  els.membersList.innerHTML = "";
  if (!state.members.length) {
    els.membersList.innerHTML = `<p class="status-copy">No members loaded yet.</p>`;
    return;
  }

  state.members.forEach(member => {
    const canRemove = state.member?.role === "admin"
      && member.id !== state.authUser?.uid
      && member.status !== "removed";
    const item = document.createElement("article");
    item.className = "list-row";
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">${escapeHtml(member.displayName || member.emailNormalized)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(member.emailNormalized || "")}</span>
            <span>|</span>
            <span>${escapeHtml(member.role || "member")}</span>
            <span>|</span>
            <span>${escapeHtml(member.status || "active")}</span>
          </div>
        </div>
        ${canRemove ? `
          <div class="list-row-actions">
            <button class="text-btn danger" type="button" data-action="remove-member" data-id="${member.id}">Remove</button>
          </div>
        ` : ""}
      </div>
    `;
    els.membersList.appendChild(item);
  });
}

function renderInvitesList() {
  els.inviteList.innerHTML = "";
  const visibleInvites = state.invites.filter(item => item.status === "pending" && !isExpired(item.expiresAt));
  const canRevokeInvite = state.member?.role === "admin";

  if (!visibleInvites.length) {
    els.inviteList.innerHTML = `<p class="status-copy">No active invite codes.</p>`;
    return;
  }

  visibleInvites.forEach(invite => {
    const item = document.createElement("article");
    item.className = "list-row";
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">Code ${escapeHtml(invite.inviteCode)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(invite.householdName || state.household?.name || "Household")}</span>
            <span>|</span>
            <span>Expires ${escapeHtml(formatDateTime(invite.expiresAt, false))}</span>
          </div>
        </div>
        <div class="list-row-actions">
          <button class="text-btn" type="button" data-action="copy-invite-code" data-id="${invite.id}">Copy code</button>
          ${canRevokeInvite ? `<button class="text-btn danger" type="button" data-action="revoke-invite" data-id="${invite.id}">Revoke</button>` : ""}
        </div>
      </div>
    `;
    els.inviteList.appendChild(item);
  });
}

function renderAccountsList() {
  const balances = computeAccountBalances();
  const visibleAccounts = getVisibleAccounts();
  els.accountsList.innerHTML = "";

  if (!visibleAccounts.length) {
    els.accountsList.innerHTML = `<div class="empty-card"><h4>No visible accounts</h4><p>Create an account for yourself or switch to household view.</p></div>`;
    return;
  }

  visibleAccounts.forEach(account => {
    const owner = getMemberName(account.primaryOwnerUserId);
    const canEdit = canEditAccount(account);
    const balanceMinor = balances.get(account.id) || 0;
    const lockedMinor = getReservedSavingMinorForAccount(account.id);
    const activeMinor = Math.max(0, balanceMinor - lockedMinor);
    const item = document.createElement("article");
    item.className = "list-row";
    item.innerHTML = `
      <div class="list-row-head">
        <div>
          <p class="list-row-title">${escapeHtml(account.name)}</p>
          <div class="list-row-meta">
            <span>${escapeHtml(owner)}</span>
            <span>|</span>
            <span>Active: ${escapeHtml(formatRupiah(activeMinor))}</span>
            <span>|</span>
            <span>Locked: ${escapeHtml(formatRupiah(lockedMinor))}</span>
          </div>
        </div>
        <div class="list-row-actions">
          ${canEdit ? `<button class="text-btn" type="button" data-action="edit-account" data-id="${account.id}">Edit</button>` : ""}
          <button class="text-btn danger" type="button" data-action="archive-account" data-id="${account.id}">Archive</button>
        </div>
      </div>
    `;
    els.accountsList.appendChild(item);
  });
}

function populateTransactionSelects(selected = {}) {
  const ownedAccounts = getOwnedActiveAccounts();
  const activeAccounts = getActiveAccounts();
  const activeCategories = getActiveCategories();
  const visibleInvestments = getVisibleInvestments();
  const kind = els.transactionKind.value;
  const selectedCategoryId = selected.categoryId || els.transactionCategory.value || "";

  const categoryOptions = activeCategories
    .filter(category => (
      isCategoryAllowedForKind(category, kind)
      && (!isProtectedSystemCategory(category) || category.id === selectedCategoryId)
    ))
    .map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
    .join("");
  const accountOptions = [
    ...ownedAccounts
      .map(account => `<option value="${account.id}">${escapeHtml(getAccountOptionLabel(account))}</option>`),
    ...(kind === "outcome"
      ? getSelectableSavingsForSource({ includeGoalId: selected.savingGoalId }).map(goal => `<option value="${buildSavingAccountOptionValue(goal.id)}">${escapeHtml(getSavingAccountOptionLabel(goal))}</option>`)
      : [])
  ].join("");
  const investmentOptions = visibleInvestments
    .map(investment => `<option value="${buildInvestmentAccountOptionValue(investment.id)}">[Investment] ${escapeHtml(investment.name)}</option>`);
  const transferSavings = getSelectableSavingsForTransferDestination({ includeGoalId: selected.transferSavingGoalId });
  const transferFromOptions = [
    ...ownedAccounts.map(account => `<option value="${account.id}">${escapeHtml(getAccountOptionLabel(account))}</option>`),
    ...investmentOptions
  ].join("");
  const transferToOptions = [
    ...transferSavings.map(goal => `<option value="${buildSavingAccountOptionValue(goal.id)}">${escapeHtml(getSavingTransferTargetOptionLabel(goal))}</option>`),
    ...activeAccounts.map(account => `<option value="${account.id}">${escapeHtml(getAccountOptionLabel(account))}</option>`),
    ...investmentOptions
  ].join("");

  els.transactionCategory.innerHTML = categoryOptions
    ? `<option value="">Choose category</option>${categoryOptions}`
    : `<option value="">No categories available</option>`;
  els.transactionAccount.innerHTML = accountOptions || `<option value="">No accounts available</option>`;
  els.transferFromAccount.innerHTML = transferFromOptions || `<option value="">No accounts available</option>`;
  els.transferToAccount.innerHTML = transferToOptions || `<option value="">No accounts available</option>`;

  setSelectValue(els.transactionCategory, selected.categoryId);
  setSelectValue(els.transactionAccount, getTransactionAccountOptionValue(kind, selected));
  setSelectValue(els.transferFromAccount, selected.fromAccountId);
  setSelectValue(els.transferToAccount, getTransferDestinationOptionValue(selected));

  if (!els.transferFromAccount.value && ownedAccounts[0]) {
    els.transferFromAccount.value = ownedAccounts[0].id;
  }

  if (!els.transferToAccount.value && activeAccounts[1]) {
    els.transferToAccount.value = activeAccounts[1].id;
  } else if (!els.transferToAccount.value && activeAccounts[0]) {
    els.transferToAccount.value = activeAccounts[0].id;
  }

  if (
    !isSavingAccountOptionValue(els.transferToAccount.value)
    && !isInvestmentAccountOptionValue(els.transferToAccount.value)
    && !isInvestmentAccountOptionValue(els.transferFromAccount.value)
    && els.transferToAccount.value === els.transferFromAccount.value
  ) {
    const sourceSavings = transferSavings.filter(goal => goal.status === "active" && goal.linkedAccountId === els.transferFromAccount.value);
    const alternative = activeAccounts.find(account => account.id !== els.transferFromAccount.value);
    if (sourceSavings[0]) {
      els.transferToAccount.value = buildSavingAccountOptionValue(sourceSavings[0].id);
    } else if (alternative) {
      els.transferToAccount.value = alternative.id;
    }
  }

  populateSavingSelects();
  syncTransactionPlanningFields(selected);
}

function setSelectValue(select, desiredValue) {
  if (!desiredValue) {
    select.value = select.options[0]?.value || "";
    return;
  }

  if ([...select.options].some(option => option.value === desiredValue)) {
    select.value = desiredValue;
  } else {
    select.value = select.options[0]?.value || "";
  }
}

function syncTransactionForm(selected = {}) {
  const kind = els.transactionKind.value;
  const showTransfer = kind === "transfer";
  els.entryFields.classList.toggle("hidden", showTransfer);
  els.transferFields.classList.toggle("hidden", !showTransfer);
  els.transactionCategoryField.classList.toggle("hidden", showTransfer);
  els.transactionCategoryHelpBtn.classList.toggle("hidden", showTransfer);
  els.transferNoteField.classList.toggle("hidden", !showTransfer);
  els.transactionAccountField.classList.toggle("hidden", showTransfer);
  els.transactionNoteRow.classList.toggle("hidden", showTransfer);
  els.transactionUseSavingField.classList.add("hidden");
  if (showTransfer) {
    closeCategoryHelperModal();
  }
  populateTransactionSelects(selected);
  syncTransactionFeeField();
}

function syncTransactionPlanningFields(selected = {}) {
  const kind = els.transactionKind.value;
  const category = state.categories.find(item => item.id === els.transactionCategory.value && item.status === "active");
  const accountSelection = resolveTransactionAccountSelection(els.transactionAccount.value);
  const accountId = accountSelection.account?.id || "";
  const isTransfer = kind === "transfer";
  const isSavingFunding = !isTransfer && kind === "outcome" && isSavingCategory(category);
  const fundingSavings = isSavingFunding
    ? getEligibleSavingsForFunding(accountId, { includeSavingGoalId: selected.savingGoalId || els.transactionSavingGoal.value })
    : [];

  els.transactionNoteField.classList.toggle("hidden", isSavingFunding);
  els.transactionSavingField.classList.toggle("hidden", !isSavingFunding);
  els.transactionAccountField.classList.toggle("hidden", isTransfer);

  if (isTransfer) {
    els.transactionNoteField.classList.remove("hidden");
    els.transactionSavingField.classList.add("hidden");
    els.transactionUseSavingField.classList.add("hidden");
    return;
  }

  if (isSavingFunding) {
    els.transactionSavingGoal.innerHTML = fundingSavings.length
      ? fundingSavings.map(goal => `<option value="${goal.id}">${escapeHtml(goal.name)}</option>`).join("")
      : `<option value="">No savings linked to this account</option>`;
    setSelectValue(els.transactionSavingGoal, selected.savingGoalId);
    const chosenGoal = state.savingGoals.find(goal => goal.id === els.transactionSavingGoal.value);
    if (chosenGoal) {
      els.transactionNote.value = chosenGoal.name;
    } else {
      els.transactionNote.value = "";
    }
    els.transactionUseSavingField.classList.add("hidden");
    return;
  }

  els.transactionUseSavingField.classList.add("hidden");
}

function getTransactionNoteValue(kind) {
  if (kind === "transfer") {
    return cleanText(els.transferNote.value);
  }

  const category = state.categories.find(item => item.id === els.transactionCategory.value && item.status === "active");
  if (kind === "outcome" && isSavingCategory(category)) {
    const goal = state.savingGoals.find(item => item.id === els.transactionSavingGoal.value);
    return goal?.name || "";
  }

  return cleanText(els.transactionNote.value);
}

function getTransactionFeeMinor() {
  if (state.editTransactionGroupId || !els.transactionFeeEnabled.checked) {
    return 0;
  }
  const kind = els.transactionKind.value;
  if (kind !== "outcome" && kind !== "transfer") {
    return 0;
  }
  return parseMinorInput(els.transactionFeeAmount.value) || 0;
}

function syncTransactionFeeField() {
  const kind = els.transactionKind.value;
  const showToggle = !state.editTransactionGroupId && (kind === "outcome" || kind === "transfer");
  els.transactionFeeToggleField.classList.toggle("hidden", !showToggle);
  els.transactionFeeHelpBtn.classList.toggle("hidden", !showToggle);
  els.transactionFeeField.classList.toggle("hidden", !showToggle || !els.transactionFeeEnabled.checked);
  if (!showToggle) {
    els.transactionFeeEnabled.checked = false;
    els.transactionFeeAmount.value = "";
  }
}

function syncInvestmentMovementFeeField() {
  if (!els.investmentMovementFeeField) {
    return;
  }
  els.investmentMovementFeeField.classList.toggle("hidden", !els.investmentMovementFeeEnabled?.checked);
  if (!els.investmentMovementFeeEnabled?.checked && els.investmentMovementFeeAmount) {
    els.investmentMovementFeeAmount.value = "";
  }
}

function getAdminFeeCategory() {
  return getSystemCategoryByKey("admin_fee");
}

function maybeAddFeeRowToBatch(batch, { transactionCollection, feeMinor, note, fallbackNote = "", transactionAt, account }) {
  if (!feeMinor) {
    return null;
  }

  const category = getAdminFeeCategory();
  if (!category) {
    throw new Error("Admin Fee category is not ready yet. Wait a moment, then try again.");
  }

  const feeRef = doc(transactionCollection);
  batch.set(feeRef, buildSingleRow({
    id: feeRef.id,
    kind: "outcome",
    amountMinor: feeMinor,
    note: cleanText(note) || cleanText(fallbackNote) || category.name,
    transactionAt,
    account,
    category
  }));
  return feeRef.id;
}

function resolveSingleTransactionPlanningSelection(kind, category, account, accountSelection = null) {
  if (!state.household?.id) {
    return {
      note: cleanText(els.transactionNote.value),
      savingGoalId: null,
      recurringBillId: null,
      recurringBillOccurrenceId: null
    };
  }

  const recurringBillId = cleanText(els.transactionRecurringBillId.value) || null;
  const recurringBillOccurrenceId = cleanText(els.transactionRecurringBillOccurrenceId.value) || null;
  const selectedAccount = accountSelection || resolveTransactionAccountSelection(els.transactionAccount.value);

  if (kind === "outcome" && isSavingCategory(category)) {
    const goal = state.savingGoals.find(item => item.id === els.transactionSavingGoal.value && item.status === "active");
    if (!goal) {
      throw new Error("Choose a saving goal linked to this account.");
    }
    if (selectedAccount.optionType === "saving") {
      throw new Error("Choose a real source account when allocating funds to a saving.");
    }
    if (goal.linkedAccountId !== account.id) {
      throw new Error("That saving goal is linked to a different account.");
    }
    return {
      note: goal.name,
      savingGoalId: goal.id,
      recurringBillId,
      recurringBillOccurrenceId
    };
  }

  if (selectedAccount.savingGoal) {
    if (selectedAccount.savingGoal.linkedAccountId !== account.id) {
      throw new Error("That saving goal is linked to a different account.");
    }
    return {
      note: cleanText(els.transactionNote.value),
      savingGoalId: selectedAccount.savingGoal.id,
      recurringBillId,
      recurringBillOccurrenceId
    };
  }

  return {
    note: cleanText(els.transactionNote.value),
    savingGoalId: null,
    recurringBillId,
    recurringBillOccurrenceId
  };
}

async function syncRecurringBillOccurrenceAfterSave({ transactionId, transactionGroupId, transactionAt, recurringBillId, recurringBillOccurrenceId }) {
  if (!recurringBillId || !recurringBillOccurrenceId) {
    return;
  }

  const bill = state.recurringBills.find(item => item.id === recurringBillId);
  if (!bill) {
    return;
  }

  await setDoc(doc(db, "households", state.household.id, "recurringBillOccurrences", recurringBillOccurrenceId), {
    billId: bill.id,
    billNameSnapshot: bill.name,
    occurrenceKey: recurringBillOccurrenceId.split("__").slice(1).join("__"),
    dueAt: timestampFromOccurrenceId(recurringBillOccurrenceId, bill.anchorDate),
    transactionId,
    transactionGroupId,
    transactionAt,
    scopeType: bill.scopeType,
    ownerUserId: bill.ownerUserId || null,
    status: "completed",
    completedByUserId: state.authUser.uid,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function computeAccountBalances(rows = getActiveRawTransactions()) {
  const balances = new Map();
  getActiveAccounts().forEach(account => {
    balances.set(account.id, Number(account.openingBalanceMinor || 0));
  });

  rows.forEach(transaction => {
    if (!balances.has(transaction.accountId)) {
      return;
    }
    const current = balances.get(transaction.accountId) || 0;
    balances.set(transaction.accountId, current + getPostingDelta(transaction));
  });

  return balances;
}

function getPostingDelta(transaction) {
  const amountMinor = Number(transaction.amountMinor || 0);
  switch (transaction.postingKind) {
    case "income":
    case "transfer_in":
    case "adjustment_increase":
      return amountMinor;
    case "outcome":
    case "transfer_out":
    case "adjustment_decrease":
      return -amountMinor;
    default:
      return 0;
  }
}

function getActiveRowsExcludingTransactionGroup(groupId = "") {
  if (!groupId) {
    return getActiveRawTransactions();
  }
  return getActiveRawTransactions().filter(row => (row.transactionGroupId || row.id) !== groupId);
}

function getReservedSavingMinorForAccount(accountId, rows = getActiveRawTransactions()) {
  const allocations = getEffectiveSavingAllocations(rows);
  return getAccessibleSavingGoals({ includeCompleted: true }).reduce((sum, goal) => {
    if (goal.status === "archived" || goal.linkedAccountId !== accountId) {
      return sum;
    }
    return sum + Math.max(0, allocations.get(goal.id) || 0);
  }, 0);
}

function getSpendableBalanceMinor(accountId, rows = getActiveRawTransactions()) {
  const balances = computeAccountBalances(rows);
  const reservedMinor = getReservedSavingMinorForAccount(accountId, rows);
  return (balances.get(accountId) || 0) - reservedMinor;
}

function getSavingAvailableMinor(goalId, rows = getActiveRawTransactions()) {
  const allocations = getEffectiveSavingAllocations(rows);
  return Math.max(0, allocations.get(goalId) || 0);
}

function assertRegularAccountSpendAllowed(accountId, amountMinor, rows = getActiveRawTransactions()) {
  if (getSpendableBalanceMinor(accountId, rows) < amountMinor) {
    throw new Error("This would use funds reserved in savings or push the account below zero.");
  }
}

function assertSavingSpendAllowed(goal, amountMinor, rows = getActiveRawTransactions()) {
  if (!goal) {
    throw new Error("Choose an available saving.");
  }
  const linkedAccount = getLinkedActiveAccountForSaving(goal);
  if (!linkedAccount) {
    throw new Error("That saving is no longer linked to an active account.");
  }
  if (linkedAccount.primaryOwnerUserId !== state.authUser?.uid) {
    throw new Error("You can only spend from savings tied to your own accounts.");
  }
  if (computeAccountBalances(rows).get(linkedAccount.id) < amountMinor) {
    throw new Error("This would push the linked account below zero.");
  }
  if (getSavingAvailableMinor(goal.id, rows) < amountMinor) {
    throw new Error("This saving does not have enough available funds.");
  }
}

function getVisibleAccounts() {
  const activeAccounts = getActiveAccounts();
  if (state.scope === "household") {
    return activeAccounts;
  }
  return activeAccounts.filter(account => account.primaryOwnerUserId === state.authUser?.uid);
}

function getVisibleRawTransactions() {
  const activeRows = getActiveRawTransactions();
  if (state.scope === "household") {
    return activeRows;
  }
  return activeRows.filter(row => isRowVisibleInPersonalScope(row));
}

function isRowVisibleInPersonalScope(row) {
  const userId = state.authUser?.uid;
  return row.createdByUserId === userId
    || row.accountPrimaryOwnerUserIdSnapshot === userId
    || row.counterpartyAccountPrimaryOwnerUserIdSnapshot === userId;
}

function getGroupedEntriesAll() {
  const groups = new Map();

  getActiveRawTransactions().forEach(row => {
    const groupId = row.transactionGroupId || row.id;
    const existing = groups.get(groupId) || [];
    existing.push(row);
    groups.set(groupId, existing);
  });

  return Array.from(groups.entries())
    .map(([groupId, rows]) => mapRowsToEntry(groupId, rows))
    .filter(Boolean)
    .sort((a, b) => getTimestampSortValue(b.createdAt) - getTimestampSortValue(a.createdAt));
}

function isEntryVisibleInPersonalLedgerScope(entry) {
  const userId = state.authUser?.uid;
  if (!userId) {
    return false;
  }
  if (entry.rows.some(row => row.createdByUserId === userId)) {
    return true;
  }
  if (entry.kind === "transfer") {
    return entry.rows.some(row => (
      row.accountPrimaryOwnerUserIdSnapshot === userId
      || row.counterpartyAccountPrimaryOwnerUserIdSnapshot === userId
    ));
  }
  return false;
}

function getVisibleGroupedEntries() {
  return getGroupedEntriesAll().filter(entry => {
    if (state.scope === "household") {
      return true;
    }
    return isEntryVisibleInPersonalLedgerScope(entry);
  });
}

function getLedgerEntriesForCurrentMode() {
  const visibleEntries = filterLedgerEntries(getVisibleGroupedEntries(), state.dashboardLedgerFilters)
    .sort((a, b) => getTimestampSortValue(b.createdAt) - getTimestampSortValue(a.createdAt));

  if (state.ledgerMode === "month") {
    return visibleEntries.filter(entry => isTimestampInLedgerMonth(entry.transactionAt, state.ledgerMonthOffset));
  }

  return visibleEntries.slice(0, 10);
}

function getPlanningLedgerEntries() {
  return filterLedgerEntries(getVisibleGroupedEntries(), state.planningLedgerFilters)
    .sort((left, right) => {
      const field = state.planningLedgerSort.startsWith("transaction") ? "transactionAt" : "createdAt";
      const leftValue = getTimestampSortValue(left[field]);
      const rightValue = getTimestampSortValue(right[field]);
      return state.planningLedgerSort.endsWith("-asc")
        ? leftValue - rightValue
        : rightValue - leftValue;
    });
}

function filterLedgerEntries(entries, filters = {}) {
  return entries.filter(entry => {
    if (filters.kind) {
      if (filters.kind === "investment") {
        if (!isInvestmentEntry(entry)) {
          return false;
        }
      } else if (entry.kind !== filters.kind) {
        return false;
      }
    }

    if (filters.accountId && !entry.rows.some(row => row.accountId === filters.accountId || row.counterpartyAccountId === filters.accountId)) {
      return false;
    }

    if (filters.categoryId && !entry.rows.some(row => row.categoryId === filters.categoryId)) {
      return false;
    }

    if (filters.creatorUserId && entry.createdByUserId !== filters.creatorUserId) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const transactionMillis = getTimestampSortValue(entry.transactionAt);
      if (filters.dateFrom && transactionMillis < dateFromDateInput(filters.dateFrom).getTime()) {
        return false;
      }
      if (filters.dateTo) {
        const endDate = dateFromDateInput(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        if (transactionMillis > endDate.getTime()) {
          return false;
        }
      }
    }

    return true;
  });
}

function isInvestmentEntry(entry) {
  return Boolean(entry?.investmentAccountId)
    || entry?.rows?.some(row => isInvestmentCategoryId(row.categoryId) || row.investmentAccountId);
}

function getInvestmentEntryLabel(entry) {
  const row = entry?.rows?.find(item => isInvestmentCategoryId(item.categoryId) || item.investmentAccountId);
  const systemKey = getCategorySystemKey(row?.categoryId || "");
  return systemKey === "investment_withdrawal" ? "Investment withdrawal" : "Investment deposit";
}

function getLedgerAmountClass(entry) {
  if (entry.kind === "transfer") {
    return "transfer";
  }
  if (entry.kind === "income") {
    return "income";
  }
  if (entry.kind === "adjustment" && entry.postingKind === "adjustment_increase") {
    return "adjustment-increase";
  }
  if (entry.kind === "adjustment" && entry.postingKind === "adjustment_decrease") {
    return "adjustment-decrease";
  }
  return "outcome";
}

function getLedgerAmountPrefix(entry) {
  const isPersonalScope = state.scope === "personal";
  const transferDirection = entry.kind === "transfer" ? getTransferDirectionForCurrentUser(entry) : "neutral";
  if (entry.kind === "income" || entry.postingKind === "adjustment_increase") {
    return "+";
  }
  if (entry.kind === "transfer") {
    if (isPersonalScope && transferDirection === "out") {
      return "-";
    }
    if (isPersonalScope && transferDirection === "in") {
      return "+";
    }
    return "";
  }
  return "-";
}

function renderLedgerNav() {
  if (!els.ledgerNav) {
    return;
  }

  if (state.ledgerMode === "recent") {
    els.ledgerNav.innerHTML = `
      <button class="text-btn" type="button" data-action="show-ledger-month" data-offset="0">Show ${escapeHtml(formatLedgerMonthLabel(0))}</button>
    `;
    return;
  }

  const controls = [
    `<button class="text-btn" type="button" data-action="show-ledger-recent">&larr; Recent</button>`
  ];

  if (state.ledgerMonthOffset < 2) {
    controls.push(
      `<button class="text-btn" type="button" data-action="show-older-ledger-month">Show ${escapeHtml(formatLedgerMonthLabel(state.ledgerMonthOffset + 1))}</button>`
    );
  } else {
    controls.push(`<span>Export CSV to view older transactions.</span>`);
  }

  els.ledgerNav.innerHTML = controls.join("");
}

function getLedgerReferenceDate(monthOffset = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - monthOffset);
  return date;
}

function getYearMonthParts(dateLike) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: TIMEZONE
  });
  const parts = formatter.formatToParts(dateLike);
  return {
    year: Number(parts.find(part => part.type === "year")?.value || 0),
    month: Number(parts.find(part => part.type === "month")?.value || 0)
  };
}

function formatLedgerMonthLabel(monthOffset = 0) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: TIMEZONE
  }).format(getLedgerReferenceDate(monthOffset));
}

function isTimestampInLedgerMonth(timestamp, monthOffset = 0) {
  if (!timestamp?.toDate) {
    return false;
  }

  const target = getYearMonthParts(getLedgerReferenceDate(monthOffset));
  const value = getYearMonthParts(timestamp.toDate());
  return target.year === value.year && target.month === value.month;
}

function canEditAccount(account) {
  if (!account || !state.authUser) {
    return false;
  }
  return account.primaryOwnerUserId === state.authUser.uid || state.member?.role === "admin";
}

function canDeleteEntry(entry) {
  return Boolean(entry && state.authUser && entry.createdByUserId === state.authUser.uid && !isInvestmentEntry(entry));
}

function canEditEntry(entry) {
  return canDeleteEntry(entry) && entry.kind !== "adjustment";
}

function getTransferDirectionForCurrentUser(entry) {
  const userId = state.authUser?.uid;
  if (!userId || entry.kind !== "transfer") {
    return "neutral";
  }
  const fromOwned = entry.fromAccountPrimaryOwnerUserId === userId;
  const toOwned = entry.toAccountPrimaryOwnerUserId === userId;
  if (fromOwned && toOwned) {
    return "self";
  }
  if (fromOwned) {
    return "out";
  }
  if (toOwned) {
    return "in";
  }
  return "neutral";
}

function mapRowsToEntry(groupId, rows) {
  const sortedRows = [...rows].sort((a, b) => getTimestampSortValue(a.createdAt) - getTimestampSortValue(b.createdAt));
  const first = sortedRows[0];
  if (!first) {
    return null;
  }
  const latestCreatedAt = [...rows]
    .map(row => row.createdAt)
    .sort((left, right) => getTimestampSortValue(right) - getTimestampSortValue(left))[0] || null;

  if (first.displayKind === "transfer" || sortedRows.some(row => row.displayKind === "transfer")) {
    const outRow = sortedRows.find(row => row.postingKind === "transfer_out");
    const inRow = sortedRows.find(row => row.postingKind === "transfer_in");
    if (!outRow || !inRow) {
      return null;
    }
    const fromOwnerUserId = outRow.accountPrimaryOwnerUserIdSnapshot || "";
    const toOwnerUserId = inRow.accountPrimaryOwnerUserIdSnapshot || "";
    const fromAccountName = outRow.accountNameSnapshot || "From account";
    const toAccountName = inRow.accountNameSnapshot || "To account";
    const isCrossOwnerTransfer = Boolean(fromOwnerUserId && toOwnerUserId && fromOwnerUserId !== toOwnerUserId);
    return {
      groupId,
      kind: "transfer",
      kindLabel: "Transfer",
      rows: sortedRows,
      amountMinor: Number(outRow.amountMinor || 0),
      note: outRow.note || inRow.note || "",
      transactionAt: outRow.transactionAt || inRow.transactionAt,
      createdAt: latestCreatedAt,
      createdByUserId: outRow.createdByUserId || inRow.createdByUserId,
      savingGoalId: outRow.savingGoalId || inRow.savingGoalId || null,
      recurringBillId: outRow.recurringBillId || inRow.recurringBillId || null,
      recurringBillOccurrenceId: outRow.recurringBillOccurrenceId || inRow.recurringBillOccurrenceId || null,
      fromAccountId: outRow.accountId,
      toAccountId: inRow.accountId,
      fromAccountPrimaryOwnerUserId: fromOwnerUserId,
      toAccountPrimaryOwnerUserId: toOwnerUserId,
      fromAccountName,
      toAccountName,
      fromAccountDisplayName: isCrossOwnerTransfer ? `${fromAccountName} - ${getMemberName(fromOwnerUserId)}` : fromAccountName,
      toAccountDisplayName: isCrossOwnerTransfer ? `${toAccountName} - ${getMemberName(toOwnerUserId)}` : toAccountName
    };
  }

  return {
    groupId,
    kind: first.displayKind,
    kindLabel: first.displayKind === "adjustment" ? "Balance correction" : capitalize(first.displayKind),
    rows: sortedRows,
    amountMinor: Number(first.amountMinor || 0),
    note: first.note || "",
    transactionAt: first.transactionAt,
    createdAt: latestCreatedAt,
    createdByUserId: first.createdByUserId,
    savingGoalId: first.savingGoalId || null,
    recurringBillId: first.recurringBillId || null,
    recurringBillOccurrenceId: first.recurringBillOccurrenceId || null,
    accountId: first.accountId,
    accountName: first.accountNameSnapshot || "No account",
    categoryId: first.categoryId || "",
    categoryName: first.categoryNameSnapshot || "",
    postingKind: first.postingKind
  };
}

function getActiveAccounts() {
  return state.accounts.filter(account => account.status === "active");
}

function getActiveCategories() {
  return state.categories.filter(category => category.status === "active");
}

function getActiveRawTransactions() {
  return state.transactionsRaw.filter(transaction => transaction.status !== "deleted");
}

function buildSingleRow({ id, kind, amountMinor, note, transactionAt, account, category, savingGoalId = null, recurringBillId = null, recurringBillOccurrenceId = null, investmentAccountId = null }) {
  return {
    transactionGroupId: id,
    postingKind: kind,
    displayKind: kind,
    accountId: account.id,
    accountNameSnapshot: account.name,
    accountPrimaryOwnerUserIdSnapshot: account.primaryOwnerUserId,
    counterpartyAccountId: null,
    counterpartyAccountNameSnapshot: null,
    counterpartyAccountPrimaryOwnerUserIdSnapshot: null,
    categoryId: category.id,
    categoryNameSnapshot: category.name,
    amountMinor,
    currencyCode: CURRENCY_CODE,
    transactionAt,
    note,
    createdByUserId: state.authUser.uid,
    savingGoalId,
    investmentAccountId,
    recurringBillId,
    recurringBillOccurrenceId,
    status: "active",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function buildTransferRow({ id, groupId, postingKind, amountMinor, note, transactionAt, account, counterpartyAccount, savingGoalId = null }) {
  return {
    transactionGroupId: groupId,
    postingKind,
    displayKind: "transfer",
    accountId: account.id,
    accountNameSnapshot: account.name,
    accountPrimaryOwnerUserIdSnapshot: account.primaryOwnerUserId,
    counterpartyAccountId: counterpartyAccount.id,
    counterpartyAccountNameSnapshot: counterpartyAccount.name,
    counterpartyAccountPrimaryOwnerUserIdSnapshot: counterpartyAccount.primaryOwnerUserId,
    categoryId: null,
    categoryNameSnapshot: null,
    amountMinor,
    currencyCode: CURRENCY_CODE,
    transactionAt,
    note,
    createdByUserId: state.authUser.uid,
    savingGoalId,
    investmentAccountId: null,
    recurringBillId: null,
    recurringBillOccurrenceId: null,
    status: "active",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function buildAdjustmentRow({ id, account, amountMinor, postingKind, note }) {
  return {
    transactionGroupId: id,
    postingKind,
    displayKind: "adjustment",
    accountId: account.id,
    accountNameSnapshot: account.name,
    accountPrimaryOwnerUserIdSnapshot: account.primaryOwnerUserId,
    counterpartyAccountId: null,
    counterpartyAccountNameSnapshot: null,
    counterpartyAccountPrimaryOwnerUserIdSnapshot: null,
    categoryId: null,
    categoryNameSnapshot: null,
    amountMinor,
    currencyCode: CURRENCY_CODE,
    transactionAt: Timestamp.fromDate(new Date()),
    note,
    createdByUserId: state.authUser.uid,
    savingGoalId: null,
    investmentAccountId: null,
    recurringBillId: null,
    recurringBillOccurrenceId: null,
    status: "active",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function resetAccountForm() {
  state.editAccountId = null;
  els.accountEditId.value = "";
  els.accountForm.reset();
  setMoneyInputValue(els.accountOpeningBalance, 0);
  syncAccountOpeningBalanceField();
  els.accountSubmitBtn.textContent = "Save account";
  els.accountCancelBtn.classList.add("hidden");
  syncAccountOwnerInput();
}

function syncAccountOpeningBalanceField() {
  const openingBalanceField = els.accountOpeningBalance?.closest(".field-group");
  const isEditing = Boolean(state.editAccountId);

  if (openingBalanceField) {
    openingBalanceField.classList.toggle("hidden", isEditing);
  }
  if (els.accountOpeningBalance) {
    els.accountOpeningBalance.disabled = isEditing;
  }
}

function resetCategoryForm() {
  state.editCategoryId = null;
  els.categoryEditId.value = "";
  els.categoryForm.reset();
  els.categoryDescription.value = "";
  els.categoryDirection.value = "outcome";
  els.categorySubmitBtn.textContent = "Save category";
  els.categoryCancelBtn.classList.add("hidden");
}

function resetTransactionForm() {
  state.editTransactionGroupId = null;
  els.transactionForm.reset();
  els.transactionGroupId.value = "";
  els.transactionRecurringBillId.value = "";
  els.transactionRecurringBillOccurrenceId.value = "";
  els.transactionKind.value = "outcome";
  els.transactionKind.disabled = false;
  els.transactionDate.value = toDateInput(new Date());
  els.transferNote.value = "";
  els.transactionFeeEnabled.checked = false;
  els.transactionFeeAmount.value = "";
  els.transactionSubmitBtn.textContent = "Save transaction";
  els.transactionCancelBtn.classList.add("hidden");
  els.transactionCardTitle.textContent = "Create transaction";
  if (els.transactionCardCopy) {
    els.transactionCardCopy.textContent = "Income, outcome, transfer, and balance correction all live on the same ledger foundation.";
  }
  els.transactionCard.classList.remove("editing");
  syncTransactionForm();
  setMoneyInputValue(els.transactionAmount, 0);
}

function resetAccessForms() {
  els.loginForm.reset();
  els.registrationCodeForm.reset();
  els.signupForm.reset();
  els.setupCreateForm.reset();
  els.setupJoinForm.reset();
  els.settingsCreateForm.reset();
  els.settingsJoinForm.reset();
  resetRegistrationGate();
  switchAuthMode("login");
  setSignupMode("create");
  setSetupMode("create");
  setSettingsMode("create");
  closeCategoryHelperModal();
  closeInfoModal();
}

function resetStateForAuth(user) {
  setAuthBusy(false);
  state.authUser = user;
  state.userProfile = null;
  state.households = [];
  state.household = null;
  state.member = null;
  state.members = [];
  state.invites = [];
  state.accounts = [];
  state.categories = [];
  state.transactionsRaw = [];
  state.budgets = [];
  state.savingGoals = [];
  state.savingGoalEvents = [];
  state.recurringBills = [];
  state.recurringBillOccurrences = [];
  state.investmentAccounts = [];
  state.investmentAssets = [];
  state.investmentEvents = [];
  state.greetingQuotes = [];
  state.greetingLibraryLoaded = false;
  state.defaultCategoryLibrary = [];
  state.sessionGreeting = GREETINGS[0];
  state.platformMaintenance = getDefaultMaintenanceState();
  state.scope = DEFAULT_SCOPE;
  state.currentView = "dashboard";
  state.planningTab = "accounts";
  state.insightsTab = "ledger";
  state.editAccountId = null;
  state.editCategoryId = null;
  state.editTransactionGroupId = null;
  state.editBudgetId = null;
  state.editSavingGoalId = null;
  state.editBillId = null;
  state.editInvestmentId = null;
  state.editInvestmentAssetId = null;
  state.editInvestmentEventId = null;
  state.openHistoryMenuId = null;
  state.openBillMenuId = null;
  state.openInvestmentEventMenuId = null;
  state.showInvestmentForm = false;
  state.dashboardBillDismissStorageKey = "";
  state.dismissedDashboardBillReminderIds = new Set();
  state.exportCsvContent = "";
  state.ensuringSystemCategories = false;
  state.reportRange = "this-month";
  state.reportCustomFrom = "";
  state.reportCustomTo = "";
  state.reportFiltersVisible = false;
  state.reportFilters = {
    accountIds: [],
    categoryIds: [],
    kind: "outcome",
    memberIds: [],
    includeSavingSpending: false
  };
  state.reportBudgetMode = "average";
  state.reportBudgetRanking = "frequent";
  state.reportBudgetBuffer = "normal";
  state.masterAdmin = {
    checked: false,
    authorized: false,
    codes: [],
    overrides: [],
    blockedDomains: [],
    greetingQuotes: [],
    defaultCategories: [],
    maintenance: null
  };
  resetLedgerView();
  resetAccessForms();
  resetAccountForm();
  resetCategoryForm();
  resetTransactionForm();
  resetBudgetForm();
  resetSavingForm();
  resetBillForm();
  resetInvestmentForm();
  resetInvestmentMovementForm();
  resetInvestmentAssetForm();
}

function switchAuthMode(mode) {
  state.authMode = mode === "signup" && !state.registrationGate.validated ? "login" : mode;
  const isLogin = state.authMode === "login";
  els.loginForm.classList.toggle("hidden", !isLogin);
  els.signupForm.classList.toggle("hidden", isLogin);
  els.loginTab.classList.toggle("active", isLogin);
  els.signupTab.classList.toggle("active", !isLogin);
  els.registrationCodeForm.classList.toggle("hidden", !isLogin || isMasterAdminRoute());
  renderRegistrationGateSummary();
}

function resetRegistrationGate() {
  state.registrationGate = {
    code: "",
    emailNormalized: "",
    validated: false
  };
  els.signupEmail.readOnly = false;
  els.signupCodeSummary.classList.add("hidden");
  els.signupCodeSummaryText.textContent = "";
  setMessage(els.signupMessage, "");
  setMessage(els.registrationCodeMessage, "");
  if (state.authMode === "signup") {
    switchAuthMode("login");
  }
}

function renderRegistrationGateSummary() {
  const showSummary = state.registrationGate.validated && state.authMode === "signup";
  els.signupCodeSummary.classList.toggle("hidden", !showSummary);
  if (showSummary) {
    els.signupCodeSummaryText.textContent = `User creation code accepted for ${state.registrationGate.emailNormalized}.`;
  }
}

function setSignupMode(mode) {
  state.signupMode = mode;
  els.signupModeCreate.classList.toggle("active", mode === "create");
  els.signupModeJoin.classList.toggle("active", mode === "join");
  els.signupCreateFields.classList.toggle("hidden", mode !== "create");
  els.signupJoinFields.classList.toggle("hidden", mode !== "join");
}

function setSetupMode(mode) {
  state.setupMode = mode;
  els.setupModeCreate.classList.toggle("active", mode === "create");
  els.setupModeJoin.classList.toggle("active", mode === "join");
  els.setupCreateForm.classList.toggle("hidden", mode !== "create");
  els.setupJoinForm.classList.toggle("hidden", mode !== "join");
}

function setSettingsMode(mode) {
  state.settingsMode = mode;
  els.settingsModeCreate.classList.toggle("active", mode === "create");
  els.settingsModeJoin.classList.toggle("active", mode === "join");
  els.settingsCreateForm.classList.toggle("hidden", mode !== "create");
  els.settingsJoinForm.classList.toggle("hidden", mode !== "join");
}

function setView(view) {
  state.currentView = view;
  if (view === "insights" && state.insightsTab === "ledger") {
    state.planningLedgerLoaded = true;
  }
  renderApp();
}

function setScope(scope) {
  state.scope = scope;
  resetLedgerView();
  state.openHistoryMenuId = null;
  state.openBillMenuId = null;
  syncPlanningScopeDefaults();
  renderApp();
}

function renderFatalError(error) {
  console.error(error);
  const message = error.message || "Something went wrong while loading Firebase data.";
  els.bootScreen?.classList.add("hidden");

  if (state.authUser) {
    els.authScreen.classList.add("hidden");
    els.setupScreen.classList.remove("hidden");
    els.appScreen.classList.add("hidden");
    els.setupUserLabel.textContent = state.authUser.email ? `Signed in as ${state.authUser.email}` : "";
    if (els.setupAvatar) {
      els.setupAvatar.textContent = getInitials(getDisplayName());
    }
    setMessage(els.setupMessage, message, "error");
    return;
  }

  setMessage(els.loginMessage, message, "error");
  switchAuthMode("login");
  renderScreens();
}

function clearMessages() {
  [
    els.loginMessage,
    els.registrationCodeMessage,
    els.signupMessage,
    els.verificationMessage,
    els.setupMessage,
    els.accountMessage,
    els.adjustmentMessage,
    els.categoryMessage,
    els.budgetMessage,
    els.savingMessage,
    els.billMessage,
    els.transactionMessage,
    els.exportMessage,
    els.profileMessage,
    els.settingsHouseholdMessage,
    els.inviteMessage,
    els.masterCodeMessage,
    els.masterOverrideMessage,
    els.masterBlockedDomainMessage,
    els.masterGreetingMessage,
    els.masterMaintenanceMessage
  ].forEach(element => setMessage(element, ""));
}

function setMessage(element, text, type = "") {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function getDefaultMaintenanceState() {
  return {
    enabled: false,
    blockWrites: false,
    message: ""
  };
}

function normalizeMaintenanceState(data) {
  if (!data) {
    return getDefaultMaintenanceState();
  }

  return {
    enabled: data.enabled === true,
    blockWrites: data.enabled === true && data.blockWrites === true,
    message: cleanText(data.message) || "NestPlan is being updated. Please pause changes for a few minutes.",
    updatedAt: data.updatedAt || null,
    updatedByUserId: data.updatedByUserId || "",
    updatedByEmail: data.updatedByEmail || ""
  };
}

function isMaintenanceWriteBlocked() {
  return state.platformMaintenance?.enabled === true && state.platformMaintenance?.blockWrites === true && !isMasterAdminRoute();
}

function getMaintenanceMessage() {
  return state.platformMaintenance?.message || "NestPlan is being updated. Please pause changes for a few minutes.";
}

function handleMaintenanceSubmitGuard(event) {
  if (!isMaintenanceWriteBlocked()) {
    return;
  }

  const form = event.target;
  if (!form?.id || !MAINTENANCE_WRITE_FORM_IDS.has(form.id)) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  showMaintenanceBlockedMessage(form);
}

function handleMaintenanceClickGuard(event) {
  if (!isMaintenanceWriteBlocked()) {
    return;
  }

  const target = event.target.closest("button, [data-action]");
  if (!target) {
    return;
  }

  const action = target.dataset?.action || "";
  const blocksAction = action && MAINTENANCE_WRITE_ACTIONS.has(action);
  const blocksButton = target.id && MAINTENANCE_WRITE_BUTTON_IDS.has(target.id);
  if (!blocksAction && !blocksButton) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  showMaintenanceBlockedMessage(target);
}

function showMaintenanceBlockedMessage(source) {
  const message = `${getMaintenanceMessage()} Changes are temporarily paused.`;
  const target = source?.closest(".card")?.querySelector(".message")
    || els.transactionMessage
    || els.profileMessage
    || els.loginMessage;
  setMessage(target, message, "error");
}

function setMaintenanceWriteControlsDisabled(disabled) {
  const applyDisabledState = control => {
    if (!control || control.type === "hidden") {
      return;
    }

    if (disabled) {
      if (control.dataset.maintenanceDisabled !== "1") {
        control.dataset.maintenancePreviousDisabled = control.disabled ? "1" : "0";
      }
      control.dataset.maintenanceDisabled = "1";
      control.disabled = true;
      control.classList.toggle("is-disabled", true);
      return;
    }

    if (control.dataset.maintenanceDisabled === "1") {
      control.disabled = control.dataset.maintenancePreviousDisabled === "1";
      delete control.dataset.maintenanceDisabled;
      delete control.dataset.maintenancePreviousDisabled;
      control.classList.toggle("is-disabled", false);
    }
  };

  MAINTENANCE_WRITE_FORM_IDS.forEach(formId => {
    const form = document.getElementById(formId);
    if (!form) {
      return;
    }
    form.querySelectorAll("button, input, select, textarea").forEach(applyDisabledState);
  });

  MAINTENANCE_WRITE_BUTTON_IDS.forEach(buttonId => {
    applyDisabledState(document.getElementById(buttonId));
  });

  MAINTENANCE_WRITE_ACTIONS.forEach(action => {
    document.querySelectorAll(`[data-action="${action}"]`).forEach(applyDisabledState);
  });
}

function getUserErrorMessage(error, options = {}) {
  const code = error?.code || "";
  const message = error?.message || "Something went wrong.";
  if (code === "auth/email-already-in-use") {
    return "That email is already in use. Try logging in or resetting the password.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Email or password is incorrect.";
  }
  if (code === "permission-denied" || code === "firestore/permission-denied" || message.includes("Missing or insufficient permissions")) {
    return options.permissionMessage || "Firebase denied this action. Check the latest Firestore rules and try again.";
  }
  return message;
}

function getRegistrationErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || "Something went wrong.";
  if (code.includes("failed-precondition") || message.includes("disposable")) {
    return "This email cannot be used for registration unless a master admin adds an override.";
  }
  if (code.includes("not-found") || code.includes("permission-denied") || code.includes("invalid-argument")) {
    return "The registration details could not be accepted. Check the email and code, then try again.";
  }
  if (message.includes("expired")) {
    return "This user creation code has expired. Ask for a new one.";
  }
  if (message.includes("used") || message.includes("revoked")) {
    return "This user creation code is no longer available.";
  }
  return getUserErrorMessage(error);
}

function isEmailAlreadyInUseError(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  return code.includes("email-already-in-use") || message.includes("email-already-in-use");
}

function isMasterAdminRoute() {
  const params = new URLSearchParams(window.location.search);
  return params.get(ADMIN_ROUTE_PARAM) === "1" || window.location.hash === "#admin";
}

function exitMasterAdminRoute() {
  const url = new URL(window.location.href);
  url.searchParams.delete(ADMIN_ROUTE_PARAM);
  if (url.hash === "#admin") {
    url.hash = "";
  }
  window.history.replaceState({}, "", url.toString());
}

function setAuthBusy(isBusy) {
  els.authScreen.classList.toggle("busy", isBusy);
  [
    els.loginTab,
    els.signupTab,
    els.loginEmail,
    els.loginPassword,
    els.loginPasswordToggle,
    els.forgotPasswordBtn,
    els.loginForm.querySelector("button[type='submit']"),
    els.registrationCodeEmail,
    els.registrationCode,
    els.registrationCodeForm.querySelector("button[type='submit']"),
    els.signupCodeResetBtn,
    els.signupName,
    els.signupEmail,
    els.signupPassword,
    els.signupPasswordToggle,
    els.signupModeCreate,
    els.signupModeJoin,
    els.signupHouseholdName,
    els.signupInviteCode,
    els.signupForm.querySelector("button[type='submit']")
  ].forEach(element => {
    if (element) {
      element.disabled = isBusy;
    }
  });
}

function setButtonLoading(button, isLoading, loadingText = "Working...") {
  if (!button) {
    return;
  }
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

function formatMoneyInput(input) {
  const amount = parseMinorInput(input.value);
  input.value = amount ? formatNumber(amount) : "";
}

function setMoneyInputValue(input, value) {
  input.value = Number(value || 0) ? formatNumber(Number(value || 0)) : "";
}

function parseMinorInput(value) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits ? Number(digits) : 0;
}

function togglePasswordVisibility(input, button) {
  const nextType = input.type === "password" ? "text" : "password";
  input.type = nextType;
  button.textContent = nextType === "password" ? "Show" : "Hide";
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inviteCode = generateInviteCode();
    const codeSnap = await getDoc(doc(db, "inviteCodes", inviteCode));
    if (!codeSnap.exists()) {
      return inviteCode;
    }
  }
  throw new Error("Could not generate a unique invite code. Please try again.");
}

async function generateUniqueRegistrationCode() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const registrationCode = generateRegistrationCode();
    const codeSnap = await getDoc(doc(db, "registrationCodes", registrationCode));
    if (!codeSnap.exists()) {
      return registrationCode;
    }
  }
  throw new Error("Could not generate a unique user creation code. Please try again.");
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

function generateRegistrationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(REGISTRATION_CODE_LENGTH));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

function assertUsableRegistrationCode(registrationCode, emailNormalized) {
  if (registrationCode.status !== "unused") {
    throw new Error("This user creation code is no longer available.");
  }
  if (normalizeEmail(registrationCode.emailNormalized) !== normalizeEmail(emailNormalized)) {
    throw new Error("This user creation code is assigned to a different email.");
  }
  if (isExpired(registrationCode.expiresAt)) {
    throw new Error("This user creation code has expired.");
  }
}

async function hasEmailOverride(email) {
  const snap = await getDoc(doc(db, "emailPolicyOverrides", normalizeEmail(email)));
  return snap.exists() && snap.data().status === "active";
}

async function isEmailDomainBlocked(domain) {
  const snap = await getDoc(doc(db, "emailPolicyBlockedDomains", normalizeDomain(domain)));
  return snap.exists() && snap.data().status === "active";
}

function clampRegistrationExpiryDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 14;
  }
  return Math.max(1, Math.min(60, Math.floor(parsed)));
}

function serializeRegistrationCode(id, data = {}) {
  return {
    id,
    code: data.code || id,
    emailNormalized: data.emailNormalized || "",
    status: data.status || "unused",
    note: data.note || "",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt),
    expiresAtFormatted: formatDateTime(data.expiresAt),
    consumedAtFormatted: formatDateTime(data.consumedAt),
    revokedAtFormatted: formatDateTime(data.revokedAt)
  };
}

function serializeEmailOverride(id, data = {}) {
  return {
    id,
    emailNormalized: data.emailNormalized || id,
    status: data.status || "active",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt)
  };
}

function serializeBlockedDomain(id, data = {}) {
  return {
    id,
    domain: data.domain || id,
    status: data.status || "active",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt)
  };
}

function serializeGreetingQuote(id, data = {}) {
  return {
    id,
    text: data.text || "",
    status: data.status || "active",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt)
  };
}

function serializeDefaultCategory(id, data = {}) {
  return {
    id,
    name: data.name || "",
    direction: data.direction || "outcome",
    description: data.description || "",
    status: data.status || "active",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt)
  };
}

function resetMasterDefaultCategoryForm() {
  els.masterDefaultCategoryForm.reset();
  els.masterDefaultCategoryEditId.value = "";
  els.masterDefaultCategoryDirection.value = "outcome";
  els.masterDefaultCategorySubmitBtn.textContent = "Save category";
  els.masterDefaultCategoryCancelBtn.classList.add("hidden");
}

function resetMasterGreetingForm() {
  els.masterGreetingForm.reset();
  els.masterGreetingEditId.value = "";
  els.masterGreetingSubmitBtn.textContent = "Add sentence";
  els.masterGreetingCancelBtn.classList.add("hidden");
}

function ensureHouseholdCapacity(existingIds = getAccessibleHouseholdIds()) {
  if (sanitizeStringArray(existingIds).length >= MAX_HOUSEHOLDS) {
    throw new Error(`You can only belong to up to ${MAX_HOUSEHOLDS} households.`);
  }
}

function mergeHouseholdIds(existingIds, nextId) {
  return Array.from(new Set([...sanitizeStringArray(existingIds), nextId]));
}

function sanitizeHouseholdIds(householdIds, legacyDefaultHouseholdId) {
  const ids = sanitizeStringArray(householdIds);
  if (legacyDefaultHouseholdId && !ids.includes(legacyDefaultHouseholdId)) {
    ids.push(legacyDefaultHouseholdId);
  }
  return ids.slice(0, MAX_HOUSEHOLDS);
}

function normalizeUserProfile(id, data = {}) {
  const householdIds = sanitizeHouseholdIds(data.householdIds, data.defaultHouseholdId);
  return {
    id,
    ...data,
    householdIds,
    activeHouseholdId: resolveActiveHouseholdId(householdIds, data.activeHouseholdId || data.defaultHouseholdId || null)
  };
}

function resolveActiveHouseholdId(householdIds, preferredId) {
  if (preferredId && householdIds.includes(preferredId)) {
    return preferredId;
  }
  return householdIds[0] || null;
}

function getOnboardingStatus() {
  const categories = getActiveCategories();
  return {
    hasAccount: getActiveAccounts().length > 0,
    hasIncomeCategory: categories.some(category => ["income", "both"].includes(category.direction)),
    hasOutcomeCategory: categories.some(category => ["outcome", "both"].includes(category.direction))
  };
}

function isOnboardingRequired() {
  const status = getOnboardingStatus();
  return !(status.hasAccount && status.hasIncomeCategory && status.hasOutcomeCategory);
}

function cleanInviteCode(code = "") {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function reverseTimestampSortValue(timestamp) {
  return -getTimestampSortValue(timestamp);
}

function toSortedDocs(docs, iteratee) {
  const items = docs.map(docOrSnapshot => {
    if ("data" in docOrSnapshot && "id" in docOrSnapshot && "ref" in docOrSnapshot) {
      return { id: docOrSnapshot.id, ref: docOrSnapshot.ref, ...docOrSnapshot.data() };
    }
    return { id: docOrSnapshot.id, ref: docOrSnapshot.ref, ...docOrSnapshot };
  });

  return items.sort((a, b) => {
    const left = iteratee(a);
    const right = iteratee(b);
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
}

function deriveDisplayNameFromEmail(email = "") {
  const local = email.split("@")[0] || "NestPlan";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

function getDisplayName() {
  return state.userProfile?.displayName || state.authUser?.displayName || deriveDisplayNameFromEmail(state.authUser?.email || "");
}

function getInitials(name = "") {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "NP";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getMemberName(userId) {
  if (!userId) {
    return "Household";
  }
  const member = state.members.find(item => item.id === userId || item.userId === userId);
  return member?.displayName || member?.emailNormalized || "Household member";
}

function getAccountOptionLabel(account) {
  if (!account) {
    return "Unknown account";
  }
  const ownerName = getMemberName(account.primaryOwnerUserId);
  return `${account.name} - ${ownerName}`;
}

function pickGreeting() {
  const dynamicGreetings = state.greetingQuotes
    .filter(item => item.status === "active" && cleanText(item.text))
    .map(item => cleanText(item.text));
  const source = dynamicGreetings.length
    ? dynamicGreetings
    : state.greetingLibraryLoaded
      ? ["Welcome to NestPlan."]
      : GREETINGS;
  const previousGreeting = getLastGreeting();
  const choices = source.length > 1
    ? source.filter(text => text !== previousGreeting)
    : source;
  const index = Math.floor(Math.random() * choices.length);
  const nextGreeting = choices[index] || source[0] || "Welcome to NestPlan.";
  setLastGreeting(nextGreeting);
  return nextGreeting;
}

function getLastGreeting() {
  try {
    return localStorage.getItem(LAST_GREETING_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function setLastGreeting(greeting) {
  try {
    localStorage.setItem(LAST_GREETING_STORAGE_KEY, greeting);
  } catch (error) {
    // Rotation still works within the current load if storage is unavailable.
  }
}

function timestampFromDateInput(value) {
  return Timestamp.fromDate(dateFromDateInput(value));
}

function isCategoryAllowedForKind(category, kind) {
  if (!category) {
    return false;
  }
  if (kind === "transfer") {
    return false;
  }
  return category.direction === "both" || category.direction === kind;
}
