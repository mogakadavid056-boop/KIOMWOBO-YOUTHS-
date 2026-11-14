import React, { createContext, useContext, useMemo, useState } from 'react';
import { type AppLanguage, getTranslations, type TranslationSet } from '@/src/lib/i18n';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: TranslationSet;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const LANG_KEY = 'kiomwobo-lang';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LANG_KEY) : null;
    return saved === 'sw' ? 'sw' : 'en';
  });

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
  };

  const t = useMemo(() => getTranslations(language), [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
