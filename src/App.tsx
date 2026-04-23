import { useCallback, FormEvent, useEffect, useMemo, useState } from "react";

type ItemType = "bill" | "subscription";
type StatusFilter = "all" | "dueSoon" | "paid" | "unpaid";
type Currency = "MAD" | "EUR" | "USD" | "GBP";
type FxState = "idle" | "live" | "fallback";

type EntitlementState = {
  loading: boolean;
  premiumActive: boolean;
  productId: string | null;
  expiresAt: string | null;
  error: string;
};

type AuthMode = "login" | "signup";
type ForgotPasswordStep = "request" | "reset";

type AuthUser = {
  appUserId: string;
  fullName: string;
  phoneNumber: string;
  username: string;
  email: string;
  emailVerifiedAt?: string | null;
  tokenVersion?: number;
};

type NotificationEntry = {
  id: string;
  title: string;
  detail: string;
  type: "reminder" | "security" | "insight" | "system";
  createdAt: string;
};

type PhoneCountryOption = {
  code: string;
  name: string;
  dial: string;
  region: PhoneRegion;
};

type PhoneRegion = "Africa" | "Europe" | "Americas" | "Middle East" | "Asia";

type PaymentRecord = {
  id: string;
  itemId: string;
  itemName: string;
  paidAt: string;
  amount: number;
};

type Account = {
  id: string;
  name: string;
  type: "cash" | "bank" | "card" | "mobile" | "other";
  balance: number;
  color: string;
  createdAt: string;
};

type LateFeeRule = {
  id: string;
  name: string;
  feePerDay: number;
  graceDays: number;
};

type CategoryLimit = {
  category: string;
  limit: number;
};

type SavingsGoal = {
  id: string;
  label: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string;
  createdAt: string;
};

type IncomeEntry = {
  id: string;
  label: string;
  amount: number;
  category: string;
  createdAt: string;
};

type BillItem = {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  category: string;
  reminderDays: number;
  type: ItemType;
  repeat: "monthly";
  lastPaidAt?: string;
  createdAt: string;
};

type Template = Omit<BillItem, "id" | "createdAt" | "lastPaidAt">;

const STORAGE_KEYS = {
  authToken: "bill-tracker-auth-token",
  authUser: "bill-tracker-auth-user",
  items: "bill-tracker-items",
  templates: "bill-tracker-templates",
  currency: "bill-tracker-currency",
  budget: "bill-tracker-budget",
  exchangeRates: "bill-tracker-exchange-rates",
  exchangeRatesUpdatedAt: "bill-tracker-exchange-rates-updated-at",
  pin: "bill-tracker-pin",
  budgetAlertLevel: "bill-tracker-budget-alert-level",
  sentReminderMap: "bill-tracker-sent-reminder-map",
  sentDueDaySoundMap: "bill-tracker-sent-due-day-sound-map",
  dueDaySoundEnabled: "bill-tracker-due-day-sound-enabled",
  notificationCenter: "bill-tracker-notification-center",
  incomes: "bill-tracker-incomes",
  savingsGoals: "bill-tracker-savings-goals",
  categoryLimits: "bill-tracker-category-limits",
  lateFeeRules: "bill-tracker-late-fee-rules",
  theme: "bill-tracker-theme",
  accounts: "bill-tracker-accounts",
  paymentHistory: "bill-tracker-payment-history",
};

const FREE_ITEM_LIMIT = 8;
const FREE_CATEGORY_LIMIT = 3;
const BILLING_BACKEND_URL = (import.meta.env.VITE_BILLING_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const AUTH_API_BASE_URL = (import.meta.env.VITE_AUTH_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const PLAY_SUBSCRIPTION_MANAGE_URL = "https://play.google.com/store/account/subscriptions";
const RECOMMENDED_PRICES_MAD = {
  monthly: 19,
  yearly: 149,
};

const ANDROID_PACKAGE_NAME = "com.app4clients.allinonebilltracker";

function openPlaySubscription(productId: "premium_monthly" | "premium_yearly") {
  const url = `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(ANDROID_PACKAGE_NAME)}`;
  window.open(url, "_blank");
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DEFAULT_BLOCKED_USERNAME_WORDS = ["sex", "porn", "xxx", "nude", "adult", "escort", "camgirl", "onlyfans"];

const PHONE_REGION_ORDER: PhoneRegion[] = ["Africa", "Europe", "Americas", "Middle East", "Asia"];

const PHONE_COUNTRIES: PhoneCountryOption[] = [
  { code: "MA", name: "Morocco", dial: "+212", region: "Africa" },
  { code: "DZ", name: "Algeria", dial: "+213", region: "Africa" },
  { code: "TN", name: "Tunisia", dial: "+216", region: "Africa" },
  { code: "EG", name: "Egypt", dial: "+20", region: "Africa" },
  { code: "FR", name: "France", dial: "+33", region: "Europe" },
  { code: "GB", name: "United Kingdom", dial: "+44", region: "Europe" },
  { code: "ES", name: "Spain", dial: "+34", region: "Europe" },
  { code: "DE", name: "Germany", dial: "+49", region: "Europe" },
  { code: "IT", name: "Italy", dial: "+39", region: "Europe" },
  { code: "BE", name: "Belgium", dial: "+32", region: "Europe" },
  { code: "NL", name: "Netherlands", dial: "+31", region: "Europe" },
  { code: "US", name: "United States", dial: "+1", region: "Americas" },
  { code: "CA", name: "Canada", dial: "+1", region: "Americas" },
  { code: "BR", name: "Brazil", dial: "+55", region: "Americas" },
  { code: "MX", name: "Mexico", dial: "+52", region: "Americas" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", region: "Middle East" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", region: "Middle East" },
  { code: "TR", name: "Turkey", dial: "+90", region: "Middle East" },
  { code: "IN", name: "India", dial: "+91", region: "Asia" },
  { code: "JP", name: "Japan", dial: "+81", region: "Asia" },
];

const PHONE_COUNTRIES_BY_REGION = PHONE_REGION_ORDER.map((region) => ({
  region,
  countries: PHONE_COUNTRIES.filter((country) => country.region === region).sort((a, b) => a.name.localeCompare(b.name)),
})).filter((group) => group.countries.length > 0);

const DEFAULT_TEMPLATES: Template[] = [
  { name: "Rent", amount: 3000, dueDay: 1, category: "Housing", reminderDays: 3, type: "bill", repeat: "monthly" },
  { name: "Internet", amount: 300, dueDay: 10, category: "Utilities", reminderDays: 2, type: "bill", repeat: "monthly" },
  {
    name: "Netflix",
    amount: 99,
    dueDay: 12,
    category: "Entertainment",
    reminderDays: 2,
    type: "subscription",
    repeat: "monthly",
  },
  { name: "Gym", amount: 250, dueDay: 5, category: "Health", reminderDays: 2, type: "subscription", repeat: "monthly" },
];

const seedItems: BillItem[] = [
  {
    id: crypto.randomUUID(),
    name: "Electricity",
    amount: 420,
    dueDay: 8,
    category: "Utilities",
    reminderDays: 2,
    type: "bill",
    repeat: "monthly",
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: "Netflix",
    amount: 99,
    dueDay: 12,
    category: "Entertainment",
    reminderDays: 2,
    type: "subscription",
    repeat: "monthly",
    createdAt: new Date().toISOString(),
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CURRENCY_TO_MAD: Record<Currency, number> = {
  MAD: 1,
  EUR: 10.8,
  USD: 10,
  GBP: 12.6,
};

function toMAD(amount: number, currency: Currency, rates: Record<Currency, number>) {
  return amount * (rates[currency] || 1);
}

function fromMAD(amountMAD: number, currency: Currency, rates: Record<Currency, number>) {
  const divisor = rates[currency] || 1;
  return amountMAD / divisor;
}

function toInternationalPhone(countryDial: string, localNumber: string) {
  const onlyDigits = localNumber.replace(/\D/g, "").replace(/^0+/, "");
  return `${countryDial}${onlyDigits}`;
}

function countryFlag(countryCode: string) {
  return countryCode
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function normalizeForModeration(value: string) {
  return value
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, "");
}

function containsBlockedUsernameWord(username: string, blockedWords: string[], allowedUsernames: string[]) {
  const exactUsername = username.trim().toLowerCase();
  if (allowedUsernames.includes(exactUsername)) {
    return false;
  }
  const normalized = normalizeForModeration(username);
  return blockedWords.some((word) => normalized.includes(word));
}

function readLS<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getNextDueDate(dueDay: number, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const safeDay = Math.min(dueDay, new Date(year, month + 1, 0).getDate());
  let due = new Date(year, month, safeDay, 9, 0, 0, 0);
  if (due < now) {
    const nextSafeDay = Math.min(dueDay, new Date(year, month + 2, 0).getDate());
    due = new Date(year, month + 1, nextSafeDay, 9, 0, 0, 0);
  }
  return due;
}

function getDaysUntil(date: Date, now = new Date()) {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

function isPaidThisMonth(item: BillItem, now = new Date()) {
  if (!item.lastPaidAt) {
    return false;
  }
  const paid = new Date(item.lastPaidAt);
  return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear();
}

function calculateFinancialHealth(params: {
  savingsRate: number; budgetProgress: number; overdueCount: number;
  totalBills: number; paidBills: number; hasIncome: boolean;
  hasBudget: boolean; hasSavingsGoal: boolean; categoryLimitsCount: number;
  overLimitCount: number; lateFees: number; totalAccountBalance: number; monthlyTotal: number;
}): { score: number; level: string; color: string; tips: string[] } {
  let score = 0;
  const tips: string[] = [];
  if (params.savingsRate >= 30) score += 25;
  else if (params.savingsRate >= 20) score += 20;
  else if (params.savingsRate >= 10) score += 12;
  else if (params.savingsRate > 0) score += 5;
  else tips.push("Add income to calculate savings rate");
  if (params.budgetProgress <= 50) score += 20;
  else if (params.budgetProgress <= 75) score += 15;
  else if (params.budgetProgress <= 90) score += 10;
  else if (params.budgetProgress <= 100) score += 5;
  else { tips.push("Budget exceeded — reduce spending"); }
  if (params.totalBills > 0) {
    score += Math.round((params.paidBills / params.totalBills) * 20);
    if (params.overdueCount > 0) tips.push(`${params.overdueCount} overdue bill(s) — pay now!`);
  } else { score += 10; }
  if (params.hasIncome) score += 4; else tips.push("Add your monthly income");
  if (params.hasBudget) score += 4; else tips.push("Set a monthly budget");
  if (params.hasSavingsGoal) score += 4; else tips.push("Create a savings goal");
  if (params.categoryLimitsCount > 0) score += 3; else tips.push("Set category spending limits");
  if (params.lateFees === 0) score += 10;
  else { tips.push("You have late fees — pay overdue bills!"); }
  if (params.monthlyTotal > 0 && params.totalAccountBalance >= params.monthlyTotal * 2) score += 10;
  else if (params.monthlyTotal > 0 && params.totalAccountBalance >= params.monthlyTotal) score += 6;
  else if (params.totalAccountBalance > 0) score += 3;
  else tips.push("Add your accounts to track balances");
  if (params.overLimitCount > 0) score = Math.max(0, score - params.overLimitCount * 3);
  score = Math.min(100, Math.max(0, score));
  let level: string; let color: string;
  if (score >= 80) { level = "Excellent"; color = "#10b981"; }
  else if (score >= 60) { level = "Good"; color = "#06b6d4"; }
  else if (score >= 40) { level = "Fair"; color = "#f59e0b"; }
  else if (score >= 20) { level = "Needs Work"; color = "#f97316"; }
  else { level = "Critical"; color = "#ef4444"; }
  return { score, level, color, tips };
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "bill-tracker-salt-2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function playPremiumDueSound() {
  if (!("AudioContext" in window)) {
    return;
  }

  const audio = new AudioContext();
  const now = audio.currentTime;
  const notes = [740, 932, 1175];

  notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + index * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.15 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.15 + 0.22);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now + index * 0.15);
    oscillator.stop(now + index * 0.15 + 0.22);
  });

  window.setTimeout(() => {
    void audio.close();
  }, 700);
}

function EyeToggleIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3a10.8 10.8 0 0 1 1.4-.1c6.5 0 10 5.8 10 5.8a18.8 18.8 0 0 1-4 4.5" />
      <path d="M6.8 6.9A18 18 0 0 0 2 12s3.5 5.8 10 5.8a11 11 0 0 0 5-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export default function App() {
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationInfo, setVerificationInfo] = useState("");
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<ForgotPasswordStep>("request");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordSubmitting, setForgotPasswordSubmitting] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordToken, setForgotPasswordToken] = useState("");
  const [forgotPasswordNewPassword, setForgotPasswordNewPassword] = useState("");
  const [showForgotPasswordToken, setShowForgotPasswordToken] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showForgotPasswordNewPassword, setShowForgotPasswordNewPassword] = useState(false);
  const [showVerificationCode, setShowVerificationCode] = useState(false);
  const [showPinInputValue, setShowPinInputValue] = useState(false);
  const [forgotPasswordInfo, setForgotPasswordInfo] = useState("");
  const [forgotPasswordResendAvailableAt, setForgotPasswordResendAvailableAt] = useState(0);
  const [forgotPasswordNow, setForgotPasswordNow] = useState(() => Date.now());
  const [forgotPasswordExpiresInMinutes, setForgotPasswordExpiresInMinutes] = useState<number | null>(null);
  const [blockedUsernameWords, setBlockedUsernameWords] = useState<string[]>(DEFAULT_BLOCKED_USERNAME_WORDS);
  const [allowedUsernames, setAllowedUsernames] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authForm, setAuthForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phoneNumber: "+212",
    password: "",
  });
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState("MA");
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("");
  const [items, setItems] = useState<BillItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [currency, setCurrency] = useState<Currency>("MAD");
  const [currencyToMAD, setCurrencyToMAD] = useState<Record<Currency, number>>(FALLBACK_CURRENCY_TO_MAD);
  const [fxUpdatedAt, setFxUpdatedAt] = useState("");
  const [fxState, setFxState] = useState<FxState>("idle");
  const [budget, setBudget] = useState(5000);
  const [search, setSearch] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [selectedCalDay, setSelectedCalDay] = useState<number | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [pin, setPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [locked, setLocked] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(false);

  useEffect(() => {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      cap.Plugins?.LocalNotifications?.requestPermissions?.().then((result: any) => {
        setNotifEnabled(result.display === "granted");
      }).catch(() => {});
      return;
    }
    if ("Notification" in window && Notification.permission === "granted") {
      setNotifEnabled(true);
    }
  }, []);

  const [dueDaySoundEnabled, setDueDaySoundEnabled] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return readLS<"dark" | "light">("bill-tracker-theme", "dark");
  });

  type TabName = "dashboard" | "bills" | "analytics" | "goals" | "settings";
