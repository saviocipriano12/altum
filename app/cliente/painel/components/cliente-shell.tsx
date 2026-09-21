"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { readClientPreference, writeClientPreference } from "@/lib/client-storage";

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
  const stored = readClientPreference(THEME_STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function readStoredSidebarState(): boolean {
  if (typeof window === "undefined") return false;
  return readClientPreference(SIDEBAR_STORAGE_KEY) === "true";
}

function readStoredDensity(): ClienteDensity {
  if (typeof window === "undefined") return "comfortable";
  return readClientPreference(DENSITY_STORAGE_KEY) === "compact" ? "compact" : "comfortable";
}

function readStoredExperienceMode(): ClienteExperienceMode {
  if (typeof window === "undefined") return "essencial";
  return readClientPreference(EXPERIENCE_STORAGE_KEY) === "completo" ? "completo" : "essencial";
}

export function ClienteShellProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ClienteTheme>("light");
  const [density, setDensityState] = useState<ClienteDensity>("comfortable");
  const [experienceMode, setExperienceModeState] = useState<ClienteExperienceMode>("essencial");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme());
    setDensityState(readStoredDensity());
    setExperienceModeState(readStoredExperienceMode());
    setSidebarCollapsedState(readStoredSidebarState());
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const migrated = readClientPreference(THEME_MIGRATION_KEY);
    if (migrated === "true") return;

    // We are switching the visual direction to match the new light reference.
    writeClientPreference(THEME_STORAGE_KEY, "light");
    writeClientPreference(THEME_MIGRATION_KEY, "true");
    setThemeState("light");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (preferencesReady) writeClientPreference(THEME_STORAGE_KEY, theme);
  }, [preferencesReady, theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (preferencesReady) writeClientPreference(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [preferencesReady, sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (preferencesReady) writeClientPreference(DENSITY_STORAGE_KEY, density);
  }, [preferencesReady, density]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (preferencesReady) writeClientPreference(EXPERIENCE_STORAGE_KEY, experienceMode);
  }, [preferencesReady, experienceMode]);

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
