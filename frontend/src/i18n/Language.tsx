import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ElementType,
} from "react";
import allLanguages from "./languages.json";
import source from "./catalogs/source.json";
const catalogs = import.meta.glob<Record<string, string>>("./catalogs/*.json", {
  eager: true,
  import: "default",
});
const languages = allLanguages.filter(
  (l) =>
    l.code === "en" ||
    source.every(
      (key) => !!catalogs[`./catalogs/${l.code}.json`]?.[key]?.trim(),
    ),
);
const normal = (text: string) => text.replace(/\s+/g, " ").trim();

const KEY = "inception-language";
function saved() {
  const linked = new URLSearchParams(location.search).get("lang");
  if (linked) return linked;
  try {
    return localStorage.getItem(KEY) || "en";
  } catch {
    return "en";
  }
}
const initial = languages.some((l) => l.code === saved()) ? saved() : "en";
const Context = createContext({
  language: initial,
  setLanguage: (_: string) => {},
  version: 0,
});
const cache = new Map<string, string>();
for (const language of languages)
  for (const [key, value] of Object.entries(
    catalogs[`./catalogs/${language.code}.json`] || {},
  ))
    cache.set(language.code + ":" + key, value);
const pending = new Map<string, Set<string>>();
const failures = new Set<string>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let busy = false;
let queued = false;
let error = false;
const notify = () => listeners.forEach((fn) => fn());
const eligible = (text: string) =>
  /[a-zA-Z]{2}/.test(text) &&
  !/^(?:https?:|[\w.+-]+@|[A-Z0-9]+(?:-[A-Z0-9]+)+$)/.test(text) &&
  !["Pip", "Inception", "inception.", "ORS", "SAL", "MSK", "CSV"].includes(
    text,
  );