const [activeTab, setActiveTab] = useState<TabName>("dashboard");
const [paymentHistoryItem, setPaymentHistoryItem] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
const [accountForm, setAccountForm] = useState({ name: "", type: "bank" as Account["type"], balance: 0, color: "#06b6d4" });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<{ amount: string; dueDay: string }>({ amount: "", dueDay: "" });
  const [showPremiumPanel, setShowPremiumPanel] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [deleteAccountConfirmInput, setDeleteAccountConfirmInput] = useState("");
  const [notificationCenter, setNotificationCenter] = useState<NotificationEntry[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [incomeForm, setIncomeForm] = useState({ label: "", amount: 0, category: "Salary" });
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [savingsForm, setSavingsForm] = useState({ label: "", targetAmount: 0, savedAmount: 0, deadline: "" });
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimit[]>([]);
  const [newLimitCategory, setNewLimitCategory] = useState("");
  const [newLimitAmount, setNewLimitAmount] = useState(0);
  const [lateFeeRules, setLateFeeRules] = useState<LateFeeRule[]>([]);
  const [lateFeeForm, setLateFeeForm] = useState({ name: "", feePerDay: 0, graceDays: 0 });
  const [entitlement, setEntitlement] = useState<EntitlementState>({
    loading: true,
    premiumActive: false,
    productId: null,
    expiresAt: null,
    error: "",
  });

  const appUserId = currentUser?.appUserId ?? "";
  const userScopedKey = (key: string) => `${key}-${appUserId}`;

useEffect(() => {
    if (!appUserId || !notifEnabled) return;

    const cap = (window as any).Capacitor;
    const isCapacitor = cap?.isNativePlatform?.();
    const LN = cap?.Plugins?.LocalNotifications;

    if (!isCapacitor || !LN) return;

    const scheduleReminders = async () => {
      try {
        const pending = await LN.getPending();
        if (pending.notifications.length > 0) {
          await LN.cancel(pending);
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const notifications: any[] = [];

        items.filter((item) => !isPaidThisMonth(item)).forEach((item) => {
          const safeDay = Math.min(item.dueDay, new Date(year, month + 1, 0).getDate());
          let dueDate = new Date(year, month, safeDay, 9, 0, 0);
          if (dueDate < now) {
            const nextSafeDay = Math.min(item.dueDay, new Date(year, month + 2, 0).getDate());
            dueDate = new Date(year, month + 1, nextSafeDay, 9, 0, 0);
          }

          const hash = item.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const id = Math.abs((hash % 90000) + 10000);

          const reminderDate = new Date(dueDate.getTime() - item.reminderDays * 24 * 60 * 60 * 1000);

          if (reminderDate > now) {
            notifications.push({
              id: id,
              title: "Bill Reminder",
              body: `${item.name} is due in ${item.reminderDays} day(s)`,
              schedule: { at: reminderDate },
              smallIcon: "ic_stat_bill_tracker",
            });
          }

          if (dueDate > now) {
            notifications.push({
              id: id + 1,
              title: "Payment Due Today!",
              body: `${item.name} is due today. Don't forget!`,
              schedule: { at: dueDate },
              smallIcon: "ic_stat_bill_tracker",
            });
          }
        });

        if (notifications.length > 0) {
          await LN.schedule({ notifications });
        }
      } catch (error) {
        console.error("Failed to schedule notifications:", error);
      }
    };

    void scheduleReminders();
  }, [items, appUserId, notifEnabled]);


  const [form, setForm] = useState<Template>({
    name: "",
    amount: 0,
    dueDay: 0,
    category: "",
    reminderDays: 3,
    type: "bill",
    repeat: "monthly",
  });


// ✅ STEP 1: Define function FIRST
const refreshExchangeRates = useCallback(async () => {
    setFxState("idle");
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/MAD");
      if (!response.ok) {
        throw new Error("Failed to fetch rates");
      }
      const data = (await response.json()) as {
        rates?: Partial<Record<Currency, number>>;
      };
      const eurRate = data.rates?.EUR;
      const usdRate = data.rates?.USD;
      const gbpRate = data.rates?.GBP;
      if (!eurRate || !usdRate || !gbpRate || eurRate <= 0 || usdRate <= 0 || gbpRate <= 0) {
        throw new Error("Invalid rate payload");
      }
      setCurrencyToMAD({ MAD: 1, EUR: 1 / eurRate, USD: 1 / usdRate, GBP: 1 / gbpRate });
      setFxUpdatedAt(new Date().toISOString());
      setFxState("live");
      setToastMessage("Exchange rates updated.");
    } catch {
      setFxState("fallback");
      setToastMessage("Live rates unavailable. Using fallback rates.");
    }
  }, []);

// ✅ STEP 2: Then the useEffect that uses it
  useEffect(() => {
    void refreshExchangeRates();
    const interval = window.setInterval(() => {
      void refreshExchangeRates();
    }, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshExchangeRates]);

// ✅ STEP 3: Then resetForm
  const resetForm = () => {
    setForm({
      name: "",
      amount: 0,
      dueDay: 0,
      category: "",
      reminderDays: 3,
      type: "bill",
      repeat: "monthly",
    });
    setEditingItemId(null);
  };

  useEffect(() => {
    const bootstrapAuth = async () => {
      const savedToken = localStorage.getItem(STORAGE_KEYS.authToken) ?? "";
      const savedUser = readLS<AuthUser | null>(STORAGE_KEYS.authUser, null);
      if (!savedToken || !savedUser) {
        setAuthLoading(false);
        return;
      }

      if (!AUTH_API_BASE_URL) {
        setAuthError("Set VITE_AUTH_API_BASE_URL to enable login and signup.");
        setAuthLoading(false);
        return;
      }

      try {
        const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });
        if (!response.ok) {
          throw new Error("Session expired");
        }

        const payload = (await response.json()) as {
          ok?: boolean;
          user?: AuthUser;
        };

        if (!payload.ok || !payload.user) {
          throw new Error("Session invalid");
        }

        setCurrentUser(payload.user);
      } catch {
        localStorage.removeItem(STORAGE_KEYS.authToken);
        localStorage.removeItem(STORAGE_KEYS.authUser);
      } finally {
        setAuthLoading(false);
      }
    };

    void bootstrapAuth();
  }, []);

  useEffect(() => {
    const loadUsernamePolicy = async () => {
      if (!AUTH_API_BASE_URL) {
        return;
      }

      try {
        const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/username-policy`);
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { blockedWords?: string[]; allowedUsernames?: string[] };
        if (Array.isArray(payload.blockedWords) && payload.blockedWords.length > 0) {
          setBlockedUsernameWords(payload.blockedWords.map((word) => word.trim().toLowerCase()).filter(Boolean));
        }
        if (Array.isArray(payload.allowedUsernames)) {
          setAllowedUsernames(payload.allowedUsernames.map((name) => name.trim().toLowerCase()).filter(Boolean));
        }
      } catch {
        // Keep fallback words when policy endpoint is unavailable.
      }
    };

    void loadUsernamePolicy();
  }, []);

  useEffect(() => {
    if (authMode === "signup") {
      setForgotPasswordOpen(false);
      setForgotPasswordInfo("");
      setForgotPasswordStep("request");
      setForgotPasswordResendAvailableAt(0);
      setForgotPasswordExpiresInMinutes(null);
    }
  }, [authMode]);

  useEffect(() => {
    if (!forgotPasswordOpen || forgotPasswordResendAvailableAt <= Date.now()) {
      return;
    }
    const timer = window.setInterval(() => {
      setForgotPasswordNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotPasswordOpen, forgotPasswordResendAvailableAt]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    setItems(readLS<BillItem[]>(userScopedKey(STORAGE_KEYS.items), seedItems));
    setTemplates(readLS<Template[]>(userScopedKey(STORAGE_KEYS.templates), DEFAULT_TEMPLATES));
    setCurrency(readLS<Currency>(userScopedKey(STORAGE_KEYS.currency), "MAD"));
    setCurrencyToMAD(readLS<Record<Currency, number>>(userScopedKey(STORAGE_KEYS.exchangeRates), FALLBACK_CURRENCY_TO_MAD));
    setFxUpdatedAt(readLS<string>(userScopedKey(STORAGE_KEYS.exchangeRatesUpdatedAt), ""));
    setBudget(readLS<number>(userScopedKey(STORAGE_KEYS.budget), 5000));
    setDueDaySoundEnabled(readLS<boolean>(userScopedKey(STORAGE_KEYS.dueDaySoundEnabled), true));
    setNotificationCenter(readLS<NotificationEntry[]>(userScopedKey(STORAGE_KEYS.notificationCenter), []));
    setIncomes(readLS<IncomeEntry[]>(userScopedKey(STORAGE_KEYS.incomes), []));
    setSavingsGoals(readLS<SavingsGoal[]>(userScopedKey(STORAGE_KEYS.savingsGoals), []));
    setCategoryLimits(readLS<CategoryLimit[]>(userScopedKey(STORAGE_KEYS.categoryLimits), []));
    setLateFeeRules(readLS<LateFeeRule[]>(userScopedKey(STORAGE_KEYS.lateFeeRules), []));
    setTheme(readLS<"dark" | "light">(userScopedKey(STORAGE_KEYS.theme), "dark"));
    setAccounts(readLS<Account[]>(userScopedKey(STORAGE_KEYS.accounts), []));
    setPaymentHistory(readLS<PaymentRecord[]>(userScopedKey(STORAGE_KEYS.paymentHistory), []));
    const savedPin = localStorage.getItem(userScopedKey(STORAGE_KEYS.pin)) ?? "";
    setPin(savedPin);
    setLocked(Boolean(savedPin));
  }, [appUserId]);


const refreshEntitlement = useCallback(async () => {
  if (!appUserId) {
    return;
  }

  if (!BILLING_BACKEND_URL) {
    setEntitlement({
      loading: false,
      premiumActive: false,
      productId: null,
      expiresAt: null,
      error: "Set VITE_BILLING_API_BASE_URL to enable server entitlement checks.",
    });
    return;
  }

  try {
    setEntitlement((prev) => ({ ...prev, loading: true, error: "" }));
    const response = await fetch(
      `${BILLING_BACKEND_URL}/api/billing/entitlement/${encodeURIComponent(appUserId)}`
    );
    if (!response.ok) {
      throw new Error("Entitlement request failed");
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      premiumActive?: boolean;
      productId?: string | null;
      expiresAt?: string | null;
    };

    setEntitlement({
      loading: false,
      premiumActive: Boolean(payload.ok && payload.premiumActive),
      productId: payload.productId ?? null,
      expiresAt: payload.expiresAt ?? null,
      error: "",
    });
  } catch {
    setEntitlement({
      loading: false,
      premiumActive: false,
      productId: null,
      expiresAt: null,
      error: "Unable to refresh premium state from server.",
    });
  }
}, [appUserId]);

useEffect(() => {
  void refreshEntitlement();
}, [refreshEntitlement]);


useEffect(() => {
  const refreshAfterReturn = () => {
    if (document.visibilityState === "visible") {
      setTimeout(() => {
        void refreshEntitlement();
      }, 1200);
    }
  };

  document.addEventListener("visibilitychange", refreshAfterReturn);
  window.addEventListener("focus", refreshAfterReturn);

  return () => {
    document.removeEventListener("visibilitychange", refreshAfterReturn);
    window.removeEventListener("focus", refreshAfterReturn);
  };
}, [refreshEntitlement]);

 
useEffect(() => {
    if (!appUserId) return;
  
    localStorage.setItem(userScopedKey(STORAGE_KEYS.items), JSON.stringify(items));

  
    localStorage.setItem(userScopedKey(STORAGE_KEYS.templates), JSON.stringify(templates));

  
    localStorage.setItem(userScopedKey(STORAGE_KEYS.currency), JSON.stringify(currency));

  
    localStorage.setItem(userScopedKey(STORAGE_KEYS.budget), JSON.stringify(budget));

  
    localStorage.setItem(userScopedKey(STORAGE_KEYS.dueDaySoundEnabled), JSON.stringify(dueDaySoundEnabled));

  
   localStorage.setItem(userScopedKey(STORAGE_KEYS.notificationCenter), JSON.stringify(notificationCenter.slice(0, 60)));

   localStorage.setItem(userScopedKey(STORAGE_KEYS.incomes), JSON.stringify(incomes));

   localStorage.setItem(userScopedKey(STORAGE_KEYS.savingsGoals), JSON.stringify(savingsGoals));

   localStorage.setItem(userScopedKey(STORAGE_KEYS.categoryLimits), JSON.stringify(categoryLimits));

   localStorage.setItem(userScopedKey(STORAGE_KEYS.lateFeeRules), JSON.stringify(lateFeeRules));

   localStorage.setItem(userScopedKey(STORAGE_KEYS.theme), JSON.stringify(theme));

   localStorage.setItem(userScopedKey(STORAGE_KEYS.accounts), JSON.stringify(accounts));

   localStorage.setItem(userScopedKey(STORAGE_KEYS.paymentHistory), JSON.stringify(paymentHistory.slice(0, 200)));

 }, [items, templates, currency, budget, dueDaySoundEnabled, notificationCenter, appUserId, incomes, savingsGoals, categoryLimits, lateFeeRules, theme, accounts, paymentHistory]);
  
  
  useEffect(() => {
    if (!appUserId) {
      return;
    }
    localStorage.setItem(userScopedKey(STORAGE_KEYS.exchangeRates), JSON.stringify(currencyToMAD));
  }, [currencyToMAD, appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    if (!fxUpdatedAt) {
      return;
    }
    localStorage.setItem(userScopedKey(STORAGE_KEYS.exchangeRatesUpdatedAt), JSON.stringify(fxUpdatedAt));
  }, [fxUpdatedAt, appUserId]);

  useEffect(() => {
    void refreshExchangeRates();
    const interval = window.setInterval(() => {
      void refreshExchangeRates();
    }, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshExchangeRates]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setToastMessage(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
    }
  }, [theme]);

  useEffect(() => {
    let startY = 0;
    let currentY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      currentY = e.touches[0].clientY;
    };

    const onTouchEnd = () => {
      if (window.scrollY === 0 && currentY - startY > 120) {
        void refreshExchangeRates();
        setToastMessage("Refreshed.");
      }
    };

    document.addEventListener("touchstart", onTouchStart);
    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshExchangeRates]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowWelcomeSplash(false), 1800);
    return () => window.clearTimeout(timeout);
  }, []);

  const formatMoney = useCallback((amountMAD: number) =>
    new Intl.NumberFormat(currency === "MAD" ? "fr-MA" : "en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(fromMAD(amountMAD, currency, currencyToMAD)),
  [currency, currencyToMAD]);

  const pushNotificationCenter = (entry: Omit<NotificationEntry, "id" | "createdAt">) => {
    setNotificationCenter((prev) => [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...entry }, ...prev].slice(0, 60));
  };

  useEffect(() => {
    const apiBase = AUTH_API_BASE_URL;
    if (!apiBase) {
      return;
    }

    const postClientError = async (message: string, stack?: string, metadata?: Record<string, unknown>) => {
      try {
        const token = localStorage.getItem(STORAGE_KEYS.authToken) ?? "";
        await fetch(`${apiBase}/api/client-errors`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            platform: "web",
            message,
            stack,
            metadata,
          }),
        });
      } catch {
        // Avoid recursive error loops from telemetry.
      }
    };

    const handleError = (event: ErrorEvent) => {
      void postClientError(event.message || "Unhandled error", event.error?.stack, {
        fileName: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      void postClientError("Unhandled promise rejection", undefined, {
        reason: String(event.reason ?? "Unknown reason"),
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const withDue = useMemo(() => {
    return items
      .map((item) => {
        const nextDueDate = getNextDueDate(item.dueDay);
        const daysUntil = getDaysUntil(nextDueDate);
        return { ...item, nextDueDate, daysUntil, paid: isPaidThisMonth(item) };
      })
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
  }, [items]);

  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const totalCells = Math.ceil((lastDay.getDate() + startPad) / 7) * 7;
    const days: { day: number; isCurrentMonth: boolean; items: typeof withDue }[] = [];

    for (let i = 0; i < totalCells; i++) {
      const date = new Date(year, month, 1 - startPad + i);
      const isCurrentMonth = date.getMonth() === month && date.getFullYear() === year;
      const dayNum = date.getDate();

      const dayItems = isCurrentMonth
        ? withDue.filter((item) => item.dueDay === dayNum)
        : [];

      days.push({ day: dayNum, isCurrentMonth, items: dayItems });
    }

    return days;
  }, [calendarMonth, withDue]);

  const calendarBillsForDay = useMemo(() => {
    if (selectedCalDay === null) return [];
    return withDue.filter((item) => item.dueDay === selectedCalDay);
  }, [selectedCalDay, withDue]);

  const monthlyTotal = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items]);
  const monthlyPaid = useMemo(
    () => items.filter((item) => isPaidThisMonth(item)).reduce((sum, item) => sum + item.amount, 0),
    [items],
  );
  const budgetProgress = budget > 0 ? Math.min((monthlyTotal / budget) * 100, 100) : 0;
  const yearlyPriceWithoutDiscount = RECOMMENDED_PRICES_MAD.monthly * 12;
  const yearlyDiscountPercent = Math.round((1 - RECOMMENDED_PRICES_MAD.yearly / yearlyPriceWithoutDiscount) * 100);

const CATEGORY_COLORS = [
  "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#f97316", "#14b8a6", "#6366f1", "#84cc16",
];



const monthlyIncome = useMemo(() => incomes.reduce((sum, i) => sum + i.amount, 0), [incomes]);

  const balance = useMemo(() => monthlyIncome - monthlyTotal, [monthlyIncome, monthlyTotal]);

  const savingsRate = useMemo(() => {
    if (monthlyIncome <= 0) return 0;
    return Math.max(0, Math.round((balance / monthlyIncome) * 100));
  }, [balance, monthlyIncome]);

  const addIncome = () => {
    if (!incomeForm.label.trim() || incomeForm.amount <= 0) {
      setToastMessage("Please fill income label and amount.");
      return;
    }
    setIncomes((prev) => [
      { id: crypto.randomUUID(), ...incomeForm, label: incomeForm.label.trim(), createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setIncomeForm({ label: "", amount: 0, category: "Salary" });
    setToastMessage("Income added.");
  };

  const removeIncome = (id: string) => {
    setIncomes((prev) => prev.filter((i) => i.id !== id));
    setToastMessage("Income removed.");
  };


  const totalSavingsTarget = useMemo(() => savingsGoals.reduce((sum, g) => sum + g.targetAmount, 0), [savingsGoals]);
  const totalSavingsSaved = useMemo(() => savingsGoals.reduce((sum, g) => sum + g.savedAmount, 0), [savingsGoals]);

  const addSavingsGoal = () => {
    if (!savingsForm.label.trim() || savingsForm.targetAmount <= 0) {
      setToastMessage("Please fill goal name and target amount.");
      return;
    }
    setSavingsGoals((prev) => [
      {
        id: crypto.randomUUID(),
        label: savingsForm.label.trim(),
        targetAmount: savingsForm.targetAmount,
        savedAmount: savingsForm.savedAmount,
        deadline: savingsForm.deadline,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setSavingsForm({ label: "", targetAmount: 0, savedAmount: 0, deadline: "" });
    setToastMessage("Savings goal added!");
  };

  const addToSavings = (id: string, extra: number) => {
    setSavingsGoals((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, savedAmount: Math.min(g.savedAmount + extra, g.targetAmount) } : g
      )
    );
    setToastMessage("Savings updated!");
  };

  const removeSavingsGoal = (id: string) => {
    setSavingsGoals((prev) => prev.filter((g) => g.id !== id));
    setToastMessage("Savings goal removed.");
  };

  const addCategoryLimit = () => {
    const cat = newLimitCategory.trim();
    if (!cat || newLimitAmount <= 0) {
      setToastMessage("Select a category and enter a limit.");
      return;
    }
    setCategoryLimits((prev) => {
      const exists = prev.find((cl) => cl.category.toLowerCase() === cat.toLowerCase());
      if (exists) {
        return prev.map((cl) => cl.category.toLowerCase() === cat.toLowerCase() ? { ...cl, limit: newLimitAmount } : cl);
      }
      return [...prev, { category: cat, limit: newLimitAmount }];
    });
    setNewLimitCategory("");
    setNewLimitAmount(0);
    setToastMessage("Category limit saved.");
  };

  const removeCategoryLimit = (category: string) => {
    setCategoryLimits((prev) => prev.filter((cl) => cl.category !== category));
    setToastMessage("Category limit removed.");
  };

  const lateFeeExposure = useMemo(() => {
    if (lateFeeRules.length === 0) return [];
    const now = new Date();

    return withDue
      .filter((item) => !item.paid && item.daysUntil < 0)
      .map((item) => {
        const rule = lateFeeRules.find((r) => r.name.toLowerCase() === item.name.toLowerCase());
        if (!rule) return null;
        const overdueDays = Math.abs(item.daysUntil) - rule.graceDays;
        if (overdueDays <= 0) return null;
        const fee = overdueDays * rule.feePerDay;
        return { item, rule, overdueDays, fee };
      })
      .filter(Boolean) as { item: typeof withDue[0]; rule: LateFeeRule; overdueDays: number; fee: number }[];
  }, [withDue, lateFeeRules]);

  const totalLateFees = useMemo(() => lateFeeExposure.reduce((sum, e) => sum + e.fee, 0), [lateFeeExposure]);

  
  const addLateFeeRule = () => {
    if (!lateFeeForm.name.trim() || lateFeeForm.feePerDay <= 0) {
      setToastMessage("Fill bill name and fee per day.");
      return;
    }
    setLateFeeRules((prev) => [
      { id: crypto.randomUUID(), name: lateFeeForm.name.trim(), feePerDay: lateFeeForm.feePerDay, graceDays: lateFeeForm.graceDays },
      ...prev,
    ]);
    setLateFeeForm({ name: "", feePerDay: 0, graceDays: 0 });
    setToastMessage("Late fee rule added.");
  };

  const removeLateFeeRule = (id: string) => {
    setLateFeeRules((prev) => prev.filter((r) => r.id !== id));
    setToastMessage("Late fee rule removed.");
  };

  const totalAccountBalance = useMemo(() => accounts.reduce((sum, acc) => sum + acc.balance, 0), [accounts]);

  const addAccount = () => {
    if (!accountForm.name.trim()) {
      setToastMessage("Please enter an account name.");
      return;
    }
    setAccounts((prev) => [
      {
        id: crypto.randomUUID(),
        name: accountForm.name.trim(),
        type: accountForm.type,
        balance: accountForm.balance,
        color: accountForm.color,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setAccountForm({ name: "", type: "bank", balance: 0, color: "#06b6d4" });
    setToastMessage("Account added!");
  };

  const updateAccountBalance = (id: string, newBalance: number) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, balance: newBalance } : acc))
    );
    setToastMessage("Balance updated.");
  };

  const removeAccount = (id: string) => {
    setAccounts((prev) => prev.filter((acc) => acc.id !== id));
    setToastMessage("Account removed.");
  };

const getCategoryColor = (category: string) => {
  const index = categories.indexOf(category);
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
};

const incomeCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    incomes.forEach((inc) => map.set(inc.category, (map.get(inc.category) ?? 0) + inc.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [incomes]);

  const last6MonthsTotals = useMemo(() => {
    const now = new Date();
    const months: { label: string; month: number; year: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString("en", { month: "short" }),
        month: d.getMonth(),
        year: d.getFullYear(),
      });
    }
    return months.map((m) => {
      const snapshotKey = `${userScopedKey("snapshot")}-${m.month}`;
      const total = readLS<number>(snapshotKey, 0);
      return { ...m, total };
    });
  }, [appUserId, items]);

  const smartMessages = useMemo(() => {
    const messages: string[] = [];
    const dueSoonItems = withDue.filter((item) => !item.paid && item.daysUntil >= 0 && item.daysUntil <= item.reminderDays);

    for (const item of dueSoonItems) {
      const label = item.daysUntil === 0 ? "today" : item.daysUntil === 1 ? "tomorrow" : `in ${item.daysUntil} days`;
      messages.push(`${item.name} is due ${label} (${formatMoney(item.amount)}).`);
    }

    const renewTomorrowCount = withDue.filter((item) => item.type === "subscription" && item.daysUntil === 1 && !item.paid).length;
    if (renewTomorrowCount > 0) {
      messages.push(`${renewTomorrowCount} subscription${renewTomorrowCount > 1 ? "s" : ""} renew tomorrow.`);
    }

    const previousMonthSnapshot = readLS<number>(`${userScopedKey("snapshot")}-${new Date().getMonth() - 1}`, monthlyTotal);
    if (previousMonthSnapshot > 0 && monthlyTotal > previousMonthSnapshot * 1.4) {
      messages.push("You are spending more than 40% vs last month.");
    }

    if (budgetProgress >= 100) {
      messages.push("Budget alert: you reached 100% of your monthly budget.");
    } else if (budgetProgress >= 80) {
      messages.push("Budget alert: you crossed 80% of your monthly budget.");
    }
    
    return messages;
  }, [withDue, monthlyTotal, budgetProgress, formatMoney, appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    const snapshotKey = `${userScopedKey("snapshot")}-${new Date().getMonth()}`;
    localStorage.setItem(snapshotKey, JSON.stringify(monthlyTotal));
  }, [monthlyTotal, appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    const alertLevel = readLS<number>(userScopedKey(STORAGE_KEYS.budgetAlertLevel), 0);
    let nextLevel = alertLevel;
    let notificationText = "";

    if (budgetProgress >= 100 && alertLevel < 100) {
      nextLevel = 100;
      notificationText = `Budget reached 100% (${formatMoney(monthlyTotal)}).`;
    } else if (budgetProgress >= 80 && alertLevel < 80) {
      nextLevel = 80;
      notificationText = `Budget reached 80% (${formatMoney(monthlyTotal)}).`;
    } else if (budgetProgress < 80 && alertLevel !== 0) {
      nextLevel = 0;
    }
    // Reset alert level on new month
    const now = new Date();
    const alertMonth = readLS<number>(userScopedKey(STORAGE_KEYS.budgetAlertLevel + "-month"), -1);
    if (now.getMonth() !== alertMonth) {
      localStorage.setItem(userScopedKey(STORAGE_KEYS.budgetAlertLevel + "-month"), JSON.stringify(now.getMonth()));
      nextLevel = 0;
    }

    if (nextLevel !== alertLevel) {
      localStorage.setItem(userScopedKey(STORAGE_KEYS.budgetAlertLevel), JSON.stringify(nextLevel));
    }

    if (notifEnabled && notificationText && "Notification" in window && Notification.permission === "granted") {
      new Notification("All-in-One Bill Tracker", { body: notificationText });
    }
  }, [budgetProgress, monthlyTotal, notifEnabled, formatMoney, appUserId]);

  useEffect(() => {
    if (!notifEnabled || !("Notification" in window) || Notification.permission !== "granted") {
      return;
    }
    const sentMap = readLS<Record<string, boolean>>(userScopedKey(STORAGE_KEYS.sentReminderMap), {});
    let changed = false;
    withDue
      .filter((item) => !item.paid && item.daysUntil >= 0 && item.daysUntil <= item.reminderDays)
      .forEach((item) => {
        const key = `${item.id}-${item.nextDueDate.toISOString().slice(0, 10)}`;
        if (!sentMap[key]) {
          const label = item.daysUntil === 0 ? "today" : item.daysUntil === 1 ? "tomorrow" : `in ${item.daysUntil} days`;
          new Notification("Payment reminder", {
            body: `${item.name} is due ${label} (${formatMoney(item.amount)}).`,
          });
          sentMap[key] = true;
          changed = true;
        }
      });

    if (changed) {
      localStorage.setItem(userScopedKey(STORAGE_KEYS.sentReminderMap), JSON.stringify(sentMap));
    }
  }, [withDue, notifEnabled, formatMoney, appUserId]);

  const categories = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.category))).sort();
  }, [items]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    return withDue.filter((item) => {
      const bySearch = item.name.toLowerCase().includes(debouncedSearch.toLowerCase());

       const byCategory = categoryFilter === "all" || item.category === categoryFilter;
      const byStatus =
        statusFilter === "all" ||
        (statusFilter === "dueSoon" && !item.paid && item.daysUntil >= 0 && item.daysUntil <= 3) ||
        (statusFilter === "paid" && item.paid) ||
        (statusFilter === "unpaid" && !item.paid);
      return bySearch && byCategory && byStatus;
    });
  }, [withDue, debouncedSearch, categoryFilter, statusFilter]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const categoryLimitStatus = useMemo(() => {
    return categoryTotals.map(([category, spent]) => {
      const limit = categoryLimits.find((cl) => cl.category.toLowerCase() === category.toLowerCase());
      if (!limit) return { category, spent, limit: 0, percent: 0, status: "none" as const };
      const percent = limit.limit > 0 ? Math.round((spent / limit.limit) * 100) : 0;
      const status = percent >= 100 ? "over" as const : percent >= 80 ? "warning" as const : "ok" as const;
      return { category, spent, limit: limit.limit, percent, status };
    }).filter((cl) => cl.limit > 0);
  }, [categoryTotals, categoryLimits]);

  const financialHealth = useMemo(() => {
    return calculateFinancialHealth({
      savingsRate, budgetProgress,
      overdueCount: withDue.filter((item) => !item.paid && item.daysUntil < 0).length,
      totalBills: items.length, paidBills: items.filter((item) => isPaidThisMonth(item)).length,
      hasIncome: monthlyIncome > 0, hasBudget: budget > 0, hasSavingsGoal: savingsGoals.length > 0,
      categoryLimitsCount: categoryLimits.length,
      overLimitCount: categoryLimitStatus.filter((cl) => cl.status === "over").length,
      lateFees: totalLateFees, totalAccountBalance, monthlyTotal,
    });
  }, [savingsRate, budgetProgress, withDue, items, monthlyIncome, budget, savingsGoals, categoryLimits, categoryLimitStatus, totalLateFees, totalAccountBalance, monthlyTotal]);

  const canUsePremiumFeatures = entitlement.premiumActive;
  const freeItemsLeft = Math.max(0, FREE_ITEM_LIMIT - items.length);
  const subscriptionExpired = Boolean(entitlement.expiresAt) && !entitlement.premiumActive && new Date(entitlement.expiresAt as string).getTime() <= Date.now();

  useEffect(() => {
    if (!dueDaySoundEnabled) {
      return;
    }

    const sentSoundMap = readLS<Record<string, boolean>>(userScopedKey(STORAGE_KEYS.sentDueDaySoundMap), {});
    let changed = false;
    let shouldPlay = false;

    withDue
      .filter((item) => !item.paid && item.daysUntil === 0)
      .forEach((item) => {
        const key = `${item.id}-${item.nextDueDate.toISOString().slice(0, 10)}`;
        if (!sentSoundMap[key]) {
          sentSoundMap[key] = true;
          shouldPlay = true;
          changed = true;
        }
      });

    if (!changed) {
      return;
    }

    localStorage.setItem(userScopedKey(STORAGE_KEYS.sentDueDaySoundMap), JSON.stringify(sentSoundMap));
    if (shouldPlay) {
      playPremiumDueSound();
      setToastMessage("Premium alert: payment-day sound triggered.");
    }
  }, [withDue, canUsePremiumFeatures, notifEnabled, dueDaySoundEnabled, appUserId]);

  const inactiveSubscriptions = useMemo(() => {
    const now = new Date();
    return items.filter((item) => {
      if (item.type !== "subscription") {
        return false;
      }
      if (!item.lastPaidAt) {
        return true;
      }
      return now.getTime() - new Date(item.lastPaidAt).getTime() > 30 * DAY_MS;
    });
  }, [items]);

  const applyTemplate = (template: Template) => {
    setForm(template);
  };

  const onAddItem = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || form.amount <= 0) {
      setToastMessage("Please fill name and amount.");
      return;
    }

    const cleanedCategory = form.category.trim();
    if (!cleanedCategory) {
      setToastMessage("Please enter a category.");
      return;
    }

    if (!Number.isInteger(form.dueDay) || form.dueDay < 1 || form.dueDay > 31) {
      setToastMessage("Due day must be between 1 and 31.");
      return;
    }

    if (!Number.isInteger(form.reminderDays) || form.reminderDays < 0 || form.reminderDays > 20) {
      setToastMessage("Reminder days must be between 0 and 20.");
      return;
    }

    const existingCategories = new Set(
      items
        .filter((item) => item.id !== editingItemId)
        .map((item) => item.category.trim().toLowerCase())
        .filter(Boolean),
    );
    const isNewCategory = !existingCategories.has(cleanedCategory.toLowerCase());

    if (!entitlement.premiumActive && isNewCategory && existingCategories.size >= FREE_CATEGORY_LIMIT) {
      setShowPremiumPanel(true);
      setToastMessage(`Free plan supports up to ${FREE_CATEGORY_LIMIT} categories. Upgrade to Premium for unlimited categories.`);
      return;
    }

    if (!entitlement.premiumActive && !editingItemId && items.length >= FREE_ITEM_LIMIT) {
      setShowPremiumPanel(true);
      setToastMessage(`Free plan limit reached (${FREE_ITEM_LIMIT} items). Upgrade to Premium for unlimited items.`);
      return;
    }
    if (editingItemId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                ...form,
                name: form.name.trim(),
                    category: cleanedCategory,
              }
            : item,
        ),
      );
      setToastMessage("Item updated successfully.");
      resetForm();
      return;
    }
    const nextItem: BillItem = {
      id: crypto.randomUUID(),
      ...form,
      name: form.name.trim(),
      category: cleanedCategory,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => [nextItem, ...prev]);
    setToastMessage("Item added successfully.");
    resetForm();
  };

  const saveTemplate = () => {
    if (
      !form.name.trim() ||
      form.amount <= 0 ||
      !form.category.trim() ||
      !Number.isInteger(form.dueDay) ||
      form.dueDay < 1 ||
      form.dueDay > 31 ||
      !Number.isInteger(form.reminderDays) ||
      form.reminderDays < 0 ||
      form.reminderDays > 20
    ) {
      setToastMessage("Fill all Smart Add fields before saving a template.");
      return;
    }
    const exists = templates.find((template) => template.name.toLowerCase() === form.name.trim().toLowerCase());
    if (exists) {
      setTemplates((prev) => prev.map((template) => (template.name.toLowerCase() === exists.name.toLowerCase() ? { ...form, name: form.name.trim() } : template)));
      return;
    }
    setTemplates((prev) => [...prev, { ...form, name: form.name.trim() }]);
  };

  const markPaid = (id: string) => {
    const target = items.find((item) => item.id === id);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              lastPaidAt: new Date().toISOString(),
            }
          : item,
      ),
    );


    if (target) {
      pushNotificationCenter({
        title: "Payment marked as paid",
        detail: `${target.name} was marked as paid for this month.`,
        type: "reminder",
      });
    }
  };

  const startEditItem = (id: string) => {
    const selectedItem = items.find((item) => item.id === id);
    if (!selectedItem) {
      return;
    }
    setInlineEditId(null);
    setEditingItemId(id);
    setForm({
      name: selectedItem.name,
      amount: selectedItem.amount,
      dueDay: selectedItem.dueDay,
      category: selectedItem.category,
      reminderDays: selectedItem.reminderDays,
      type: selectedItem.type,
      repeat: selectedItem.repeat,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startInlineEdit = (id: string) => {
    const selectedItem = items.find((item) => item.id === id);
    if (!selectedItem) {
      return;
    }
    setEditingItemId(null);
    setInlineEditId(id);
    setInlineDraft({ amount: fromMAD(selectedItem.amount, currency, currencyToMAD).toFixed(2), dueDay: selectedItem.dueDay.toString() });
  };

  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineDraft({ amount: "", dueDay: "" });
  };

  const saveInlineEdit = (id: string) => {
    const nextAmount = Number(inlineDraft.amount);
    const nextDueDay = Number(inlineDraft.dueDay);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0 || !Number.isInteger(nextDueDay) || nextDueDay < 1 || nextDueDay > 31) {
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              amount: toMAD(nextAmount, currency, currencyToMAD),
              dueDay: nextDueDay,
            }
          : item,
      ),
    );
    setToastMessage("Item updated successfully.");
    cancelInlineEdit();
  };

  const removeItem = (id: string) => {
    const target = items.find((item) => item.id === id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setToastMessage("Item deleted successfully.");
    if (target) {
      pushNotificationCenter({
        title: "Item deleted",
        detail: `${target.name} was removed from your tracker.`,
        type: "system",
      });
    }
  };

 const requestNotifications = async () => {
    // Try Capacitor native plugin first
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      try {
        const LN = cap.Plugins?.LocalNotifications;
        if (LN) {
          const result = await LN.requestPermissions();
          if (result.display === "granted") {
            setNotifEnabled(true);
            setToastMessage("Notifications enabled!");
            return;
          }
        }
      } catch {}
    }

    // Fallback to web Notification API
    if (!("Notification" in window)) {
      setToastMessage("Notifications not supported.");
      return;
    }

    if (Notification.permission === "granted") {
      setNotifEnabled(true);
      setToastMessage("Notifications already enabled.");
      return;
    }

    if (Notification.permission === "denied") {
      setToastMessage("Notifications blocked. Go to Settings → Apps → Notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    const granted = permission === "granted";
    setNotifEnabled(granted);
    setToastMessage(granted ? "Notifications enabled!" : "Permission not granted.");
  };

  const exportBackup = () => {
    const payload = {
      items,
      templates,
      currency,
      budget,
      pin,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "bill-tracker-backup.json";
    a.click();
    URL.revokeObjectURL(href);
  };

  const restoreBackup = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text) as Partial<{
      version: number;
      items: BillItem[];
      templates: Template[];
      currency: Currency;
      budget: number;
      pin: string;
      incomes: IncomeEntry[];
      savingsGoals: SavingsGoal[];
      categoryLimits: CategoryLimit[];
      lateFeeRules: LateFeeRule[];
      accounts: Account[];
      theme: "dark" | "light";
      notificationCenter: NotificationEntry[];
    }>;

    let restoredCount = 0;

    if (data.items) { setItems(data.items); restoredCount++; }
    if (data.templates) { setTemplates(data.templates); restoredCount++; }
    if (data.currency) { setCurrency(data.currency); restoredCount++; }
    if (typeof data.budget === "number") { setBudget(data.budget); restoredCount++; }
    if (typeof data.pin === "string") {
      setPin(data.pin);
      localStorage.setItem(userScopedKey(STORAGE_KEYS.pin), data.pin);
      setLocked(Boolean(data.pin));
      restoredCount++;
    }
    if (data.incomes) { setIncomes(data.incomes); restoredCount++; }
    if (data.savingsGoals) { setSavingsGoals(data.savingsGoals); restoredCount++; }
    if (data.categoryLimits) { setCategoryLimits(data.categoryLimits); restoredCount++; }
    if (data.lateFeeRules) { setLateFeeRules(data.lateFeeRules); restoredCount++; }
    if (data.accounts) { setAccounts(data.accounts); restoredCount++; }
    if (data.theme) { setTheme(data.theme); restoredCount++; }
    if (data.notificationCenter) { setNotificationCenter(data.notificationCenter); restoredCount++; }

    setToastMessage(`Backup restored! (${restoredCount} sections recovered)`);
  };

  const setPinCode = async () => {
    if (!/^\d{4,8}$/.test(newPin)) {
      setToastMessage("PIN must be 4-8 digits.");
      return;
    }
    const hashed = await hashPin(newPin);
    setPin(hashed);
    localStorage.setItem(userScopedKey(STORAGE_KEYS.pin), hashed);
    setNewPin("");
    setLocked(false);
    setToastMessage("PIN saved successfully.");
  };

  const removePin = () => {
    setPin("");
    localStorage.removeItem(userScopedKey(STORAGE_KEYS.pin));
    setLocked(false);
    setPinInput("");
    setToastMessage("PIN removed successfully.");
  };

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    if (!AUTH_API_BASE_URL) {
      setAuthError("Set VITE_AUTH_API_BASE_URL to enable login/signup.");
      return;
    }

    const countrySelection = PHONE_COUNTRIES.find((country) => country.code === selectedPhoneCountry) ?? PHONE_COUNTRIES[0];
    const normalizedPhone = toInternationalPhone(countrySelection.dial, phoneLocalNumber);

    if (authMode === "signup") {
      if (!authForm.fullName.trim() || !authForm.username.trim() || !authForm.email.trim() || !phoneLocalNumber.trim()) {
        setAuthError("Please fill all signup fields.");
        return;
      }

      if (!EMAIL_REGEX.test(authForm.email.trim())) {
        setAuthError("Email is invalid. Please enter a valid email address.");
        return;
      }

      if (containsBlockedUsernameWord(authForm.username.trim(), blockedUsernameWords, allowedUsernames)) {
        setAuthError("Username contains blocked words. Please choose a different username.");
        return;
      }

      if (!/^\+\d{8,15}$/.test(normalizedPhone)) {
        setAuthError("Enter a valid phone number for the selected country.");
        return;
      }
    }

    if (!authForm.password || authForm.password.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }

    setAuthSubmitting(true);
    try {
      const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const payload =
        authMode === "signup"
          ? {
              fullName: authForm.fullName.trim(),
              phoneNumber: normalizedPhone,
              username: authForm.username.trim(),
              email: authForm.email.trim(),
              password: authForm.password,
            }
          : {
              username: authForm.username.trim(),
              password: authForm.password,
            };

      const response = await fetch(`${AUTH_API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        token?: string;
        user?: AuthUser;
        code?: string;
        message?: string;
        requiresEmailVerification?: boolean;
        verificationEmail?: string;
        verificationCode?: string;
        expiresInHours?: number;
        retryAfterSeconds?: number;
      };

      if (!response.ok || !data.ok) {
        if (data.code === "BLOCKED_USERNAME") {
          throw new Error("Username contains blocked words. Please choose a different username.");
        }
        if (data.code === "INVALID_EMAIL") {
          throw new Error("Email is invalid. Please enter a valid email address.");
        }
        if (data.code === "EMAIL_NOT_VERIFIED") {
          setVerificationEmail(data.verificationEmail?.trim() || authForm.email.trim());
          setVerificationInfo("Email not verified. Verify your email, then sign in again with your latest password.");
          throw new Error(data.message ?? "Email not verified. Verify your email to continue.");
        }
        if (data.code === "LOGIN_LOCKED") {
          throw new Error(data.message ?? `Too many failed attempts. Try again in ${data.retryAfterSeconds ?? 0}s.`);
        }
        throw new Error(data.code ?? "Authentication failed");
      }

      if (authMode === "signup") {
        setVerificationEmail(authForm.email.trim());
        setVerificationCode(data.verificationCode ?? "");
        setVerificationInfo(
          data.verificationCode
            ? "Verification code generated. It has been auto-filled for testing."
            : `Verification code sent to ${authForm.email.trim()}. Check inbox/spam and enter it below.`,
        );
        setAuthMode("login");
        setAuthError("");
        setToastMessage("Account created. Verify your email to continue.");
      } else if (data.token && data.user) {
        localStorage.setItem(STORAGE_KEYS.authToken, data.token);
        localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(data.user));
        setCurrentUser(data.user);
        setToastMessage("Welcome back.");
      } else {
        throw new Error("Authentication response missing token.");
      }

      setAuthForm({
        fullName: "",
        username: "",
        email: "",
        phoneNumber: "+212",
        password: "",
      });
      setSelectedPhoneCountry("MA");
      setPhoneLocalNumber("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleForgotPasswordRequest = async (isResend = false) => {
    setAuthError("");
    setForgotPasswordInfo("");

    if (isResend && forgotPasswordResendAvailableAt > Date.now()) {
      return;
    }

    if (!AUTH_API_BASE_URL) {
      setAuthError("Set VITE_AUTH_API_BASE_URL to enable password reset.");
      return;
    }

    if (!EMAIL_REGEX.test(forgotPasswordEmail.trim())) {
      setAuthError("Enter a valid email before requesting a reset code.");
      return;
    }

    setForgotPasswordSubmitting(true);
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: forgotPasswordEmail.trim() }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        resetToken?: string;
        resetCode?: string;
        expiresInMinutes?: number;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "Unable to request password reset.");
      }

      const debugToken = data.resetCode ?? data.resetToken;
      if (debugToken) {
        setForgotPasswordToken(debugToken);
      }
      setForgotPasswordStep("reset");
      setForgotPasswordExpiresInMinutes(typeof data.expiresInMinutes === "number" ? data.expiresInMinutes : null);
      setForgotPasswordResendAvailableAt(Date.now() + 60 * 1000);
      setForgotPasswordNow(Date.now());

      if (debugToken) {
        setForgotPasswordInfo(
          "Reset code generated. It has been auto-filled for testing. Set a new password below.",
        );
      } else {
        setForgotPasswordInfo(
          `Reset code sent to ${forgotPasswordEmail.trim()}. Check inbox and spam, then enter the code below.`,
        );
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to request password reset.");
    } finally {
      setForgotPasswordSubmitting(false);
    }
  };

  const handleForgotPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");
    setForgotPasswordInfo("");

    if (!AUTH_API_BASE_URL) {
      setAuthError("Set VITE_AUTH_API_BASE_URL to enable password reset.");
      return;
    }

    if (!EMAIL_REGEX.test(forgotPasswordEmail.trim())) {
      setAuthError("Enter the same valid email used during signup.");
      return;
    }

    if (!forgotPasswordToken.trim() || forgotPasswordToken.trim().length < 8) {
      setAuthError("Enter a valid reset code.");
      return;
    }

    if (forgotPasswordNewPassword.length < 8) {
      setAuthError("New password must be at least 8 characters.");
      return;
    }

    setForgotPasswordSubmitting(true);
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: forgotPasswordEmail.trim(),
          resetToken: forgotPasswordToken.trim(),
          newPassword: forgotPasswordNewPassword,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        if (data.code === "INVALID_RESET_TOKEN") {
          throw new Error("Reset code is invalid or expired.");
        }
        throw new Error(data.message ?? "Unable to reset password.");
      }

      // Force logout after password reset so old sessions cannot create confusion.
      localStorage.removeItem(STORAGE_KEYS.authToken);
      localStorage.removeItem(STORAGE_KEYS.authUser);
      setCurrentUser(null);
      setLocked(false);
      setPinInput("");
      setShowPremiumPanel(false);

      const targetEmail = forgotPasswordEmail.trim();

      setForgotPasswordInfo("Password updated. Verify your email before signing in.");
      setForgotPasswordOpen(false);
      setForgotPasswordStep("request");
      setForgotPasswordToken("");
      setForgotPasswordNewPassword("");
      setForgotPasswordResendAvailableAt(0);
      setForgotPasswordExpiresInMinutes(null);
      setAuthMode("login");
      setVerificationEmail(targetEmail);
      setVerificationCode("");
      setVerificationInfo("Password updated. Email not verified yet. Tap \"Send verification code now\" below.");
      setAuthForm((prev) => ({ ...prev, password: "" }));
      setToastMessage("Password updated. Verify your email to sign in.");

      setVerificationSubmitting(true);
      try {
        await requestVerificationCode(targetEmail, "post_reset");
      } catch (verificationError) {
        setAuthError(
          verificationError instanceof Error
            ? verificationError.message
            : "Password updated, but verification email could not be sent.",
        );
      } finally {
        setVerificationSubmitting(false);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setForgotPasswordSubmitting(false);
    }
  };

  const handleVerifyEmail = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");
    if (!AUTH_API_BASE_URL) {
      setAuthError("Set VITE_AUTH_API_BASE_URL to verify email.");
      return;
    }
    if (!EMAIL_REGEX.test(verificationEmail.trim())) {
      setAuthError("Enter a valid verification email.");
      return;
    }
    if (verificationCode.trim().length < 8) {
      setAuthError("Enter a valid verification code.");
      return;
    }

    setVerificationSubmitting(true);
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: verificationEmail.trim(),
          verificationCode: verificationCode.trim(),
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        token?: string;
        user?: AuthUser;
        message?: string;
      };
      if (!response.ok || !data.ok || !data.token || !data.user) {
        throw new Error(data.message ?? "Unable to verify email.");
      }
      localStorage.setItem(STORAGE_KEYS.authToken, data.token);
      localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(data.user));
      setCurrentUser(data.user);
      setVerificationEmail("");
      setVerificationCode("");
      setVerificationInfo("");
      setToastMessage("Email verified successfully.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to verify email.");
    } finally {
      setVerificationSubmitting(false);
    }
  };

  const requestVerificationCode = async (email: string, source: "manual" | "post_reset" = "manual") => {
    if (!AUTH_API_BASE_URL) {
      throw new Error("Set VITE_AUTH_API_BASE_URL to resend verification.");
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      throw new Error("Enter a valid email first.");
    }

    const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = (await response.json()) as { ok?: boolean; message?: string; verificationCode?: string };
    if (!response.ok || !data.ok) {
      throw new Error(data.message ?? "Unable to resend verification code.");
    }

    if (data.verificationCode) {
      setVerificationCode(data.verificationCode);
    }

    if (source === "post_reset") {
      setVerificationInfo(
        data.verificationCode
          ? "Password updated. Verification code sent and auto-filled for testing. Verify now, then sign in with your new password."
          : "Password updated. Email not verified yet. Verification code sent now. Check inbox/spam, verify, then sign in with your new password.",
      );
      return;
    }

    setVerificationInfo(data.verificationCode ? "Verification code refreshed and auto-filled for testing." : "Verification email sent. Check inbox/spam.");
  };

  const handleResendVerification = async () => {
    setAuthError("");
    setVerificationSubmitting(true);
    try {
      await requestVerificationCode(verificationEmail, "manual");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to resend verification code.");
    } finally {
      setVerificationSubmitting(false);
    }
  };

  const exportCsv = () => {
    const headers = [
      "Name", "Type", "Category",
      `Amount_${currency}`, "DueDay", "ReminderDays",
      "PaidThisMonth", "LastPaidAt",
      "BalanceLeft", "SavingsRate",
    ];

    const rows = items.map((item) => [
      item.name,
      item.type,
      item.category,
      fromMAD(item.amount, currency, currencyToMAD).toFixed(2),
      String(item.dueDay),
      String(item.reminderDays),
      isPaidThisMonth(item) ? "yes" : "no",
      item.lastPaidAt ?? "",
    ]);

    const summaryRows = [
      [],
      ["--- SUMMARY ---"],
      [`Total Bills (${currency})`, fromMAD(monthlyTotal, currency, currencyToMAD).toFixed(2)],
      [`Total Paid (${currency})`, fromMAD(monthlyPaid, currency, currencyToMAD).toFixed(2)],
      [`Total Income (${currency})`, fromMAD(monthlyIncome, currency, currencyToMAD).toFixed(2)],
      [`Balance (${currency})`, fromMAD(balance, currency, currencyToMAD).toFixed(2)],
      ["Savings Rate", `${savingsRate}%`],
      ["Budget Progress", `${budgetProgress.toFixed(0)}%`],
      ["# Accounts", String(accounts.length)],
      ["# Savings Goals", String(savingsGoals.length)],
      ["# Late Fee Rules", String(lateFeeRules.length)],
    ];

    const csv = [headers, ...rows, ...summaryRows]
      .map((row) => row.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `bill-tracker-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(href);
    setToastMessage("CSV export with summary ready.");
  };

  const exportPdf = () => {
    const rows = items
      .map(
        (item) =>
          `<tr><td>${item.name}</td><td>${item.type}</td><td>${item.category}</td><td>${formatMoney(item.amount)}</td><td>${item.dueDay}</td><td>${item.reminderDays}</td></tr>`,
      )
      .join("");

    const html = `<html><head><title>Bill Tracker Report</title><style>
      body{font-family:Arial;padding:24px;color:#111;} h1{margin:0 0 12px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f1f5f9;}
      </style></head><body>
      <h1>All-in-One Bill Tracker Report</h1>
      <p>Generated at: ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Name</th><th>Type</th><th>Category</th><th>Amount</th><th>Due day</th><th>Reminder days</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "bill-tracker-report.html";
    a.click();
    URL.revokeObjectURL(href);
    setToastMessage("Report downloaded.");
  };
  
  const handleLogoutAllDevices = async () => {
    if (!AUTH_API_BASE_URL) {
      setAuthError("Set VITE_AUTH_API_BASE_URL to manage sessions.");
      return;
    }
    const token = localStorage.getItem(STORAGE_KEYS.authToken) ?? "";
    if (!token) {
      return;
    }
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/logout-all-devices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "Unable to logout all devices.");
      }
      handleLogout();
      pushNotificationCenter({
        title: "Session security",
        detail: "You were logged out from all devices.",
        type: "security",
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to logout all devices.");
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteAccountConfirmInput.trim().toLowerCase() !== currentUser?.username.toLowerCase()) {
      setAuthError("Type your exact username to confirm account deletion.");
      return;
    }
    if (!AUTH_API_BASE_URL) {
      setAuthError("Set VITE_AUTH_API_BASE_URL to delete account.");
      return;
    }
    const token = localStorage.getItem(STORAGE_KEYS.authToken) ?? "";
    if (!token) {
      return;
    }
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "Unable to delete account.");
      }
      Object.values(STORAGE_KEYS).forEach((prefix) => {
        Object.keys(localStorage)
          .filter((key) => key.startsWith(prefix))
          .forEach((key) => localStorage.removeItem(key));
      });
      localStorage.removeItem(STORAGE_KEYS.authToken);
      localStorage.removeItem(STORAGE_KEYS.authUser);
      setCurrentUser(null);
      setShowDeleteAccountDialog(false);
      setDeleteAccountConfirmInput("");
      setToastMessage("Account deleted successfully.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to delete account.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.authToken);
    localStorage.removeItem(STORAGE_KEYS.authUser);
    setCurrentUser(null);
    setLocked(false);
    setPinInput("");
    setShowPremiumPanel(false);
    setToastMessage("Logged out successfully.");
  };

