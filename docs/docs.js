// BerryStudio docs site (WP-16) — no build step, no framework, mirrors the
// root app's own "no dependency creep" rule. Each page embeds both an
// English and an Arabic content block (data-lang="en"/"ar"); this script
// toggles which one is visible, plus <html dir>/lang (the same job
// js/i18n.js does for the main app, kept deliberately tiny and separate
// since docs pages don't load the app's module graph), and renders the
// sidebar nav from one shared list so all 13 pages can't drift out of sync.
(function () {
  const KEY = "bsDocsLang";

  const NAV = [
    { grp: { en: "Get started", ar: "البداية" } },
    { href: "index.html", en: "Quick start", ar: "البداية السريعة" },
    { grp: { en: "Reference", ar: "المرجع" } },
    { href: "tools.html", en: "Tool reference", ar: "دليل الأدوات" },
    { href: "shortcuts.html", en: "Keyboard shortcuts", ar: "اختصارات لوحة المفاتيح" },
    { grp: { en: "Bring your own AI", ar: "استخدم ذكاءك الاصطناعي" } },
    { href: "ai-setup/index.html", en: "AI setup overview", ar: "نظرة عامة على الإعداد" },
    { href: "ai-setup/anthropic.html", en: "Anthropic (Claude)", ar: "Anthropic (Claude)" },
    { href: "ai-setup/openai.html", en: "OpenAI", ar: "OpenAI" },
    { href: "ai-setup/gemini.html", en: "Google Gemini", ar: "Google Gemini" },
    { href: "ai-setup/openai-compatible.html", en: "OpenAI-compatible", ar: "متوافق مع OpenAI" },
    { href: "ai-setup/ollama.html", en: "Ollama (local)", ar: "Ollama (محلي)" },
    { href: "ai-setup/lmstudio.html", en: "LM Studio (local)", ar: "LM Studio (محلي)" },
    { href: "ai-setup/llamacpp-vllm.html", en: "llama.cpp / vLLM (local)", ar: "llama.cpp / vLLM (محلي)" },
    { href: "ai-setup/proxy.html", en: "Your own proxy", ar: "الخادم الوسيط الخاص بك" },
    { grp: { en: "Help", ar: "المساعدة" } },
    { href: "3d-troubleshooting.html", en: "3D troubleshooting", ar: "حل مشاكل العرض ثلاثي الأبعاد" },
    { href: "faq.html", en: "FAQ", ar: "الأسئلة الشائعة" },
  ];

  function appLang() {
    // Default to whatever language the main app was last used in, if known,
    // so a reader who just switched the app to Arabic lands on Arabic docs.
    try {
      const raw = localStorage.getItem("pps");
      if (raw) {
        const s = JSON.parse(raw);
        if (s && (s.lang === "ar" || s.lang === "en")) return s.lang;
      }
    } catch (e) { /* ignore malformed/absent app state */ }
    return null;
  }

  function currentLang() {
    return localStorage.getItem(KEY) || appLang() || "en";
  }

  function depth() {
    // "docs/index.html" -> 0 extra levels up to reach docs/; "docs/ai-setup/x.html" -> 1
    return location.pathname.includes("/ai-setup/") ? 1 : 0;
  }

  function renderNav(lang) {
    const mount = document.getElementById("docsNav");
    if (!mount) return;
    const up = depth() === 1 ? "../" : "";
    const here = location.pathname.split("/").pop() || "index.html";
    const hereFull = (depth() === 1 ? "ai-setup/" : "") + here;
    let html = "";
    NAV.forEach((item) => {
      if (item.grp) { html += `<div class="grp">${item.grp[lang]}</div>`; return; }
      const active = item.href === hereFull;
      html += `<a href="${up}${item.href}"${active ? ' class="current" aria-current="page"' : ""}>${item[lang]}</a>`;
    });
    mount.innerHTML = html;
  }

  function apply(lang) {
    const html = document.documentElement;
    html.setAttribute("data-doclang", lang);
    html.setAttribute("lang", lang);
    html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    const btn = document.getElementById("docsLangBtn");
    if (btn) btn.textContent = lang === "ar" ? "English" : "العربية";
    renderNav(lang);
  }

  function toggle() {
    const next = currentLang() === "ar" ? "en" : "ar";
    localStorage.setItem(KEY, next);
    apply(next);
  }

  document.addEventListener("DOMContentLoaded", () => {
    apply(currentLang());
    const btn = document.getElementById("docsLangBtn");
    if (btn) btn.addEventListener("click", toggle);
  });
})();
