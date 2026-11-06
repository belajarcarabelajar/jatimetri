import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEN from '../locales/en/translation.json';
import translationID from '../locales/id/translation.json';

const resources = {
  en: {
    translation: translationEN,
  },
  id: {
    translation: translationID,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Questions, tendency descriptions and the PDF are Indonesian-only,
    // so Indonesian is the default; English is opt-in via the language switcher.
    fallbackLng: 'id',
    supportedLngs: ['en', 'id'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Only an explicit choice (saved by the switcher) overrides the default
      order: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  });

const syncHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
};
i18n.on('languageChanged', syncHtmlLang);
if (i18n.language) syncHtmlLang(i18n.language);

export default i18n;