function request(language: string, text: string) {
  text = normal(text);
  const key = language + ":" + text;
  if (
    error ||
    text.length > 12000 ||
    language === "en" ||
    !eligible(text) ||
    cache.has(key) ||
    failures.has(key) ||
    inFlight.has(key)
  )
    return;
  if (!pending.has(language)) pending.set(language, new Set());
  pending.get(language)!.add(text);
  if (!queued && !busy) {
    queued = true;
    setTimeout(flush, 120);
  }
}
async function flush() {
  queued = false;
  if (busy) return;
  const entry = [...pending].find(([, texts]) => texts.size);
  if (!entry) return;
  busy = true;
  notify();
  const [language, texts] = entry;
  const batch: string[] = [];
  let size = 0;
  for (const text of texts) {
    if (batch.length >= 50 || size + text.length > 35000) break;
    batch.push(text);
    size += text.length;
  }
  batch.forEach((text) => {
    texts.delete(text);
    inFlight.add(language + ":" + text);
  });
  try {
    const response = await fetch("/api/ui/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, texts: batch }),
    });
    if (!response.ok) throw new Error("Unavailable");
    const data = await response.json();
    if (
      !Array.isArray(data.translations) ||
      data.translations.length !== batch.length
    )
      throw new Error("Incomplete");
    batch.forEach((text, i) =>
      cache.set(language + ":" + text, data.translations[i]),
    );
    error = false;
  } catch {
    batch.forEach((text) => failures.add(language + ":" + text));
    // Stop repeated calls when offline; Retry is an explicit user action.
    for (const [lang, waiting] of pending) {
      waiting.forEach((text) => failures.add(lang + ":" + text));
      waiting.clear();
    }
    error = true;
  } finally {
    batch.forEach((text) => inFlight.delete(language + ":" + text));
    busy = false;
    notify();
    if ([...pending.values()].some((texts) => texts.size)) {
      queued = true;
      setTimeout(flush, 120);
    }
  }
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, update] = useState(initial);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const changed = () => setVersion((v) => v + 1);
    listeners.add(changed);
    return () => {
      listeners.delete(changed);
    };
  }, []);
  const setLanguage = (code: string) => {
    if (!languages.some((l) => l.code === code)) return;
    update(code);
    error = false;
    try {
      localStorage.setItem(KEY, code);
    } catch {
      /* Keep in-memory preference. */
    }
  };
  useEffect(() => {
    const linked = new URLSearchParams(location.search).get("lang");
    if (linked) {
      const url = new URL(location.href);
      url.searchParams.set("lang", language);
      history.replaceState(null, "", url);
      try {
        localStorage.setItem(KEY, language);
      } catch {}
    }
    document.documentElement.lang = language;
    document.documentElement.dir =
      languages.find((l) => l.code === language)?.dir || "ltr";
  }, [language]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (
        event.key === KEY &&
        event.newValue &&
        languages.some((l) => l.code === event.newValue)
      )
        update(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <Context.Provider value={{ language, setLanguage, version }}>
      {children}
    </Context.Provider>
  );
}
export function useLanguage() {
  return useContext(Context);
}
export function useTranslations(texts: string[]) {
  const { language, version } = useLanguage();
  const signature = JSON.stringify(texts);
  useEffect(() => {
    texts.forEach((text) => request(language, text));
  }, [language, version, signature]);
  return texts.map((text) => translated(text, language));
}
function translated(text: string, language: string) {
  const trimmed = text.trim();
  const key = normal(text);
  return language === "en"
    ? text
    : text.replace(trimmed, cache.get(language + ":" + key) || trimmed);
}
/** React-owned presentation translation; never mutates DOM or application values. */
export function LocalizedElement({
  as,
  children,
  ...props
}: {
  as: ElementType;
  children?: ReactNode;
  [key: string]: unknown;
}) {
  const { language, version } = useLanguage();
  const strings: string[] = [];
  function collect(node: ReactNode) {
    if (typeof node === "string") strings.push(node);
    else if (Array.isArray(node)) node.forEach(collect);
  }
  function coalesce(node: ReactNode): ReactNode {
    if (!Array.isArray(node)) return node;
    const grouped: ReactNode[] = [];
    for (const item of node.flat(Infinity)) {
      if (typeof item === "string" || typeof item === "number") {
        if (typeof grouped.at(-1) === "string")
          grouped[grouped.length - 1] = String(grouped.at(-1)) + item;
        else grouped.push(String(item));
      } else grouped.push(item);
    }
    return grouped;
  }
  const content = coalesce(children);
  collect(content);
  const attrs = ["title", "placeholder", "aria-label", "alt"];
  attrs.forEach((key) => {
    if (typeof props[key] === "string") strings.push(props[key] as string);
  });
  const signature = JSON.stringify(strings);
  useEffect(() => {
    strings.forEach((text) => request(language, text));
  }, [language, signature, version]);
  function convert(node: ReactNode): ReactNode {
    if (typeof node === "string") return translated(node, language);
    if (Array.isArray(node)) return node.map(convert);
    return node;
  }
  const localized = { ...props };
  if (typeof props.href === "string" && /^https?:/.test(props.href)) {
    const target = new URL(props.href);
    if (
      ["localhost", "127.0.0.1"].includes(target.hostname) &&
      ["5173", "5174"].includes(target.port)
    ) {
      target.searchParams.set("lang", language);
      localized.href = target.toString();
    }
  }
  attrs.forEach((key) => {
    if (typeof localized[key] === "string")
      localized[key] = translated(localized[key] as string, language);
  });
  return createElement(as, localized, convert(content));
}
export function LanguagePicker({
  promptOnEntry = false,
}: {
  promptOnEntry?: boolean;
}) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(() => {
    try {
      return (
        promptOnEntry &&
        !localStorage.getItem(KEY) &&
        !new URLSearchParams(location.search).has("lang")
      );
    } catch {
      return promptOnEntry;
    }
  });
  const [draft, setDraft] = useState(language);
  const selection = languages.find((l) => l.code === language)!;
  const languageLabel = ({en: "Language", hi: "भाषा", kn: "ಭಾಷೆ", ta: "மொழி", te: "భాష"} as Record<string,string>)[language] || "Language";
  const statusText: Record<string, [string, string, string]> = {
    hi: [
      "अनुवाद हो रहा है…",
      "अनुवाद उपलब्ध नहीं है। कुछ पाठ अंग्रेज़ी में दिखाया गया है।",
      "फिर कोशिश करें",
    ],
    kn: [
      "ಅನುವಾದಿಸಲಾಗುತ್ತಿದೆ…",
      "ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲ. ಕೆಲವು ಪಠ್ಯವನ್ನು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ತೋರಿಸಲಾಗಿದೆ.",
      "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    ],
    ta: [
      "மொழிபெயர்க்கப்படுகிறது…",
      "மொழிபெயர்ப்பு கிடைக்கவில்லை. சில உரைகள் ஆங்கிலத்தில் காட்டப்படுகின்றன.",
      "மீண்டும் முயற்சிக்கவும்",
    ],
    te: [
      "అనువదిస్తోంది…",
      "అనువాదం అందుబాటులో లేదు. కొంత సమాచారం ఆంగ్లంలో చూపబడుతోంది.",
      "మళ్లీ ప్రయత్నించండి",
    ],
  };
  const status = statusText[language] || [
    "Translating…",
    "Translation unavailable · English source shown.",
    "Retry",
  ];
  const picker = (
    value: string,
    onChange: (value: string) => void,
    id: string,
  ) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={languageLabel}
    >
      {languages.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>
          {l.native} · {l.name}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <div className="language-picker" dir="ltr">
        <label htmlFor="website-language">🌐 {languageLabel}</label>
        {picker(language, setLanguage, "website-language")}
        {language !== "en" && (
          <small role="status">
            {busy ? status[0] : error ? status[1] : selection.native}
          </small>
        )}
        {language !== "en" && error && (
          <button
            onClick={() => {
              failures.clear();
              error = false;
              notify();
            }}
          >
            {status[2]}
          </button>
        )}
      </div>
      {open && (
        <div className="language-welcome-backdrop">
          <section
            className="language-welcome"
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-title"
            dir="ltr"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls =
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "select,button",
                );
              const first = controls[0],
                last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <span aria-hidden="true">🌐</span>
            <h2 id="language-title">Choose your language</h2>
            <p>अपनी भाषा चुनें · ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ</p>
            <p>
              The dashboard and Pip will use this language. You can change it
              anytime.
            </p>
            <label htmlFor="welcome-language">Website & assistant</label>
            {picker(draft, setDraft, "welcome-language")}
            <button
              autoFocus
              onClick={() => {
                setLanguage(draft);
                setOpen(false);
              }}
            >
              Continue →
            </button>
          </section>
        </div>
      )}
    </>
  );
}
