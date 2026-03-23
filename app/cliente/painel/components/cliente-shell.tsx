"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type ClienteTheme = "dark" | "light";

type ClienteShellContextValue = {
  theme: ClienteTheme;
  setTheme: (theme: ClienteTheme) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarWidth: number;
};

const THEME_STORAGE_KEY = "altum-client-theme";
const SIDEBAR_STORAGE_KEY = "altum-client-sidebar-collapsed";

const ClienteShellContext = createContext<ClienteShellContextValue | null>(null);

function readStoredTheme(): ClienteTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

function readStoredSidebarState(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

export function ClienteShellProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ClienteTheme>("dark");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme());
    setSidebarCollapsedState(readStoredSidebarState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const value = useMemo<ClienteShellContextValue>(() => {
    const sidebarWidth = sidebarCollapsed ? 92 : 304;
    return {
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
      sidebarCollapsed,
      setSidebarCollapsed: setSidebarCollapsedState,
      sidebarWidth,
    };
  }, [sidebarCollapsed, theme]);

  const shellStyle = {
    "--cliente-sidebar-width": `${value.sidebarWidth}px`,
  } as CSSProperties;

  return (
    <ClienteShellContext.Provider value={value}>
      <div data-client-theme={theme} style={shellStyle}>
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
