"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type ClienteTheme = "dark" | "light";
type ClienteDensity = "comfortable" | "compact";
type ClienteExperienceMode = "essencial" | "completo";

type ClienteShellContextValue = {
  theme: ClienteTheme;
  setTheme: (theme: ClienteTheme) => void;
  toggleTheme: () => void;
  density: ClienteDensity;
  setDensity: (density: ClienteDensity) => void;
  toggleDensity: () => void;
  experienceMode: ClienteExperienceMode;
  setExperienceMode: (mode: ClienteExperienceMode) => void;
  toggleExperienceMode: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarWidth: number;
};

const THEME_STORAGE_KEY = "altum-client-theme";
const THEME_MIGRATION_KEY = "altum-client-theme-v2-reference";
const DENSITY_STORAGE_KEY = "altum-client-density";
const EXPERIENCE_STORAGE_KEY = "altum-client-experience";
const SIDEBAR_STORAGE_KEY = "altum-client-sidebar-collapsed";

const ClienteShellContext = createContext<ClienteShellContextValue | null>(null);

function readStoredTheme(): ClienteTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function readStoredSidebarState(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

function readStoredDensity(): ClienteDensity {
  if (typeof window === "undefined") return "comfortable";
  return window.localStorage.getItem(DENSITY_STORAGE_KEY) === "compact" ? "compact" : "comfortable";
}

function readStoredExperienceMode(): ClienteExperienceMode {
  if (typeof window === "undefined") return "essencial";
  return window.localStorage.getItem(EXPERIENCE_STORAGE_KEY) === "completo" ? "completo" : "essencial";
}

export function ClienteShellProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ClienteTheme>("light");
  const [density, setDensityState] = useState<ClienteDensity>("comfortable");
  const [experienceMode, setExperienceModeState] = useState<ClienteExperienceMode>("essencial");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme());
    setDensityState(readStoredDensity());
    setExperienceModeState(readStoredExperienceMode());
    setSidebarCollapsedState(readStoredSidebarState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const migrated = window.localStorage.getItem(THEME_MIGRATION_KEY);
    if (migrated === "true") return;

    // We are switching the visual direction to match the new light reference.
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    window.localStorage.setItem(THEME_MIGRATION_KEY, "true");
    setThemeState("light");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(EXPERIENCE_STORAGE_KEY, experienceMode);
  }, [experienceMode]);

  const value = useMemo<ClienteShellContextValue>(() => {
    const sidebarWidth = sidebarCollapsed ? 110 : 312;
    return {
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
      density,
      setDensity: setDensityState,
      toggleDensity: () => setDensityState((current) => (current === "compact" ? "comfortable" : "compact")),
      experienceMode,
      setExperienceMode: setExperienceModeState,
      toggleExperienceMode: () =>
        setExperienceModeState((current) => (current === "essencial" ? "completo" : "essencial")),
      sidebarCollapsed,
      setSidebarCollapsed: setSidebarCollapsedState,
      sidebarWidth,
    };
  }, [density, experienceMode, sidebarCollapsed, theme]);

  const shellStyle = {
    "--cliente-sidebar-width": `${value.sidebarWidth}px`,
    "--cliente-density-scale": density === "compact" ? 0.92 : 1,
    colorScheme: theme,
  } as CSSProperties;

  return (
    <ClienteShellContext.Provider value={value}>
      <div className="client-portal" data-client-theme={theme} data-client-experience={experienceMode} data-client-style="v3" style={shellStyle}>
        {children}
      </div>
    </ClienteShellContext.Provider>
  );
}

export function useClienteShell() {
  const context = useContext(ClienteShellContext);
  if (!context) {
    throw new Error("useClienteShell must be used within ClienteShellProvider");
  }
  return context;
}
