import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setUiLanguage, getUiLanguage, UiLang, installUiTranslation } from '@/utils/uiTranslate';

const LANGUAGE_KEY = '@customer_app_language';

interface LanguageContextType {
  language: UiLang;
  setLanguage: (lang: UiLang) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLangState] = useState<UiLang>('en');

  useEffect(() => {
    installUiTranslation();
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((saved) => {
        if (saved && ['en', 'ta', 'te', 'kn', 'hi'].includes(saved)) {
          setUiLanguage(saved as UiLang);
          setLangState(saved as UiLang);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = async (newLang: UiLang) => {
    setUiLanguage(newLang);
    setLangState(newLang);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, newLang);
    } catch {
      // ignore
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
