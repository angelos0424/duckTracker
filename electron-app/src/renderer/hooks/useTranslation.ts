import { useState, useEffect } from 'react';
import { useSettings } from './useSettings';
import get from 'lodash.get';

// @ts-ignore
import enTranslations from '../locales/en.json';
// @ts-ignore
import koTranslations from '../locales/ko.json';

const locales: Record<string, any> = {
  en: enTranslations,
  ko: koTranslations
};

export const useTranslation = (overrideLanguage?: string) => {
  const { settings } = useSettings();
  const [translations, setTranslations] = useState<any>({});
  const language = overrideLanguage || settings?.language;

  useEffect(() => {
    if (language) {
      setTranslations(locales[language] || {});
    }
  }, [language]);

  const t = (key: string, fallback?: string): string => {
    return get(translations, key, fallback || key);
  };

  return { t, language: settings?.language };
};
