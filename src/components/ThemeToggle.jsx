import { Sun, Moon } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${light ? "dark" : "light"} mode`}
      aria-pressed={light}
      title={
        light
          ? "Return to the original dark design"
          : "Use the blue-and-white design"
      }
    >
      {light ? <Moon size={17} /> : <Sun size={17} />}
      <span>{light ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}
