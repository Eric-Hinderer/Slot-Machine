"use client";

import { useCallback, useState } from "react";
import { BlackjackGame } from "@/components/blackjack-game";
import { CreditsProvider } from "@/components/credits-context";
import { CrapsGame } from "@/components/craps-game";
import { SlotMachine } from "@/components/slot-machine";

type GameTab = "slots" | "blackjack" | "craps";
type BusyState = Record<GameTab, boolean>;

const TABS: { id: GameTab; icon: string; label: string }[] = [
  { id: "slots", icon: "7", label: "SLOTS" },
  { id: "blackjack", icon: "♠", label: "BLACKJACK" },
  { id: "craps", icon: "⚄", label: "CRAPS" },
];

function CasinoTabs() {
  const [activeGame, setActiveGame] = useState<GameTab>("slots");
  const [busy, setBusy] = useState<BusyState>({ slots: false, blackjack: false, craps: false });
  const activeBusy = busy[activeGame];

  const setGameBusy = useCallback((game: GameTab, value: boolean) => {
    setBusy((current) => (current[game] === value ? current : { ...current, [game]: value }));
  }, []);
  const setSlotsBusy = useCallback((value: boolean) => setGameBusy("slots", value), [setGameBusy]);
  const setBlackjackBusy = useCallback((value: boolean) => setGameBusy("blackjack", value), [setGameBusy]);
  const setCrapsBusy = useCallback((value: boolean) => setGameBusy("craps", value), [setGameBusy]);

  return (
    <div className={`casino-app casino-app-${activeGame}`}>
      <nav className="casino-tabs" aria-label="Casino games" role="tablist">
        {TABS.map((tab) => {
          const selected = activeGame === tab.id;
          const disabled = activeBusy && !selected;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-controls={`panel-${tab.id}`}
              aria-selected={selected}
              className={selected ? "active" : ""}
              disabled={disabled}
              title={disabled ? "Finish the current action before switching games" : undefined}
              onClick={() => setActiveGame(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section id="panel-slots" role="tabpanel" aria-labelledby="tab-slots" hidden={activeGame !== "slots"}>
        <SlotMachine active={activeGame === "slots"} onBusyChange={setSlotsBusy} />
      </section>
      <section id="panel-blackjack" role="tabpanel" aria-labelledby="tab-blackjack" hidden={activeGame !== "blackjack"}>
        <BlackjackGame active={activeGame === "blackjack"} onBusyChange={setBlackjackBusy} />
      </section>
      <section id="panel-craps" role="tabpanel" aria-labelledby="tab-craps" hidden={activeGame !== "craps"}>
        <CrapsGame active={activeGame === "craps"} onBusyChange={setCrapsBusy} />
      </section>
    </div>
  );
}

export function CasinoApp() {
  return (
    <CreditsProvider>
      <CasinoTabs />
    </CreditsProvider>
  );
}
