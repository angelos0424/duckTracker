import React, { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(true); // Add loading state
  const language = overrideLanguage || settings?.language;

  useEffect(() => {
    setLoading(true); // Set loading to true when language changes
    const timer = setTimeout(() => {
      if (language) {
        setTranslations(locales[language] || {});
      } else {
        setTranslations({}); // Clear translations if no language
      }
      setLoading(false); // Set loading to false after translations are set
    }, 100); // 100ms delay to show spinner and hide old content
    return () => clearTimeout(timer);
  }, [language]);

  const t = React.useCallback((key: string, fallback?: string): string => {
    return get(translations, key, fallback || key);
  }, [translations]);

  return { t, language, loading }; // Return loading state
};
