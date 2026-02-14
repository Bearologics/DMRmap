var SUPPORTED_LANGS = ["en", "de", "es", "fr"];

function translateDOM() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
        el.textContent = i18next.t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
        el.placeholder = i18next.t(el.getAttribute("data-i18n-placeholder"));
    });
}

function t(key, opts) {
    return i18next.t(key, opts);
}

function getLocale() {
    return i18next.resolvedLanguage || "en";
}

i18next
    .use(i18nextBrowserLanguageDetector)
    .use(i18nextHttpBackend)
    .init({
        supportedLngs: SUPPORTED_LANGS,
        fallbackLng: "en",
        detection: {
            order: ["querystring", "navigator"],
            lookupQuerystring: "lang",
            caches: [],
        },
        backend: {
            loadPath: "/locales/{{lng}}.json",
        },
    }, function () {
        document.documentElement.lang = getLocale();
        translateDOM();
        document.dispatchEvent(new Event("i18n-ready"));
    });
