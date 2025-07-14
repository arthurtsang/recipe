import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './assets/en.json';
import zh from './assets/zh.json';

const supportedLngs = ['en', 'zh'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs,
    detection: {
      order: ['navigator', 'htmlTag', 'path', 'subdomain'],
      caches: [], // Don't cache, always use browser setting unless user is authenticated and changes it
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n; 