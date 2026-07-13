"use client";

import { useState } from "react";
import { BlackjackGame } from "@/components/blackjack-game";
import { SlotMachine } from "@/components/slot-machine";

type GameTab = "slots" | "blackjack";

export function CasinoApp() {
  const [activeGame, setActiveGame] = useState<GameTab>("slots");

  return (
    <div className={`casino-app casino-app-${activeGame}`}>
      <nav className="casino-tabs" aria-label="Casino games" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeGame === "slots"}
          className={activeGame === "slots" ? "active" : ""}
          onClick={() => setActiveGame("slots")}
        >
          <span aria-hidden="true">7</span>
          SLOTS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeGame === "blackjack"}
          className={activeGame === "blackjack" ? "active" : ""}
          onClick={() => setActiveGame("blackjack")}
        >
          <span aria-hidden="true">♠</span>
          BLACKJACK
        </button>
      </nav>

      <div role="tabpanel" aria-label={activeGame === "slots" ? "Slots" : "Blackjack"}>
        {activeGame === "slots" ? <SlotMachine /> : <BlackjackGame />}
      </div>
    </div>
  );
}