const smartTips = useMemo(() => {
    const tips: { icon: string; title: string; detail: string; type: "success" | "warning" | "danger" | "info" }[] = [];

    // Tip 1: Savings rate
    if (monthlyIncome > 0) {
      if (savingsRate >= 30) {
        tips.push({ icon: "🌟", title: "Excellent savings rate!", detail: `You're saving ${savingsRate}% of your income. Keep it up!`, type: "success" });
      } else if (savingsRate >= 20) {
        tips.push({ icon: "👍", title: "Good savings rate", detail: `You're saving ${savingsRate}% of your income. You're on track!`, type: "success" });
      } else if (savingsRate > 0) {
        tips.push({ icon: "⚠️", title: "Low savings rate", detail: `You're only saving ${savingsRate}% of your income. Try to reach at least 20%.`, type: "warning" });
      } else if (savingsRate === 0 && balance < 0) {
        tips.push({ icon: "🔴", title: "Spending exceeds income!", detail: `You're ${formatMoney(Math.abs(balance))} over your income this month. Cut unnecessary expenses immediately.`, type: "danger" });
      }
    }

    // Tip 2: Overdue bills
    const overdueBills = withDue.filter((item) => !item.paid && item.daysUntil < 0);
    if (overdueBills.length > 0) {
      tips.push({ icon: "🚨", title: `${overdueBills.length} overdue bill${overdueBills.length > 1 ? "s" : ""}`, detail: `${overdueBills.map((b) => b.name).join(", ")} — pay now to avoid fees!`, type: "danger" });
    }

    // Tip 3: Due today
    const dueToday = withDue.filter((item) => !item.paid && item.daysUntil === 0);
    if (dueToday.length > 0) {
      tips.push({ icon: "📅", title: `${dueToday.length} bill${dueToday.length > 1 ? "s" : ""} due today`, detail: `${dueToday.map((b) => `${b.name} (${formatMoney(b.amount)})`).join(", ")}`, type: "warning" });
    }

    // Tip 4: Category spending
    if (categoryLimitStatus.length > 0) {
      const overLimit = categoryLimitStatus.filter((cl) => cl.status === "over");
      const nearLimit = categoryLimitStatus.filter((cl) => cl.status === "warning");
      if (overLimit.length > 0) {
        tips.push({ icon: "🔴", title: `${overLimit.length} categor${overLimit.length > 1 ? "ies" : "y"} over limit`, detail: `${overLimit.map((cl) => cl.category).join(", ")} — reduce spending or adjust your limit.`, type: "danger" });
      }
      if (nearLimit.length > 0) {
        tips.push({ icon: "⚡", title: `${nearLimit.length} categor${nearLimit.length > 1 ? "ies" : "y"} near limit`, detail: `${nearLimit.map((cl) => `${cl.category} (${cl.percent}%)`).join(", ")} — be careful!`, type: "warning" });
      }
    }

    // Tip 5: Late fees
    if (totalLateFees > 0) {
      tips.push({ icon: "💸", title: "Late fees accumulating!", detail: `You have ${formatMoney(totalLateFees)} in potential late fees. Pay your overdue bills now!`, type: "danger" });
    }

    // Tip 6: Inactive subscriptions
    if (inactiveSubscriptions.length > 0) {
      const savings = inactiveSubscriptions.reduce((sum, item) => sum + item.amount, 0);
      tips.push({ icon: "🔄", title: `${inactiveSubscriptions.length} inactive subscription${inactiveSubscriptions.length > 1 ? "s" : ""}`, detail: `${inactiveSubscriptions.map((s) => s.name).join(", ")} — cancel to save ${formatMoney(savings)}/month (${formatMoney(savings * 12)}/year).`, type: "info" });
    }

    // Tip 7: Bill clustering
    const dueDayCounts = new Map<number, number>();
    items.forEach((item) => dueDayCounts.set(item.dueDay, (dueDayCounts.get(item.dueDay) ?? 0) + 1));
    const clustered = Array.from(dueDayCounts.entries()).filter(([, count]) => count >= 3);
    if (clustered.length > 0) {
      tips.push({ icon: "💡", title: "Many bills on the same day", detail: `Day ${clustered.map(([day]) => day).join(", ")} has 3+ bills. Consider spreading due dates for better cash flow.`, type: "info" });
    }

    // Tip 8: Budget progress
    if (budgetProgress >= 100) {
      tips.push({ icon: "🚨", title: "Budget exceeded!", detail: `You've used ${budgetProgress.toFixed(0)}% of your budget. Stop non-essential spending.`, type: "danger" });
    } else if (budgetProgress >= 80) {
      tips.push({ icon: "⚠️", title: "Budget almost used", detail: `${budgetProgress.toFixed(0)}% of budget used. Be careful for the rest of the month.`, type: "warning" });
    }

    // Tip 9: No income set
    if (items.length > 0 && monthlyIncome === 0) {
      tips.push({ icon: "💰", title: "Add your income", detail: "Set your monthly income to unlock balance tracking, savings rate, and smarter insights.", type: "info" });
    }

    // Tip 10: Monthly trend
    if (last6MonthsTotals.length >= 2) {
      const currentMonth = last6MonthsTotals[last6MonthsTotals.length - 1].total;
      const lastMonth = last6MonthsTotals[last6MonthsTotals.length - 2].total;
      if (lastMonth > 0 && currentMonth > lastMonth * 1.2) {
        tips.push({ icon: "📈", title: "Spending is increasing", detail: `This month is ${Math.round(((currentMonth - lastMonth) / lastMonth) * 100)}% higher than last month. Review your recent expenses.`, type: "warning" });
      } else if (lastMonth > 0 && currentMonth < lastMonth * 0.8) {
        tips.push({ icon: "📉", title: "Great! Spending is down", detail: `You spent ${Math.round(((lastMonth - currentMonth) / lastMonth) * 100)}% less than last month. Keep it up!`, type: "success" });
      }
    }

    // Tip 11: Emergency fund
    if (monthlyIncome > 0 && savingsGoals.length === 0) {
      tips.push({ icon: "🛡️", title: "Create an emergency fund", detail: `Financial experts recommend saving 3-6 months of expenses (${formatMoney(monthlyTotal * 3)} - ${formatMoney(monthlyTotal * 6)}). Start a savings goal!`, type: "info" });
    }

    // Tip 12: All bills paid
    if (items.length > 0 && withDue.every((item) => item.paid)) {
      tips.push({ icon: "🎉", title: "All bills paid this month!", detail: "Amazing job! You're on top of your finances.", type: "success" });
    }

    return tips;
  }, [monthlyIncome, savingsRate, balance, withDue, categoryLimitStatus, totalLateFees, inactiveSubscriptions, budgetProgress, items, last6MonthsTotals, savingsGoals, monthlyTotal, formatMoney]);


  if (showWelcomeSplash) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-md text-center">
          <img src="/images/tracker-logo.png" alt="All-in-One Bill Tracker logo" className="mx-auto h-44 w-44 drop-shadow-[0_0_35px_rgba(34,211,238,0.45)]" />
          <h1 className="mt-6 text-3xl font-semibold">All-in-One Bill Tracker</h1>
          <p className="mt-3 text-sm text-slate-300">Welcome back. Track smarter, pay on time, and keep more of your money.</p>
          <button
            onClick={() => setShowWelcomeSplash(false)}
            className="mt-6 rounded-lg border border-cyan-500 px-4 py-2 text-sm text-cyan-300"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <p className="text-sm text-slate-300">Loading your secure session...</p>
      </div>
    );
  }

  if (!currentUser) {
    const resendSecondsLeft = Math.max(0, Math.ceil((forgotPasswordResendAvailableAt - forgotPasswordNow) / 1000));

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
          <div className="mb-5 text-center">
            <img src="/images/tracker-logo.png" alt="All-in-One Bill Tracker logo" className="mx-auto h-20 w-20 rounded-2xl" />
            <h1 className="mt-4 text-2xl font-semibold">All-in-One Bill Tracker</h1>
            <p className="mt-1 text-sm text-slate-400">{authMode === "signup" ? "Create your account" : "Sign in to your account"}</p>
          </div>

          <div className="mb-4 flex rounded-lg border border-slate-700 p-1 text-sm">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`w-1/2 rounded-md px-3 py-2 ${authMode === "login" ? "bg-cyan-500 font-semibold text-slate-950" : "text-slate-300"}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              className={`w-1/2 rounded-md px-3 py-2 ${authMode === "signup" ? "bg-cyan-500 font-semibold text-slate-950" : "text-slate-300"}`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            {authMode === "signup" && (
              <input
                value={authForm.fullName}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Full name"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              />
            )}

            <input
              value={authForm.username}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="Username"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            />

            {authMode === "signup" && (
              <>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={selectedPhoneCountry}
                    onChange={(e) => setSelectedPhoneCountry(e.target.value)}
                    className="col-span-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2"
                  >
                    {PHONE_COUNTRIES_BY_REGION.map((group) => (
                      <optgroup key={group.region} label={group.region}>
                        {group.countries.map((country) => (
                          <option key={country.code} value={country.code}>
                            {countryFlag(country.code)} {country.name} ({country.dial})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input
                    inputMode="numeric"
                    value={phoneLocalNumber}
                    onChange={(e) => setPhoneLocalNumber(e.target.value)}
                    placeholder="Phone number"
                    className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Saved as:{" "}
                  {(() => {
                    const selectedCountry = PHONE_COUNTRIES.find((country) => country.code === selectedPhoneCountry) ?? PHONE_COUNTRIES[0];
                    const previewPhone = toInternationalPhone(selectedCountry.dial, phoneLocalNumber);
                    return `${countryFlag(selectedCountry.code)} ${previewPhone || "-"}`;
                  })()}
                </p>
              </>
            )}

            <div className="relative">
              <input
                type={showAuthPassword ? "text" : "password"}
                value={authForm.password}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Password"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowAuthPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 hover:text-slate-100"
                aria-label={showAuthPassword ? "Hide password" : "Show password"}
                title={showAuthPassword ? "Hide password" : "Show password"}
              >
                <EyeToggleIcon visible={showAuthPassword} />
              </button>
            </div>

            {authMode === "login" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setForgotPasswordOpen((prev) => !prev);
                    setForgotPasswordInfo("");
                    setAuthError("");
                    setForgotPasswordStep("request");
                    setForgotPasswordToken("");
                    setForgotPasswordNewPassword("");
                    setForgotPasswordResendAvailableAt(0);
                    setForgotPasswordExpiresInMinutes(null);
                    if (!forgotPasswordEmail && authForm.email) {
                      setForgotPasswordEmail(authForm.email);
                    }
                  }}
                  className="text-xs text-cyan-300"
                >
                  Forgot password?
                </button>

                {forgotPasswordOpen && (
                  <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                    <p className="text-[11px] text-slate-400">
                      Step 1: request code. Step 2: enter code + new password.
                      {forgotPasswordExpiresInMinutes ? ` Code expires in ${forgotPasswordExpiresInMinutes} minutes.` : ""}
                    </p>
                    <p className="text-xs text-slate-300">
                      {forgotPasswordStep === "request"
                        ? "Enter your account email to request a reset code."
                        : "Enter your reset code and a new password."}
                    </p>
                    <input
                      type="email"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      placeholder="Account email"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />

                    {forgotPasswordStep === "request" ? (
                      <button
                        type="button"
                        onClick={() => {
                            void handleForgotPasswordRequest(false);
                        }}
                        disabled={forgotPasswordSubmitting}
                        className="w-full rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-300 disabled:opacity-60"
                      >
                        {forgotPasswordSubmitting ? "Requesting..." : "Request reset code"}
                      </button>
                    ) : (
                      <form className="space-y-2" onSubmit={handleForgotPasswordReset}>
                        <div className="relative">
                          <input
                            type={showForgotPasswordToken ? "text" : "password"}
                            value={forgotPasswordToken}
                            onChange={(e) => setForgotPasswordToken(e.target.value)}
                            placeholder="Reset code"
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-12 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowForgotPasswordToken((prev) => !prev)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 hover:text-slate-100"
                            aria-label={showForgotPasswordToken ? "Hide reset code" : "Show reset code"}
                            title={showForgotPasswordToken ? "Hide reset code" : "Show reset code"}
                          >
                            <EyeToggleIcon visible={showForgotPasswordToken} />
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showForgotPasswordNewPassword ? "text" : "password"}
                            value={forgotPasswordNewPassword}
                            onChange={(e) => setForgotPasswordNewPassword(e.target.value)}
                            placeholder="New password"
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-12 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowForgotPasswordNewPassword((prev) => !prev)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 hover:text-slate-100"
                            aria-label={showForgotPasswordNewPassword ? "Hide new password" : "Show new password"}
                            title={showForgotPasswordNewPassword ? "Hide new password" : "Show new password"}
                          >
                            <EyeToggleIcon visible={showForgotPasswordNewPassword} />
                          </button>
                        </div>
                        <button
                          type="submit"
                          disabled={forgotPasswordSubmitting}
                          className="w-full rounded-lg border border-emerald-500 px-3 py-2 text-sm text-emerald-300 disabled:opacity-60"
                        >
                          {forgotPasswordSubmitting ? "Updating..." : "Update password"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleForgotPasswordRequest(true);
                          }}
                          disabled={forgotPasswordSubmitting || resendSecondsLeft > 0}
                          className="w-full rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-300 disabled:opacity-60"
                        >
                          {resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : "Resend code"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForgotPasswordStep("request");
                            setForgotPasswordToken("");
                            setForgotPasswordNewPassword("");
                            setForgotPasswordInfo("");
                          }}
                          className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300"
                        >
                          Back to request step
                        </button>
                      </form>
                    )}

                    {forgotPasswordInfo && <p className="text-xs text-emerald-300">{forgotPasswordInfo}</p>}
                  </div>
                )}
              </div>
            )}

            {authError && <p className="text-sm text-red-300">{authError}</p>}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authSubmitting ? "Please wait..." : authMode === "signup" ? "Create account" : "Login"}
            </button>
          </form>

          {verificationEmail && (
            <form onSubmit={handleVerifyEmail} className="mt-4 space-y-2 rounded-lg border border-violet-600/40 bg-slate-950/70 p-3">
              <p className="text-sm font-medium text-violet-300">Email verification required</p>
              <p className="text-xs text-slate-300">Enter the verification code sent to {verificationEmail}.</p>
              <input
                value={verificationEmail}
                onChange={(e) => setVerificationEmail(e.target.value)}
                placeholder="Verification email"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              />
              <div className="relative">
                <input
                  type={showVerificationCode ? "text" : "password"}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Verification code"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-12 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowVerificationCode((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 hover:text-slate-100"
                  aria-label={showVerificationCode ? "Hide verification code" : "Show verification code"}
                  title={showVerificationCode ? "Hide verification code" : "Show verification code"}
                >
                  <EyeToggleIcon visible={showVerificationCode} />
                </button>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={verificationSubmitting} className="flex-1 rounded-lg border border-violet-500 px-3 py-2 text-sm text-violet-300 disabled:opacity-60">
                  {verificationSubmitting ? "Verifying..." : "Verify email"}
                </button>
                <button type="button" onClick={() => void handleResendVerification()} disabled={verificationSubmitting} className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-60">
                  Send verification code now
                </button>
              </div>
              {verificationInfo && <p className="text-xs text-emerald-300">{verificationInfo}</p>}
            </form>
          )}
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex items-center gap-3">
            <img src="/images/tracker-logo.png" alt="App logo" className="h-12 w-12 rounded-xl" />
            <div>
              <p className="text-lg font-semibold">App Lock</p>
              <p className="text-sm text-slate-400">Enter your PIN to continue</p>
            </div>
          </div>
          <div className="relative">
            <input
              type={showPinInputValue ? "text" : "password"}
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPinInputValue((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 hover:text-slate-100"
              aria-label={showPinInputValue ? "Hide PIN" : "Show PIN"}
              title={showPinInputValue ? "Hide PIN" : "Show PIN"}
            >
              <EyeToggleIcon visible={showPinInputValue} />
            </button>
          </div>
          <button
            onClick={async () => {
              const hashedInput = await hashPin(pinInput);
              if (hashedInput === pin) {
                setLocked(false);
                setPinInput("");
              } else {
                setToastMessage("Wrong PIN.");
              }
            }}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {toastMessage && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 animate-bounce rounded-lg border border-emerald-600 bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg transition-all">
          {toastMessage}
        </div>
      )}

      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {/* ===== HEADER ===== */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <img src="/images/tracker-logo.png" alt="All-in-One Bill Tracker logo" className="h-10 w-10 rounded-xl" />
            <div>
              <h1 className="text-xl font-semibold">All-in-One Bill Tracker</h1>
              <p className="text-xs text-cyan-300">Hello {currentUser.username}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="MAD">MAD</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
            <button
              onClick={() => {
                setTheme((prev) => prev === "dark" ? "light" : "dark");
                setToastMessage(theme === "dark" ? "Light mode activated" : "Dark mode activated");
              }}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {pin && (
              <button onClick={() => setLocked(true)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">
                🔒
              </button>
            )}
            <button onClick={handleLogout} className="rounded-lg border border-red-500 px-3 py-2 text-sm text-red-300">
              Log out
            </button>
          </div>
        </header>

        <p className="mb-4 text-xs text-slate-400">
          FX rates: {fxState === "live" ? "Live" : fxState === "fallback" ? "Fallback" : "Refreshing"}
          {fxUpdatedAt ? ` · updated ${new Date(fxUpdatedAt).toLocaleString()}` : ""}
          <button type="button" onClick={() => void refreshExchangeRates()} className="ml-2 text-cyan-300">Refresh</button>
        </p>

        {subscriptionExpired && (
          <section className="mb-4 rounded-xl border border-red-500/50 bg-red-950/30 p-4">
            <p className="text-sm font-semibold text-red-200">Premium subscription expired</p>
            <p className="mt-1 text-sm text-slate-300">Your premium access has expired. Renew to restore features.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setShowPremiumPanel(true)} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950">Re-upgrade now</button>
            </div>
          </section>
        )}

        {/* ===== TAB: DASHBOARD ===== */}
        {activeTab === "dashboard" && (
          <>
            {/* 4 Stats Cards */}
            <section className="mb-6 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Monthly income</p>
                <p className="text-2xl font-semibold text-emerald-400">{formatMoney(monthlyIncome)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Monthly bills</p>
                <p className="text-2xl font-semibold text-red-400">{formatMoney(monthlyTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Balance left</p>
                <p className={`text-2xl font-semibold ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatMoney(balance)}
                </p>
                {monthlyIncome > 0 && <p className="mt-1 text-xs text-slate-400">{savingsRate}% savings rate</p>}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Upcoming in 7 days</p>
                <p className="text-2xl font-semibold text-amber-300">
                  {withDue.filter((item) => !item.paid && item.daysUntil >= 0 && item.daysUntil <= 7).length}
                </p>
              </div>
            </section>

                        {/* Quick Actions */}
            <section className="mb-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  onClick={() => setActiveTab("bills")}
                  className="flex flex-col items-center gap-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-300 transition-all hover:bg-cyan-500/20 active:scale-95"
                >
                  <span className="text-xl">➕</span>
                  <span className="font-medium">Add Bill</span>
                </button>
                <button
                  onClick={() => {
                    const unpaid = items.filter((item) => !isPaidThisMonth(item));
                    if (unpaid.length === 0) {
                      setToastMessage("All bills are already paid!");
                      return;
                    }
                    unpaid.forEach((item) => markPaid(item.id));
                    setToastMessage(`${unpaid.length} bill${unpaid.length > 1 ? "s" : ""} marked as paid!`);
                  }}
                  className="flex flex-col items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95"
                >
                  <span className="text-xl">✅</span>
                  <span className="font-medium">Mark All Paid</span>
                </button>
                <button
                  onClick={exportBackup}
                  className="flex flex-col items-center gap-1 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm text-violet-300 transition-all hover:bg-violet-500/20 active:scale-95"
                >
                  <span className="text-xl">💾</span>
                  <span className="font-medium">Export Backup</span>
                </button>
                <button
                  onClick={() => void refreshExchangeRates()}
                  className="flex flex-col items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300 transition-all hover:bg-amber-500/20 active:scale-95"
                >
                  <span className="text-xl">🔄</span>
                  <span className="font-medium">Refresh Rates</span>
                </button>
              </div>
            </section>

            {/* Financial Health */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">💯 Financial Health</h2>
                <div className="text-right">
                  <span className="text-3xl font-bold" style={{ color: financialHealth.color }}>{financialHealth.score}</span>
                  <span className="text-sm text-slate-400">/100</span>
                </div>
              </div>
              <div className="mb-3">
                <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-4 rounded-full transition-all duration-700" style={{ width: `${financialHealth.score}%`, backgroundColor: financialHealth.color }} />
                </div>
                <div className="mt-1 flex justify-between text-xs">
                  <span style={{ color: financialHealth.color }} className="font-medium">{financialHealth.level}</span>
                  <span className="text-slate-500">{financialHealth.score >= 80 ? "🌟 Keep it up!" : financialHealth.score >= 60 ? "👍 Doing well" : "💪 Room for improvement"}</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-5">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="text-xs text-slate-400">Savings</p>
                  <p className={`text-sm font-bold ${savingsRate >= 20 ? "text-emerald-400" : savingsRate > 0 ? "text-amber-400" : "text-red-400"}`}>{savingsRate >= 20 ? "✓" : savingsRate > 0 ? "⚡" : "✗"} {savingsRate}%</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="text-xs text-slate-400">Budget</p>
                  <p className={`text-sm font-bold ${budgetProgress <= 80 ? "text-emerald-400" : budgetProgress <= 100 ? "text-amber-400" : "text-red-400"}`}>{budgetProgress <= 80 ? "✓" : budgetProgress <= 100 ? "⚡" : "✗"} {budgetProgress.toFixed(0)}%</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="text-xs text-slate-400">Paid</p>
                  <p className="text-sm font-bold text-slate-300">{items.length > 0 ? `${items.filter((item) => isPaidThisMonth(item)).length}/${items.length}` : "-"}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="text-xs text-slate-400">Overdue</p>
                  <p className={`text-sm font-bold ${withDue.filter((item) => !item.paid && item.daysUntil < 0).length === 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {withDue.filter((item) => !item.paid && item.daysUntil < 0).length === 0 ? "✓ 0" : `✗ ${withDue.filter((item) => !item.paid && item.daysUntil < 0).length}`}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="text-xs text-slate-400">Setup</p>
                  <p className={`text-sm font-bold ${[monthlyIncome > 0, budget > 0, savingsGoals.length > 0, categoryLimits.length > 0].filter(Boolean).length >= 3 ? "text-emerald-400" : "text-amber-400"}`}>
                    {[monthlyIncome > 0, budget > 0, savingsGoals.length > 0, categoryLimits.length > 0].filter(Boolean).length}/4
                  </p>
                </div>
              </div>
              {financialHealth.tips.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-slate-400">💡 To improve:</p>
                  {financialHealth.tips.map((tip, idx) => (
                    <p key={idx} className="text-xs text-slate-300">• {tip}</p>
                  ))}
                </div>
              )}
            </section>

            {/* Smart Tips */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">💡 Smart Tips</h2>
              {smartTips.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-3xl">💡</p>
                  <p className="mt-2 text-sm text-slate-400">Add bills and income to get personalized tips!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {smartTips.map((tip, idx) => (
                    <div key={idx} className={`rounded-lg border p-3 ${tip.type === "danger" ? "border-red-500/40 bg-red-950/30" : tip.type === "warning" ? "border-amber-500/40 bg-amber-950/30" : tip.type === "success" ? "border-emerald-500/40 bg-emerald-950/30" : "border-cyan-500/40 bg-cyan-950/30"}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{tip.icon}</span>
                        <div>
                          <p className={`text-sm font-medium ${tip.type === "danger" ? "text-red-200" : tip.type === "warning" ? "text-amber-200" : tip.type === "success" ? "text-emerald-200" : "text-cyan-200"}`}>{tip.title}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{tip.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Calendar */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">📅 Payment Calendar</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setCalendarMonth((prev) => { const m = prev.month === 0 ? 11 : prev.month - 1; const y = prev.month === 0 ? prev.year - 1 : prev.year; return { year: y, month: m }; }); setSelectedCalDay(null); }} className="rounded-lg border border-slate-700 px-2 py-1 text-sm hover:bg-slate-800">◀</button>
                  <span className="text-sm font-medium">{new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString("en", { month: "long", year: "numeric" })}</span>
                  <button onClick={() => { setCalendarMonth((prev) => { const m = prev.month === 11 ? 0 : prev.month + 1; const y = prev.month === 11 ? prev.year + 1 : prev.year; return { year: y, month: m }; }); setSelectedCalDay(null); }} className="rounded-lg border border-slate-700 px-2 py-1 text-sm hover:bg-slate-800">▶</button>
                  <button onClick={() => { const now = new Date(); setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() }); setSelectedCalDay(null); }} className="rounded-lg border border-cyan-500 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/20">Today</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                  <div key={d} className="py-1 font-medium text-slate-400">{d}</div>
                ))}
                {calendarDays.map((cell, idx) => {
                  const today = new Date();
                  const isToday = cell.isCurrentMonth && cell.day === today.getDate() && calendarMonth.month === today.getMonth() && calendarMonth.year === today.getFullYear();
                  const hasBills = cell.items.length > 0;
                  const allPaid = hasBills && cell.items.every((item: typeof withDue[0]) => item.paid);
                  const hasUnpaid = hasBills && cell.items.some((item: typeof withDue[0]) => !item.paid);
                  const hasDueSoon = hasBills && cell.items.some((item: typeof withDue[0]) => !item.paid && item.daysUntil >= 0 && item.daysUntil <= 3);
                  const isSelected = cell.isCurrentMonth && cell.day === selectedCalDay;
                  return (
                    <button key={idx} onClick={() => cell.isCurrentMonth ? setSelectedCalDay(cell.day === selectedCalDay ? null : cell.day) : undefined} className={`relative rounded-lg p-1.5 text-sm transition-all ${!cell.isCurrentMonth ? "text-slate-700" : isSelected ? "bg-cyan-500/30 ring-1 ring-cyan-400 text-cyan-200" : isToday ? "bg-slate-800 font-bold text-white" : "text-slate-300 hover:bg-slate-800"}`}>
                      {cell.day}
                      {hasBills && cell.isCurrentMonth && (
                        <div className="mt-0.5 flex justify-center gap-0.5">
                          {allPaid ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> : hasDueSoon ? <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> : hasUnpaid ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Paid</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Upcoming</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" /> Due soon</span>
              </div>
              {selectedCalDay !== null && (
                <div className="mt-3 border-t border-slate-800 pt-3">
                  <h3 className="text-sm font-medium text-slate-300">Bills due on day {selectedCalDay}:</h3>
                  {calendarBillsForDay.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">No bills due on this day.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {calendarBillsForDay.map((item: typeof withDue[0]) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-2">
                          <div>
                            <p className="text-sm font-medium">{item.type === "bill" ? "💡 " : "🔄 "}{item.name}</p>
                            <p className="text-xs text-slate-400">{item.category} · {formatMoney(item.amount)}</p>
                          </div>
                          <span className={`text-xs ${item.paid ? "text-emerald-400" : item.daysUntil <= 3 ? "text-red-400" : "text-amber-400"}`}>{item.paid ? "✓ Paid" : `${item.daysUntil} day(s)`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* ===== TAB: BILLS ===== */}
        {activeTab === "bills" && (
          <>
            {/* Smart Add Form */}
            <section className="mb-6">
              <form onSubmit={onAddItem} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="text-lg font-semibold">{editingItemId ? "Edit item" : "Smart Add"}</h2>
                <div className="flex flex-wrap gap-2">
                  {templates.map((template) => (
                    <button key={template.name} type="button" onClick={() => applyTemplate(template)} className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200">{template.name}</button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                  <div className="space-y-2">
                    <input type="number" min={0} step="0.01" value={form.amount > 0 ? Number(fromMAD(form.amount, currency, currencyToMAD).toFixed(2)) : ""} onChange={(e) => setForm((prev) => ({ ...prev, amount: toMAD(Number(e.target.value || 0), currency, currencyToMAD) }))} placeholder={`Amount (${currency})`} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                    <div className="flex flex-wrap gap-1">
                      {[50, 100, 200, 300, 500, 1000].map((preset) => (
                        <button key={preset} type="button" onClick={() => setForm((prev) => ({ ...prev, amount: toMAD(preset, currency, currencyToMAD) }))} className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800">{preset}</button>
                      ))}
                    </div>
                  </div>
                  <input type="number" min={1} max={31} value={form.dueDay > 0 ? form.dueDay : ""} onChange={(e) => setForm((prev) => ({ ...prev, dueDay: Number(e.target.value || 0) }))} placeholder="Due day" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                  <input value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                  <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ItemType }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                    <option value="bill">Bill</option>
                    <option value="subscription">Subscription</option>
                  </select>
                  <input type="number" min={0} max={20} value={form.reminderDays >= 0 ? form.reminderDays : ""} onChange={(e) => setForm((prev) => ({ ...prev, reminderDays: e.target.value === "" ? -1 : Number(e.target.value) }))} placeholder="Reminder days" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">{editingItemId ? "Save changes" : "Add item"}</button>
                  <button type="button" onClick={saveTemplate} className="rounded-lg border border-slate-600 px-4 py-2">Save as template</button>
                  {editingItemId && <button type="button" onClick={resetForm} className="rounded-lg border border-slate-600 px-4 py-2">Cancel edit</button>}
                </div>
              </form>
            </section>

            {/* Search & Filter */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Search & Filter</h2>
              <div className="grid gap-3 sm:grid-cols-4">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                  <option value="all">All</option>
                  <option value="dueSoon">Due soon</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                  <option value="all">All categories</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <button onClick={() => { setSearch(""); setStatusFilter("all"); setCategoryFilter("all"); }} className="rounded-lg border border-slate-700 px-3 py-2">Reset</button>
              </div>
            </section>

            {/* Bills List */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Bills & Subscriptions</h2>
                {filtered.some((item) => !item.paid) && (
                  <button onClick={() => { filtered.filter((item) => !item.paid).forEach((item) => markPaid(item.id)); setToastMessage("All visible items marked as paid."); }} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-transform">✓ Mark all visible as paid</button>
                )}
              </div>
              <div className="space-y-3">
                {filtered.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div>
                      <p className="font-medium">{item.type === "bill" ? "💡 " : "🔄 "}{item.name}</p>
                      {inlineEditId === item.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <input type="number" min={0} step="0.01" value={inlineDraft.amount} onChange={(e) => setInlineDraft((prev) => ({ ...prev, amount: e.target.value }))} className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1" />
                          <input type="number" min={1} max={31} value={inlineDraft.dueDay} onChange={(e) => setInlineDraft((prev) => ({ ...prev, dueDay: e.target.value }))} className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1" />
                          <span className="text-slate-400">{item.category}</span>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">{formatMoney(item.amount)} · due day {item.dueDay} · {item.category}</p>
                      )}
                      <div className="flex items-center gap-3">
                        <p className={`text-xs ${item.paid ? "text-emerald-400" : item.daysUntil <= 2 ? "text-red-400" : "text-slate-400"}`}>{item.paid ? "✓ Paid this month" : `Due in ${item.daysUntil} day(s)`}</p>
                        {item.lastPaidAt && <p className="text-xs text-slate-500">Last paid: {new Date(item.lastPaidAt).toLocaleDateString()}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {inlineEditId === item.id ? (
                        <>
                          <button onClick={() => saveInlineEdit(item.id)} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Save</button>
                          <button onClick={cancelInlineEdit} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startInlineEdit(item.id)} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300">Quick edit</button>
                          <button onClick={() => startEditItem(item.id)} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300">Edit</button>
                        </>
                      )}
                      {!item.paid && <button onClick={() => markPaid(item.id)} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 active:scale-95 transition-transform">✓ Mark paid</button>}
                      <button onClick={() => { if (confirm(`Delete "${item.name}"? This cannot be undone.`)) { removeItem(item.id); } }} className="rounded-lg border border-red-700 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 active:scale-95 transition-transform">Delete</button>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-4xl">📋</p>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-slate-400">{items.length === 0 ? "No bills yet. Use Smart Add above to add your first bill, or tap a template to get started!" : "No items match this filter."}</p>
                      {items.length === 0 && (
                        <button onClick={() => { setItems(seedItems); setToastMessage("Sample bills added! Edit them to match your real bills."); }} className="rounded-lg border border-cyan-500 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">Add sample bills to get started</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Payment History */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">📋 Payment History</h2>

              {items.length === 0 ? (
                <p className="text-sm text-slate-400">No bills yet.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => {
                    const itemHistory = paymentHistory.filter((ph) => ph.itemId === item.id);
                    const isExpanded = paymentHistoryItem === item.id;
                    return (
                      <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950">
                        <button
                          onClick={() => setPaymentHistoryItem(isExpanded ? null : item.id)}
                          className="flex w-full items-center justify-between p-3 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span>{item.type === "bill" ? "💡" : "🔄"}</span>
                            <span className="text-sm font-medium">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">{itemHistory.length} payment{itemHistory.length !== 1 ? "s" : ""}</span>
                            <span className={`text-xs transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-slate-800 p-3">
                            {itemHistory.length === 0 ? (
                              <p className="text-xs text-slate-500">No payment history recorded yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {itemHistory.slice(0, 12).map((ph) => (
                                  <div key={ph.id} className="flex items-center justify-between text-xs">
                                    <span className="text-emerald-400">✅ Paid</span>
                                    <span className="text-slate-300">{formatMoney(ph.amount)}</span>
                                    <span className="text-slate-500">{new Date(ph.paidAt).toLocaleDateString()}</span>
                                  </div>
                                ))}
                                {itemHistory.length > 12 && (
                                  <p className="text-xs text-slate-500">...and {itemHistory.length - 12} more</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

          </>
        )}

        {/* ===== TAB: ANALYTICS ===== */}
        {activeTab === "analytics" && (
          <>
            {/* Income vs Expenses + 6 Month Trend */}
            <section className="mb-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-lg font-semibold">📈 Income vs Expenses</h2>
                {monthlyIncome === 0 && monthlyTotal === 0 ? (
                  <p className="text-sm text-slate-400">Add income and bills to see the comparison.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-end gap-4">
                      <div className="flex flex-1 flex-col items-center">
                        <div className="w-full overflow-hidden rounded-t-lg bg-slate-800" style={{ height: "160px" }}>
                          <div className="w-full rounded-t-lg transition-all duration-700" style={{ height: `${monthlyIncome > 0 ? Math.max(8, (monthlyIncome / Math.max(monthlyIncome, monthlyTotal)) * 100) : 0}%`, backgroundColor: "#10b981" }} />
                        </div>
                        <p className="mt-2 text-xs font-medium text-emerald-400">Income</p>
                        <p className="text-sm font-semibold text-emerald-400">{formatMoney(monthlyIncome)}</p>
                      </div>
                      <div className="flex flex-1 flex-col items-center">
                        <div className="w-full overflow-hidden rounded-t-lg bg-slate-800" style={{ height: "160px" }}>
                          <div className="w-full rounded-t-lg transition-all duration-700" style={{ height: `${monthlyTotal > 0 ? Math.max(8, (monthlyTotal / Math.max(monthlyIncome, monthlyTotal)) * 100) : 0}%`, backgroundColor: "#ef4444" }} />
                        </div>
                        <p className="mt-2 text-xs font-medium text-red-400">Expenses</p>
                        <p className="text-sm font-semibold text-red-400">{formatMoney(monthlyTotal)}</p>
                      </div>
                      <div className="flex flex-1 flex-col items-center">
                        <div className="w-full overflow-hidden rounded-t-lg bg-slate-800" style={{ height: "160px" }}>
                          <div className="w-full rounded-t-lg transition-all duration-700" style={{ height: `${balance >= 0 && Math.max(monthlyIncome, monthlyTotal) > 0 ? Math.max(8, (balance / Math.max(monthlyIncome, monthlyTotal)) * 100) : 0}%`, backgroundColor: balance >= 0 ? "#06b6d4" : "#ef4444" }} />
                        </div>
                        <p className="mt-2 text-xs font-medium text-cyan-400">Balance</p>
                        <p className={`text-sm font-semibold ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatMoney(balance)}</p>
                      </div>
                    </div>
                    {monthlyIncome > 0 && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                        <p className="font-medium text-cyan-300">💡 Insight</p>
                        <p className="mt-1 text-slate-300">{balance >= 0 ? `You have ${formatMoney(balance)} left this month. Savings rate: ${savingsRate}%.` : `You are ${formatMoney(Math.abs(balance))} over budget. Consider reducing expenses.`}</p>
                        {savingsRate >= 20 && balance >= 0 && <p className="mt-1 text-xs text-emerald-300">🌟 Great job! Financial experts recommend saving at least 20%.</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-lg font-semibold">📉 6-Month Trend</h2>
                {last6MonthsTotals.every((m) => m.total === 0) ? (
                  <p className="text-sm text-slate-400">Trend data will appear after a few months.</p>
                ) : (
                  <div className="flex items-end gap-2" style={{ height: "180px" }}>
                    {last6MonthsTotals.map((m, idx) => {
                      const maxTotal = Math.max(...last6MonthsTotals.map((x) => x.total), 1);
                      const height = Math.max(8, (m.total / maxTotal) * 100);
                      const isCurrentMonth = idx === 5;
                      return (
                        <div key={idx} className="flex flex-1 flex-col items-center">
                          <div className="relative w-full overflow-hidden rounded-t bg-slate-800" style={{ height: "150px" }}>
                            <div className="absolute bottom-0 w-full rounded-t transition-all duration-500" style={{ height: `${height}%`, backgroundColor: isCurrentMonth ? "#06b6d4" : "#475569" }} />
                          </div>
                          <p className={`mt-1 text-xs ${isCurrentMonth ? "font-bold text-cyan-300" : "text-slate-500"}`}>{m.label}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Expense by Category */}
            <section className="mb-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-lg font-semibold">📊 Expense by Category</h2>
                {categoryTotals.length === 0 ? (
                  <p className="text-sm text-slate-400">No expenses yet.</p>
                ) : (
                  <div className="space-y-3">
                    {categoryTotals.map(([category, total]) => {
                      const ratio = monthlyTotal > 0 ? (total / monthlyTotal) * 100 : 0;
                      const color = getCategoryColor(category);
                      return (
                        <div key={category}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{category}</span>
                            <span className="text-slate-300">{formatMoney(total)} <span className="text-xs text-slate-500">({ratio.toFixed(0)}%)</span></span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${Math.max(4, ratio)}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <div className="flex justify-between text-sm font-medium"><span>Total</span><span>{formatMoney(monthlyTotal)}</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Category Limits */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-lg font-semibold">🏷️ Category Spending Limits</h2>
                {categoryLimitStatus.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-3xl">🏷️</p>
                    <p className="mt-2 text-sm text-slate-400">Set spending limits per category.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categoryLimitStatus.map((cl) => {
                      const color = getCategoryColor(cl.category);
                      return (
                        <div key={cl.category} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /><span className="text-sm font-medium">{cl.category}</span></div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${cl.status === "over" ? "text-red-400" : cl.status === "warning" ? "text-amber-400" : "text-emerald-400"}`}>{formatMoney(cl.spent)} / {formatMoney(cl.limit)}</span>
                              <button onClick={() => removeCategoryLimit(cl.category)} className="text-xs text-red-300 hover:text-red-200">✕</button>
                            </div>
                          </div>
                          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800">
                            <div className={`h-3 rounded-full transition-all duration-500 ${cl.status === "over" ? "bg-red-500" : cl.status === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(Math.max(4, cl.percent), 100)}%` }} />
                          </div>
                          <div className="mt-1 flex justify-between text-xs">
                            <span className={cl.status === "over" ? "text-red-400 font-medium" : cl.status === "warning" ? "text-amber-400" : "text-slate-500"}>{cl.status === "over" ? "⚠️ OVER LIMIT!" : cl.status === "warning" ? "⚡ Approaching limit" : `${cl.percent}% used`}</span>
                            <span className="text-slate-500">{cl.spent <= cl.limit ? `${formatMoney(cl.limit - cl.spent)} left` : `${formatMoney(cl.spent - cl.limit)} over`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3 sm:grid-cols-3">
                  <select value={newLimitCategory} onChange={(e) => setNewLimitCategory(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                    <option value="">Select category</option>
                    {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" min={0} step="0.01" value={newLimitAmount > 0 ? Number(fromMAD(newLimitAmount, currency, currencyToMAD).toFixed(2)) : ""} onChange={(e) => setNewLimitAmount(toMAD(Number(e.target.value || 0), currency, currencyToMAD))} placeholder={`Limit (${currency})`} className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                    <button onClick={addCategoryLimit} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Set</button>
                  </div>
                </div>
              </div>
            </section>

            {/* Late Fee Calculator */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">⚠️ Late Fee Calculator</h2>
              {lateFeeRules.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-3xl">⚠️</p>
                  <p className="mt-2 text-sm text-slate-400">Track late fees for overdue bills.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {lateFeeRules.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-2">
                        <div><p className="text-sm font-medium">{rule.name}</p><p className="text-xs text-slate-400">{formatMoney(rule.feePerDay)}/day after {rule.graceDays} grace day{rule.graceDays !== 1 ? "s" : ""}</p></div>
                        <button onClick={() => removeLateFeeRule(rule.id)} className="text-xs text-red-300 hover:text-red-200">✕</button>
                      </div>
                    ))}
                  </div>
                  {lateFeeExposure.length > 0 ? (
                    <div className="space-y-2">
                      {lateFeeExposure.map(({ item, overdueDays, fee }) => (
                        <div key={item.id} className="rounded-lg border border-red-500/30 bg-red-950/30 p-3">
                          <div className="flex items-center justify-between">
                            <div><p className="text-sm font-medium text-red-200">{item.name}</p><p className="text-xs text-slate-400">{overdueDays} day{overdueDays !== 1 ? "s" : ""} overdue</p></div>
                            <div className="text-right"><p className="text-sm font-bold text-red-400">+{formatMoney(fee)}</p></div>
                          </div>
                        </div>
                      ))}
                      <div className="rounded-lg border border-red-500/40 bg-slate-950 p-3">
                        <div className="flex justify-between text-sm"><span className="font-medium text-red-300">Total potential fees</span><span className="font-bold text-red-400">{formatMoney(totalLateFees)}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-center"><p className="text-sm text-emerald-300">✅ No overdue bills with fees!</p></div>
                  )}
                </div>
              )}
              <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3 sm:grid-cols-4">
                <input value={lateFeeForm.name} onChange={(e) => setLateFeeForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Bill name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <input type="number" min={0} step="0.01" value={lateFeeForm.feePerDay > 0 ? Number(fromMAD(lateFeeForm.feePerDay, currency, currencyToMAD).toFixed(2)) : ""} onChange={(e) => setLateFeeForm((prev) => ({ ...prev, feePerDay: toMAD(Number(e.target.value || 0), currency, currencyToMAD) }))} placeholder={`Fee/day (${currency})`} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <input type="number" min={0} max={30} value={lateFeeForm.graceDays || ""} onChange={(e) => setLateFeeForm((prev) => ({ ...prev, graceDays: Number(e.target.value || 0) }))} placeholder="Grace days" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <button onClick={addLateFeeRule} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Add Rule</button>
              </div>
            </section>
          </>
        )}

        {/* ===== TAB: GOALS ===== */}
        {activeTab === "goals" && (
          <>
            {/* Income */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">💰 Monthly Income</h2>
              <div className="grid gap-2 sm:grid-cols-3">
                <input value={incomeForm.label} onChange={(e) => setIncomeForm((prev) => ({ ...prev, label: e.target.value }))} placeholder="Income label" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <input type="number" min={0} step="0.01" value={incomeForm.amount > 0 ? Number(fromMAD(incomeForm.amount, currency, currencyToMAD).toFixed(2)) : ""} onChange={(e) => setIncomeForm((prev) => ({ ...prev, amount: toMAD(Number(e.target.value || 0), currency, currencyToMAD) }))} placeholder={`Amount (${currency})`} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <div className="flex gap-2">
                  <select value={incomeForm.category} onChange={(e) => setIncomeForm((prev) => ({ ...prev, category: e.target.value }))} className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                    <option value="Salary">Salary</option><option value="Freelance">Freelance</option><option value="Business">Business</option><option value="Investment">Investment</option><option value="Gift">Gift</option><option value="Other">Other</option>
                  </select>
                  <button onClick={addIncome} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Add</button>
                </div>
              </div>
              {incomes.length > 0 && (
                <div className="mt-3 space-y-2">
                  {incomes.map((inc) => (
                    <div key={inc.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-2">
                      <div><p className="text-sm font-medium">{inc.label}</p><p className="text-xs text-slate-400">{inc.category}</p></div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-emerald-400">{formatMoney(inc.amount)}</span>
                        <button onClick={() => removeIncome(inc.id)} className="text-xs text-red-300 hover:text-red-200">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Accounts */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">🏦 Accounts</h2>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total Balance</p>
                  <p className={`text-lg font-bold ${totalAccountBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatMoney(totalAccountBalance)}</p>
                </div>
              </div>
              {accounts.length > 0 && (
                <div className="space-y-2">
                  {accounts.map((acc) => {
                    const typeIcon = acc.type === "cash" ? "💵" : acc.type === "bank" ? "🏦" : acc.type === "card" ? "💳" : acc.type === "mobile" ? "📱" : "💰";
                    return (
                      <div key={acc.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full text-lg" style={{ backgroundColor: acc.color + "30" }}>{typeIcon}</div>
                          <div><p className="text-sm font-medium">{acc.name}</p><p className="text-xs text-slate-400 capitalize">{acc.type}</p></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { const input = prompt(`Update balance for "${acc.name}" (${currency}):`, String(fromMAD(acc.balance, currency, currencyToMAD).toFixed(2))); if (input !== null) { const val = toMAD(Number(input), currency, currencyToMAD); if (Number.isFinite(val)) updateAccountBalance(acc.id, val); } }} className={`text-sm font-bold ${acc.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatMoney(acc.balance)}</button>
                          <button onClick={() => removeAccount(acc.id)} className="text-xs text-red-300 hover:text-red-200">✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3 sm:grid-cols-5">
                <input value={accountForm.name} onChange={(e) => setAccountForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Account name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <select value={accountForm.type} onChange={(e) => setAccountForm((prev) => ({ ...prev, type: e.target.value as Account["type"] }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                  <option value="cash">💵 Cash</option><option value="bank">🏦 Bank</option><option value="card">💳 Card</option><option value="mobile">📱 Mobile</option><option value="other">💰 Other</option>
                </select>
                <input type="number" min={0} step="0.01" value={accountForm.balance > 0 ? Number(fromMAD(accountForm.balance, currency, currencyToMAD).toFixed(2)) : ""} onChange={(e) => setAccountForm((prev) => ({ ...prev, balance: toMAD(Number(e.target.value || 0), currency, currencyToMAD) }))} placeholder={`Balance (${currency})`} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <div className="flex items-center gap-2"><label className="text-xs text-slate-400">Color</label><input type="color" value={accountForm.color} onChange={(e) => setAccountForm((prev) => ({ ...prev, color: e.target.value }))} className="h-9 w-9 cursor-pointer rounded border border-slate-700" /></div>
                <button onClick={addAccount} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Add</button>
              </div>
            </section>

            {/* Budget Guard + Savings Goals */}
            <section className="mb-6 grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="text-lg font-semibold">Budget Guard</h2>
                <label className="text-sm text-slate-400">Monthly budget</label>
                <input type="number" min={0} value={budget > 0 ? Number(fromMAD(budget, currency, currencyToMAD).toFixed(2)) : ""} onChange={(e) => setBudget(toMAD(Number(e.target.value || 0), currency, currencyToMAD))} placeholder={`Budget (${currency})`} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full ${budgetProgress >= 100 ? "bg-red-500" : budgetProgress >= 80 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${Math.max(6, Math.min(budgetProgress, 100))}%` }} />
                </div>
                <p className="text-sm text-slate-300">{budget > 0 ? `${budgetProgress.toFixed(0)}% of budget used` : "Set a budget to track spending."}</p>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  <p className="font-medium text-emerald-300">Potential savings</p>
                  <p className="mt-1 text-slate-300">Monthly: {formatMoney(inactiveSubscriptions.reduce((sum, item) => sum + item.amount, 0))}</p>
                  <p className="text-slate-400">Yearly: {formatMoney(inactiveSubscriptions.reduce((sum, item) => sum + item.amount, 0) * 12)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-3 text-lg font-semibold">🎯 Savings Goals</h2>
                {savingsGoals.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-3xl">🎯</p>
                    <p className="mt-2 text-sm text-slate-400">Set a savings goal!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savingsGoals.map((goal) => {
                      const progress = goal.targetAmount > 0 ? Math.min((goal.savedAmount / goal.targetAmount) * 100, 100) : 0;
                      const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
                      const isComplete = goal.savedAmount >= goal.targetAmount;
                      return (
                        <div key={goal.id} className={`rounded-lg border p-3 ${isComplete ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-800 bg-slate-950"}`}>
                          <div className="flex items-center justify-between">
                            <div><p className="font-medium">{isComplete ? "✅ " : "🎯 "}{goal.label}</p><p className="text-xs text-slate-400">{formatMoney(goal.savedAmount)} / {formatMoney(goal.targetAmount)}</p></div>
                            <div className="flex items-center gap-2">
                              {!isComplete && <button onClick={() => { const input = prompt(`Add to "${goal.label}" (${currency}):`, "100"); if (input) { const val = toMAD(Number(input), currency, currencyToMAD); if (val > 0) addToSavings(goal.id, val); } }} className="rounded-lg border border-cyan-500 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/20">+ Add</button>}
                              <button onClick={() => removeSavingsGoal(goal.id)} className="text-xs text-red-300 hover:text-red-200">✕</button>
                            </div>
                          </div>
                          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800">
                            <div className={`h-3 rounded-full transition-all duration-500 ${isComplete ? "bg-emerald-500" : progress >= 75 ? "bg-cyan-500" : progress >= 50 ? "bg-amber-500" : "bg-violet-500"}`} style={{ width: `${Math.max(4, progress)}%` }} />
                          </div>
                          <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{progress.toFixed(0)}%</span><span>{isComplete ? "🎉" : `${formatMoney(remaining)} left`}</span></div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3 sm:grid-cols-4">
                  <input value={savingsForm.label} onChange={(e) => setSavingsForm((prev) => ({ ...prev, label: e.target.value }))} placeholder="Goal name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                  <input type="number" min={0} step="0.01" value={savingsForm.targetAmount > 0 ? Number(fromMAD(savingsForm.targetAmount, currency, currencyToMAD).toFixed(2)) : ""} onChange={(e) => setSavingsForm((prev) => ({ ...prev, targetAmount: toMAD(Number(e.target.value || 0), currency, currencyToMAD) }))} placeholder={`Target (${currency})`} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                  <div className="flex gap-2">
                    <input type="date" value={savingsForm.deadline} onChange={(e) => setSavingsForm((prev) => ({ ...prev, deadline: e.target.value }))} className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
                    <button onClick={addSavingsGoal} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Add</button>
                  </div>
                </div>
              </div>
            </section>

                        {/* Savings Projections */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">📈 Savings Projections</h2>

              {savingsGoals.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-3xl">📈</p>
                  <p className="mt-2 text-sm text-slate-400">Create savings goals to see projections.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savingsGoals.filter((g) => g.savedAmount < g.targetAmount).map((goal) => {
                    const remaining = goal.targetAmount - goal.savedAmount;
                    const progress = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;

                    const monthlySavingsOptions = [
                      fromMAD(Math.round(remaining / 3), currency, currencyToMAD),
                      fromMAD(Math.round(remaining / 6), currency, currencyToMAD),
                      fromMAD(Math.round(remaining / 12), currency, currencyToMAD),
                    ].map((v) => Math.round(v));

                    const deadlineDate = goal.deadline ? new Date(goal.deadline) : null;
                    const monthsLeft = deadlineDate ? Math.max(1, Math.ceil((deadlineDate.getTime() - Date.now()) / (30 * DAY_MS))) : null;
                    const suggestedMonthly = monthsLeft ? fromMAD(Math.ceil(remaining / monthsLeft), currency, currencyToMAD) : null;

                    return (
                      <div key={goal.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">🎯 {goal.label}</p>
                            <p className="text-xs text-slate-400">
                              {formatMoney(remaining)} remaining ({progress.toFixed(0)}% done)
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-cyan-300">{formatMoney(goal.targetAmount)}</p>
                            <p className="text-xs text-slate-500">target</p>
                          </div>
                        </div>

                        {monthsLeft && (
                          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-xs">
                            <p className="font-medium text-amber-300">
                              ⏰ {monthsLeft} month{monthsLeft !== 1 ? "s" : ""} until deadline
                            </p>
                            {suggestedMonthly && (
                              <p className="mt-1 text-slate-300">
                                Save <span className="font-bold text-amber-300">{Math.round(suggestedMonthly)} {currency}</span>/month to reach your goal on time
                              </p>
                            )}
                          </div>
                        )}

                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-slate-400">How fast can you reach it?</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-2 text-center">
                              <p className="text-xs text-slate-400">In 3 months</p>
                              <p className="text-sm font-bold text-cyan-300">{Math.round(monthlySavingsOptions[0])} <span className="text-xs font-normal text-slate-400">{currency}/mo</span></p>
                            </div>
                            <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-2 text-center">
                              <p className="text-xs text-slate-400">In 6 months</p>
                              <p className="text-sm font-bold text-violet-300">{Math.round(monthlySavingsOptions[1])} <span className="text-xs font-normal text-slate-400">{currency}/mo</span></p>
                            </div>
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2 text-center">
                              <p className="text-xs text-slate-400">In 12 months</p>
                              <p className="text-sm font-bold text-emerald-300">{Math.round(monthlySavingsOptions[2])} <span className="text-xs font-normal text-slate-400">{currency}/mo</span></p>
                            </div>
                          </div>
                        </div>

                        {balance > 0 && (
                          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs">
                            <p className="text-slate-400">
                              💡 Your current monthly balance is <span className="font-medium text-emerald-400">{formatMoney(balance)}</span>.
                              {balance >= remaining
                                ? " You have enough to complete this goal now!"
                                : balance >= remaining / 3
                                  ? " You could reach this goal in 3 months easily!"
                                  : balance >= remaining / 6
                                    ? " You can comfortably save for this goal in 6 months."
                                    : " Consider reducing expenses to save more."}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {savingsGoals.every((g) => g.savedAmount >= g.targetAmount) && (
                    <div className="py-4 text-center">
                      <p className="text-3xl">🎉</p>
                      <p className="mt-2 text-sm text-emerald-300">All goals reached! Create new ones to keep saving.</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* ===== TAB: SETTINGS ===== */}
        {activeTab === "settings" && (
          <>
            {showPremiumPanel && (
              <section className="mb-6 rounded-xl border border-amber-500/40 bg-slate-900 p-4">
                <h2 className="text-lg font-semibold text-amber-300">Premium Plans</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => openPlaySubscription("premium_monthly")} className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-left transition hover:border-cyan-400"><p className="text-sm font-medium">Monthly</p><p className="text-sm text-cyan-300">{formatMoney(RECOMMENDED_PRICES_MAD.monthly)} / month</p></button>
                  <button type="button" onClick={() => openPlaySubscription("premium_yearly")} className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-left transition hover:border-cyan-400"><p className="text-sm font-medium">Yearly</p><p className="text-sm text-cyan-300">{formatMoney(RECOMMENDED_PRICES_MAD.yearly)} / year</p><p className="text-xs text-emerald-300">Save {yearlyDiscountPercent}%</p></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setShowPremiumPanel(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Close</button></div>
              </section>
            )}

            {/* Subscription Status */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-lg font-semibold">Subscription Status</h2>
              <p className="mt-2 text-sm text-slate-300">Status: {entitlement.loading ? "Checking" : canUsePremiumFeatures ? "Premium active" : "Free plan"}{entitlement.productId ? ` · ${entitlement.productId}` : ""}{entitlement.expiresAt ? ` · Renewal ${new Date(entitlement.expiresAt).toLocaleDateString()}` : ""}</p>
              {entitlement.error && <p className="mt-1 text-xs text-red-300">{entitlement.error}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => window.open(PLAY_SUBSCRIPTION_MANAGE_URL, "_blank")} className="rounded-lg border border-violet-500 px-3 py-2 text-sm text-violet-300">Manage on Google Play</button>
                <button onClick={() => void refreshEntitlement()} className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-300">Refresh</button>
                {!canUsePremiumFeatures && <button onClick={() => setShowPremiumPanel(true)} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950">Upgrade</button>}
              </div>
            </section>

            {/* Preferences */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Preferences</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div><p className="text-sm font-medium">Theme</p><p className="text-xs text-slate-400">{theme === "dark" ? "Dark mode" : "Light mode"}</p></div>
                  <button onClick={() => setTheme((prev) => prev === "dark" ? "light" : "dark")} className={`rounded-lg border px-3 py-1.5 text-sm ${theme === "dark" ? "border-slate-600 text-slate-300" : "border-amber-500 text-amber-300"}`}>{theme === "dark" ? "☀️ Light" : "🌙 Dark"}</button>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div><p className="text-sm font-medium">Notifications</p><p className="text-xs text-slate-400">{notifEnabled ? "Enabled" : "Disabled"}</p></div>
                  <button onClick={requestNotifications} className={`rounded-lg border px-3 py-1.5 text-sm ${notifEnabled ? "border-emerald-500 text-emerald-300" : "border-cyan-500 text-cyan-300"}`}>{notifEnabled ? "✓ Enabled" : "Enable"}</button>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div><p className="text-sm font-medium">Payment-day sound</p><p className="text-xs text-slate-400">{dueDaySoundEnabled ? "ON" : "OFF"}</p></div>
                  <button onClick={() => { setDueDaySoundEnabled((prev) => !prev); setToastMessage(dueDaySoundEnabled ? "Sound disabled" : "Sound enabled"); }} className={`rounded-lg border px-3 py-1.5 text-sm ${dueDaySoundEnabled ? "border-emerald-500 text-emerald-300" : "border-slate-600 text-slate-300"}`}>{dueDaySoundEnabled ? "🔔 ON" : "🔕 OFF"}</button>
                </div>
              </div>
            </section>

            {/* Security & Backup */}
            <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Security & Backup</h2>
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <p className="text-sm text-slate-300">App lock PIN (4-8 digits)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input type="password" value={newPin} maxLength={8} onChange={(e) => setNewPin(e.target.value)} placeholder="Set PIN" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" />
                    <button onClick={() => void setPinCode()} className="rounded-lg border border-cyan-500 px-3 py-2 text-cyan-300">Save PIN</button>
                    <button onClick={removePin} className="rounded-lg border border-slate-700 px-3 py-2 text-red-300">Remove PIN</button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <p className="text-sm text-slate-300">Backup & Restore</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={exportBackup} className="rounded-lg border border-emerald-600 px-3 py-2 text-emerald-300">Export backup</button>
                    <label className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Restore backup<input type="file" accept="application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void restoreBackup(file); }} /></label>
                    <button onClick={exportCsv} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Export CSV</button>
                    <button onClick={exportPdf} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Export PDF</button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <p className="text-sm text-slate-300">Session & Account</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => void handleLogoutAllDevices()} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200">Log out all devices</button>
                    <button onClick={() => setShowLegal(true)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200">Privacy & Terms</button>
                    <button onClick={() => setShowDeleteAccountDialog(true)} className="rounded-lg border border-red-500 px-3 py-2 text-sm text-red-300">Delete account</button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Dialogs (always available) */}
        {showDeleteAccountDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4">
              <h3 className="text-lg font-semibold text-red-300">Delete account permanently</h3>
              <p className="mt-2 text-sm text-slate-300">Type your username (<span className="font-semibold">{currentUser.username}</span>) to confirm.</p>
              <input value={deleteAccountConfirmInput} onChange={(e) => setDeleteAccountConfirmInput(e.target.value)} placeholder="Type your username" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => void handleDeleteAccount()} className="rounded-lg border border-red-500 px-3 py-2 text-sm text-red-300">Confirm delete</button>
                <button onClick={() => { setShowDeleteAccountDialog(false); setDeleteAccountConfirmInput(""); }} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {showLegal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-4">
              <h3 className="text-lg font-semibold">Privacy & Terms</h3>
              <div className="mt-3 space-y-3 text-sm text-slate-300">
                <p>Privacy: account and subscription data is stored securely on our backend.</p>
                <p>Data deletion: deleting account removes cloud profile permanently.</p>
                <p>Terms: subscription purchases are managed by Google Play policies.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => window.open(PLAY_SUBSCRIPTION_MANAGE_URL, "_blank")} className="rounded-lg border border-violet-500 px-3 py-2 text-sm text-violet-300">Google Play</button>
                <button onClick={() => setShowLegal(false)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== BOTTOM NAVIGATION BAR ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl justify-around">
          {([
            { id: "dashboard" as TabName, icon: "🏠", label: "Home" },
            { id: "bills" as TabName, icon: "💰", label: "Bills" },
            { id: "analytics" as TabName, icon: "📊", label: "Analytics" },
            { id: "goals" as TabName, icon: "🎯", label: "Goals" },
            { id: "settings" as TabName, icon: "⚙️", label: "Settings" },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-all ${
                activeTab === tab.id
                  ? "text-cyan-300"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className={`text-xl ${activeTab === tab.id ? "scale-110" : ""} transition-transform`}>{tab.icon}</span>
              <span className={activeTab === tab.id ? "font-medium" : ""}>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
