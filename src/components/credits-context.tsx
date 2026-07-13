"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "midnight-fortune-credits";
export const STARTING_CREDITS = 10000;
export const CASINO_BETS: readonly number[] = [10, 20, 50, 100, 250, 500, 1000];

type CreditsContextValue = {
  credits: number;
  hydrated: boolean;
  spendCredits: (amount: number) => boolean;
  addCredits: (amount: number) => void;
  refillCredits: () => void;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

function normalizeCredits(value: number): number {
  if (!Number.isFinite(value)) return STARTING_CREDITS;
  return Math.max(0, Math.floor(value));
}

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState(STARTING_CREDITS);
  const [hydrated, setHydrated] = useState(false);
  const creditsRef = useRef(STARTING_CREDITS);

  const setBalance = useCallback((next: number) => {
    const normalized = normalizeCredits(next);
    creditsRef.current = normalized;
    setCredits(normalized);
  }, []);

  const spendCredits = useCallback((amount: number) => {
    const normalized = Math.max(0, Math.floor(amount));
    if (normalized <= 0 || creditsRef.current < normalized) return false;
    setBalance(creditsRef.current - normalized);
    return true;
  }, [setBalance]);

  const addCredits = useCallback((amount: number) => {
    const normalized = Math.max(0, Math.floor(amount));
    if (normalized <= 0) return;
    setBalance(creditsRef.current + normalized);
  }, [setBalance]);

  const refillCredits = useCallback(() => setBalance(STARTING_CREDITS), [setBalance]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const saved = Number(stored);
        if (Number.isFinite(saved) && saved >= 0) setBalance(saved);
      }
    } catch {
      // The casino remains usable when storage is unavailable.
    } finally {
      setHydrated(true);
    }
  }, [setBalance]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(credits));
    } catch {
      // Persistence is optional.
    }
  }, [credits, hydrated]);

  useEffect(() => {
    const syncFromAnotherTab = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return;
      const next = Number(event.newValue);
      if (Number.isFinite(next) && next >= 0) setBalance(next);
    };
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, [setBalance]);

  const value = useMemo(
    () => ({ credits, hydrated, spendCredits, addCredits, refillCredits }),
    [addCredits, credits, hydrated, refillCredits, spendCredits],
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits(): CreditsContextValue {
  const value = useContext(CreditsContext);
  if (!value) throw new Error("useCredits must be used inside CreditsProvider");
  return value;
}

export function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName);
}
