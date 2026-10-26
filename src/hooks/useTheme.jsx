import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);
const STORAGE_KEY = "coding12pm:theme:v1";
const validTheme = (value) => (value === "light" ? "light" : "dark");

function readTheme() {
  try {
    return validTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#f1f6fa" : "#090f1e");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* Switching still works if browser storage is unavailable. */
    }
  }, [theme]);
  useEffect(() => {
    const sync = (e) => {
      if (e.key === STORAGE_KEY || e.key === null)
        setTheme(validTheme(e.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme: () =>
          setTheme((old) => (old === "dark" ? "light" : "dark")),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
