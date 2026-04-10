import { FormEvent, useEffect, useMemo, useState } from "react";

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

type AuthUser = {
  appUserId: string;
  fullName: string;
  phoneNumber: string;
  username: string;
  email: string;
};

type PhoneCountryOption = {
  code: string;
  name: string;
  dial: string;
  region: PhoneRegion;
};

type PhoneRegion = "Africa" | "Europe" | "Americas" | "Middle East" | "Asia";

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
};

const FREE_ITEM_LIMIT = 10;
const BILLING_BACKEND_URL = (import.meta.env.VITE_BILLING_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const AUTH_API_BASE_URL = (import.meta.env.VITE_AUTH_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const RECOMMENDED_PRICES_MAD = {
  monthly: 19,
  yearly: 149,
};

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

export default function App() {
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [pin, setPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [locked, setLocked] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [dueDaySoundEnabled, setDueDaySoundEnabled] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<{ amount: string; dueDay: string }>({ amount: "", dueDay: "" });
  const [showPremiumPanel, setShowPremiumPanel] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementState>({
    loading: true,
    premiumActive: false,
    productId: null,
    expiresAt: null,
    error: "",
  });

  const appUserId = currentUser?.appUserId ?? "";
  const userScopedKey = (key: string) => `${key}-${appUserId}`;

  const [form, setForm] = useState<Template>({
    name: "",
    amount: 0,
    dueDay: 1,
    category: "General",
    reminderDays: 2,
    type: "bill",
    repeat: "monthly",
  });

  const resetForm = () => {
    setForm({
      name: "",
      amount: 0,
      dueDay: 1,
      category: "General",
      reminderDays: 2,
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
    const savedPin = localStorage.getItem(userScopedKey(STORAGE_KEYS.pin)) ?? "";
    setPin(savedPin);
    setLocked(Boolean(savedPin));
  }, [appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    const refreshEntitlement = async () => {
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
        const response = await fetch(`${BILLING_BACKEND_URL}/api/billing/entitlement/${encodeURIComponent(appUserId)}`);
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
    };

    void refreshEntitlement();
  }, [appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    localStorage.setItem(userScopedKey(STORAGE_KEYS.items), JSON.stringify(items));
  }, [items, appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    localStorage.setItem(userScopedKey(STORAGE_KEYS.templates), JSON.stringify(templates));
  }, [templates, appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    localStorage.setItem(userScopedKey(STORAGE_KEYS.currency), JSON.stringify(currency));
  }, [currency, appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    localStorage.setItem(userScopedKey(STORAGE_KEYS.budget), JSON.stringify(budget));
  }, [budget, appUserId]);

  useEffect(() => {
    if (!appUserId) {
      return;
    }
    localStorage.setItem(userScopedKey(STORAGE_KEYS.dueDaySoundEnabled), JSON.stringify(dueDaySoundEnabled));
  }, [dueDaySoundEnabled, appUserId]);

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
    let isCancelled = false;

    const fetchRates = async () => {
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

        if (isCancelled) {
          return;
        }

        // API returns 1 MAD -> X currency, so we invert to keep internal map as 1 currency -> MAD.
        setCurrencyToMAD({
          MAD: 1,
          EUR: 1 / eurRate,
          USD: 1 / usdRate,
          GBP: 1 / gbpRate,
        });
        setFxUpdatedAt(new Date().toISOString());
        setFxState("live");
      } catch {
        if (!isCancelled) {
          setFxState("fallback");
        }
      }
    };

    void fetchRates();
    const interval = window.setInterval(() => {
      void fetchRates();
    }, 6 * 60 * 60 * 1000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setToastMessage(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowWelcomeSplash(false), 1800);
    return () => window.clearTimeout(timeout);
  }, []);

  const formatMoney = (amountMAD: number) =>
    new Intl.NumberFormat(currency === "MAD" ? "fr-MA" : "en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(fromMAD(amountMAD, currency, currencyToMAD));

  const withDue = useMemo(() => {
    return items
      .map((item) => {
        const nextDueDate = getNextDueDate(item.dueDay);
        const daysUntil = getDaysUntil(nextDueDate);
        return { ...item, nextDueDate, daysUntil, paid: isPaidThisMonth(item) };
      })
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
  }, [items]);

  const monthlyTotal = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items]);
  const monthlyPaid = useMemo(
    () => items.filter((item) => isPaidThisMonth(item)).reduce((sum, item) => sum + item.amount, 0),
    [items],
  );
  const budgetProgress = budget > 0 ? Math.min((monthlyTotal / budget) * 100, 100) : 0;
  const yearlyPriceWithoutDiscount = RECOMMENDED_PRICES_MAD.monthly * 12;
  const yearlyDiscountPercent = Math.round((1 - RECOMMENDED_PRICES_MAD.yearly / yearlyPriceWithoutDiscount) * 100);

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

  const filtered = useMemo(() => {
    return withDue.filter((item) => {
      const bySearch = item.name.toLowerCase().includes(search.toLowerCase());
      const byCategory = categoryFilter === "all" || item.category === categoryFilter;
      const byStatus =
        statusFilter === "all" ||
        (statusFilter === "dueSoon" && !item.paid && item.daysUntil >= 0 && item.daysUntil <= 3) ||
        (statusFilter === "paid" && item.paid) ||
        (statusFilter === "unpaid" && !item.paid);
      return bySearch && byCategory && byStatus;
    });
  }, [withDue, search, categoryFilter, statusFilter]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const canUsePremiumFeatures = entitlement.premiumActive;
  const freeItemsLeft = Math.max(0, FREE_ITEM_LIMIT - items.length);

  useEffect(() => {
    if (!canUsePremiumFeatures || !notifEnabled || !dueDaySoundEnabled) {
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
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => [nextItem, ...prev]);
    setToastMessage("Item added successfully.");
    resetForm();
  };

  const saveTemplate = () => {
    if (!form.name.trim()) {
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
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, lastPaidAt: new Date().toISOString() } : item)));
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
    setItems((prev) => prev.filter((item) => item.id !== id));
    setToastMessage("Item deleted successfully.");
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifEnabled(permission === "granted");
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
      items: BillItem[];
      templates: Template[];
      currency: Currency;
      budget: number;
      pin: string;
    }>;
    if (data.items) setItems(data.items);
    if (data.templates) setTemplates(data.templates);
    if (data.currency) setCurrency(data.currency);
    if (typeof data.budget === "number") setBudget(data.budget);
    if (typeof data.pin === "string") {
      setPin(data.pin);
      localStorage.setItem(userScopedKey(STORAGE_KEYS.pin), data.pin);
      setLocked(Boolean(data.pin));
    }
  };

  const setPinCode = () => {
    if (!/^\d{4,8}$/.test(newPin)) {
      return;
    }
    setPin(newPin);
    localStorage.setItem(userScopedKey(STORAGE_KEYS.pin), newPin);
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
      };

      if (!response.ok || !data.ok || !data.token || !data.user) {
        if (data.code === "BLOCKED_USERNAME") {
          throw new Error("Username contains blocked words. Please choose a different username.");
        }
        if (data.code === "INVALID_EMAIL") {
          throw new Error("Email is invalid. Please enter a valid email address.");
        }
        throw new Error(data.code ?? "Authentication failed");
      }

      localStorage.setItem(STORAGE_KEYS.authToken, data.token);
      localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(data.user));
      setCurrentUser(data.user);
      setAuthForm({
        fullName: "",
        username: "",
        email: "",
        phoneNumber: "+212",
        password: "",
      });
      setSelectedPhoneCountry("MA");
      setPhoneLocalNumber("");
      setToastMessage(authMode === "signup" ? "Account created successfully." : "Welcome back.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setAuthSubmitting(false);
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

            <input
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            />

            {authError && <p className="text-sm text-red-300">{authError}</p>}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authSubmitting ? "Please wait..." : authMode === "signup" ? "Create account" : "Login"}
            </button>
          </form>
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
          <input
            type="password"
            maxLength={8}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2"
          />
          <button
            onClick={() => {
              if (pinInput === pin) {
                setLocked(false);
                setPinInput("");
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {toastMessage && (
        <div className="fixed right-4 top-4 z-50 rounded-lg border border-emerald-600 bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg">
          {toastMessage}
        </div>
      )}
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <img src="/images/tracker-logo.png" alt="All-in-One Bill Tracker logo" className="h-12 w-12 rounded-xl" />
            <div>
              <h1 className="text-2xl font-semibold">All-in-One Bill Tracker</h1>
              <p className="text-sm text-slate-400">Track bills, avoid late fees, and protect your budget.</p>
              <p className="text-xs text-cyan-300">Hello {currentUser.username}</p>
              <p className="text-xs text-slate-500">
                Plan: {canUsePremiumFeatures ? "Premium" : `Free (${freeItemsLeft} item${freeItemsLeft === 1 ? "" : "s"} left)`}
              </p>
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
              type="button"
              onClick={async () => {
                setFxState("idle");
                try {
                  const response = await fetch("https://open.er-api.com/v6/latest/MAD");
                  if (!response.ok) {
                    throw new Error("Failed to refresh rates");
                  }
                  const data = (await response.json()) as {
                    rates?: Partial<Record<Currency, number>>;
                  };
                  const eurRate = data.rates?.EUR;
                  const usdRate = data.rates?.USD;
                  const gbpRate = data.rates?.GBP;
                  if (!eurRate || !usdRate || !gbpRate || eurRate <= 0 || usdRate <= 0 || gbpRate <= 0) {
                    throw new Error("Invalid refresh payload");
                  }
                  setCurrencyToMAD({ MAD: 1, EUR: 1 / eurRate, USD: 1 / usdRate, GBP: 1 / gbpRate });
                  setFxUpdatedAt(new Date().toISOString());
                  setFxState("live");
                  setToastMessage("Exchange rates updated.");
                } catch {
                  setFxState("fallback");
                  setToastMessage("Live rates unavailable. Using fallback rates.");
                }
              }}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm"
            >
              Refresh rates
            </button>
            <button onClick={requestNotifications} className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-300">
              {notifEnabled ? "Notifications enabled" : "Enable notifications"}
            </button>
            <button
              onClick={() => {
                if (!canUsePremiumFeatures) {
                  setShowPremiumPanel(true);
                  setToastMessage("Payment-day sound alerts are available on Premium.");
                  return;
                }
                setDueDaySoundEnabled((prev) => !prev);
                setToastMessage(dueDaySoundEnabled ? "Payment-day sound disabled." : "Payment-day sound enabled.");
              }}
              className={`rounded-lg border px-3 py-2 text-sm ${canUsePremiumFeatures ? "border-violet-500 text-violet-300" : "border-slate-700 text-slate-400"}`}
            >
              {canUsePremiumFeatures
                ? dueDaySoundEnabled
                  ? "Payment-day sound: ON"
                  : "Payment-day sound: OFF"
                : "Payment-day sound (Premium)"}
            </button>
            <button
              onClick={() => setShowPremiumPanel((prev) => !prev)}
              className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950"
            >
              {canUsePremiumFeatures ? "Manage Premium" : "Passer a Premium"}
            </button>
            {pin && (
              <button onClick={() => setLocked(true)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">
                Lock now
              </button>
            )}
            <button onClick={handleLogout} className="rounded-lg border border-red-500 px-3 py-2 text-sm text-red-300">
              Log out
            </button>
          </div>
        </header>

        <p className="mb-4 text-xs text-slate-400">
          FX rates: {fxState === "live" ? "Live" : fxState === "fallback" ? "Fallback" : "Refreshing"}
          {fxUpdatedAt ? ` • updated ${new Date(fxUpdatedAt).toLocaleString()}` : ""}
        </p>

        {showPremiumPanel && (
          <section className="mb-6 rounded-xl border border-amber-500/40 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold text-amber-300">Passer a Premium</h2>
            <p className="mt-1 text-sm text-slate-300">
              Free: up to {FREE_ITEM_LIMIT} items. Premium: unlimited items, Backup & Restore, and Budget Guard.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                <p className="text-sm font-medium">Monthly</p>
                <p className="text-sm text-cyan-300">{formatMoney(RECOMMENDED_PRICES_MAD.monthly)} / month</p>
                <p className="text-xs text-slate-400">Product ID: premium_monthly</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                <p className="text-sm font-medium">Yearly</p>
                <p className="text-sm text-cyan-300">{formatMoney(RECOMMENDED_PRICES_MAD.yearly)} / year</p>
                <p className="text-xs text-emerald-300">Save about {yearlyDiscountPercent}% vs monthly</p>
                <p className="text-xs text-slate-400">Product ID: premium_yearly</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Purchases are handled in the Android app through Google Play Billing. Final charged prices come from Play Store offers.
              Premium is activated only after backend validation.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setShowPremiumPanel(false)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm"
              >
                Close
              </button>
              <button
                onClick={() => window.open("https://play.google.com/store/apps", "_blank")}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
              >
                Open Play Store
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Entitlement status: {entitlement.loading ? "Checking..." : canUsePremiumFeatures ? "Premium active" : "Free"}
              {entitlement.productId ? ` • ${entitlement.productId}` : ""}
              {entitlement.expiresAt ? ` • expires ${new Date(entitlement.expiresAt).toLocaleDateString()}` : ""}
              {entitlement.error ? ` • ${entitlement.error}` : ""}
            </p>
          </section>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Monthly total</p>
            <p className="text-2xl font-semibold">{formatMoney(monthlyTotal)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Paid this month</p>
            <p className="text-2xl font-semibold text-emerald-400">{formatMoney(monthlyPaid)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Upcoming in 7 days</p>
            <p className="text-2xl font-semibold text-amber-300">
              {withDue.filter((item) => !item.paid && item.daysUntil >= 0 && item.daysUntil <= 7).length}
            </p>
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <form onSubmit={onAddItem} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">{editingItemId ? "Edit item" : "Smart Add"}</h2>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200"
                >
                  {template.name}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Name"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount > 0 ? Number(fromMAD(form.amount, currency, currencyToMAD).toFixed(2)) : ""}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: toMAD(Number(e.target.value || 0), currency, currencyToMAD) }))}
                placeholder={`Amount (${currency})`}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                type="number"
                min={1}
                max={31}
                value={form.dueDay}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDay: Number(e.target.value || 1) }))}
                placeholder="Due day"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <input
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value || "General" }))}
                placeholder="Category"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ItemType }))}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              >
                <option value="bill">Bill</option>
                <option value="subscription">Subscription</option>
              </select>
              <input
                type="number"
                min={0}
                max={20}
                value={form.reminderDays}
                onChange={(e) => setForm((prev) => ({ ...prev, reminderDays: Number(e.target.value || 0) }))}
                placeholder="Reminder days"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">
                {editingItemId ? "Save changes" : "Add item"}
              </button>
              <button type="button" onClick={saveTemplate} className="rounded-lg border border-slate-600 px-4 py-2">
                Save as template
              </button>
              {editingItemId && (
                <button type="button" onClick={resetForm} className="rounded-lg border border-slate-600 px-4 py-2">
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">Budget Guard</h2>
            {canUsePremiumFeatures ? (
              <>
                <label className="text-sm text-slate-400">Monthly budget</label>
                <input
                  type="number"
                  min={0}
                  value={budget > 0 ? Number(fromMAD(budget, currency, currencyToMAD).toFixed(2)) : ""}
                  onChange={(e) => setBudget(toMAD(Number(e.target.value || 0), currency, currencyToMAD))}
                  placeholder={`Budget (${currency})`}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full ${budgetProgress >= 100 ? "bg-red-500" : budgetProgress >= 80 ? "bg-amber-400" : "bg-emerald-500"}`}
                    style={{ width: `${Math.max(6, Math.min(budgetProgress, 100))}%` }}
                  />
                </div>
                <p className="text-sm text-slate-300">
                  {budget > 0 ? `${budgetProgress.toFixed(0)}% of budget used` : "Set a budget to track spending pressure."}
                </p>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  <p className="font-medium text-emerald-300">Potential savings</p>
                  <p className="mt-1 text-slate-300">Monthly: {formatMoney(inactiveSubscriptions.reduce((sum, item) => sum + item.amount, 0))}</p>
                  <p className="text-slate-400">Yearly: {formatMoney(inactiveSubscriptions.reduce((sum, item) => sum + item.amount, 0) * 12)}</p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-500/40 bg-slate-950 p-3 text-sm">
                <p className="font-medium text-amber-300">Premium feature</p>
                <p className="mt-1 text-slate-300">Unlock Budget Guard to monitor budget usage and get overspending alerts.</p>
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-semibold">Search & Filter</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <option value="all">All</option>
              <option value="dueSoon">Due soon</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
              className="rounded-lg border border-slate-700 px-3 py-2"
            >
              Reset
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-semibold">Bills & Subscriptions</h2>
          <div className="space-y-3">
            {filtered.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  {inlineEditId === item.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={inlineDraft.amount}
                        onChange={(e) => setInlineDraft((prev) => ({ ...prev, amount: e.target.value }))}
                        className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1"
                        aria-label={`Edit amount for ${item.name}`}
                      />
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={inlineDraft.dueDay}
                        onChange={(e) => setInlineDraft((prev) => ({ ...prev, dueDay: e.target.value }))}
                        className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1"
                        aria-label={`Edit due day for ${item.name}`}
                      />
                      <span className="text-slate-400">{item.category}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      {formatMoney(item.amount)} · due day {item.dueDay} · {item.category}
                    </p>
                  )}
                  <p className={`text-xs ${item.paid ? "text-emerald-400" : item.daysUntil <= 2 ? "text-red-400" : "text-slate-400"}`}>
                    {item.paid ? "Paid this month" : `Due in ${item.daysUntil} day(s)`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {inlineEditId === item.id ? (
                    <>
                      <button onClick={() => saveInlineEdit(item.id)} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">
                        Save
                      </button>
                      <button onClick={cancelInlineEdit} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => startInlineEdit(item.id)} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300">
                      Quick edit
                    </button>
                  )}
                  <button onClick={() => startEditItem(item.id)} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300">
                    Edit
                  </button>
                  {!item.paid && (
                    <button onClick={() => markPaid(item.id)} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950">
                      Mark paid
                    </button>
                  )}
                  <button onClick={() => removeItem(item.id)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-red-300">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-slate-400">No items match this filter.</p>}
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">Smart Notifications</h2>
            <div className="space-y-2 text-sm">
              {smartMessages.length === 0 && <p className="text-slate-400">All clear for now. No urgent alerts.</p>}
              {smartMessages.map((message, index) => (
                <p key={`${message}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-slate-200">
                  {message}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">Expense by Category</h2>
            <div className="space-y-3">
              {categoryTotals.map(([category, total]) => {
                const ratio = monthlyTotal > 0 ? (total / monthlyTotal) * 100 : 0;
                return (
                  <div key={category}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{category}</span>
                      <span>{formatMoney(total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800">
                      <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${Math.max(4, ratio)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">Payment Timeline (30 days)</h2>
            <div className="space-y-2 text-sm">
              {withDue
                .filter((item) => !item.paid && item.daysUntil >= 0 && item.daysUntil <= 30)
                .map((item) => (
                  <div key={item.id} className="flex justify-between rounded-lg border border-slate-800 bg-slate-950 p-2">
                    <span>{item.name}</span>
                    <span className="text-slate-300">
                      {item.nextDueDate.toLocaleDateString()} · {formatMoney(item.amount)}
                    </span>
                  </div>
                ))}
              {withDue.filter((item) => !item.paid && item.daysUntil >= 0 && item.daysUntil <= 30).length === 0 && (
                <p className="text-slate-400">No unpaid bills in the next 30 days.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">Security & Backup</h2>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="text-sm text-slate-300">App lock PIN (4-8 digits)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="password"
                    value={newPin}
                    maxLength={8}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Set PIN"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                  />
                  <button onClick={setPinCode} className="rounded-lg border border-cyan-500 px-3 py-2 text-cyan-300">
                    Save PIN
                  </button>
                  <button onClick={removePin} className="rounded-lg border border-slate-700 px-3 py-2 text-red-300">
                    Remove PIN
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="text-sm text-slate-300">Backup & Restore</p>
                {canUsePremiumFeatures ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={exportBackup} className="rounded-lg border border-emerald-600 px-3 py-2 text-emerald-300">
                      Export backup
                    </button>
                    <label className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">
                      Restore backup
                      <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void restoreBackup(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Available on Premium only.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
