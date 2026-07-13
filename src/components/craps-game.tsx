"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CASINO_BETS, formatCredits, isEditableTarget, useCredits } from "@/components/credits-context";
import { resolveComeOut, resolveField, resolvePoint, type CrapsBet, type CrapsOutcome, type CrapsResolution } from "@/lib/craps-rules";

type RollRecord = {
  id: number;
  total: number;
  wager: number;
  net: number;
  result: string;
};

type CrapsGameProps = {
  active: boolean;
  onBusyChange: (busy: boolean) => void;
};

function randomDie(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    do crypto.getRandomValues(values); while (values[0] >= 4294967292);
    return (values[0] % 6) + 1;
  }
  return Math.floor(Math.random() * 6) + 1;
}

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const pips = Array.from({ length: 9 }, (_, index) => index + 1);
  const visible: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  return (
    <div className={`craps-die ${rolling ? "rolling" : ""}`} aria-label={`Die showing ${value}`}>
      {pips.map((position) => (
        <span key={position} className={visible[value].includes(position) ? "visible" : ""} />
      ))}
    </div>
  );
}

export function CrapsGame({ active, onBusyChange }: CrapsGameProps) {
  const { credits, spendCredits, addCredits, refillCredits } = useCredits();
  const [betIndex, setBetIndex] = useState(2);
  const [selectedBet, setSelectedBet] = useState<CrapsBet>("pass");
  const [activeBet, setActiveBet] = useState<CrapsBet | null>(null);
  const [roundWager, setRoundWager] = useState(0);
  const [point, setPoint] = useState<number | null>(null);
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState("Choose a bet, then roll the dice.");
  const [outcome, setOutcome] = useState<CrapsOutcome>(null);
  const [history, setHistory] = useState<RollRecord[]>([]);
  const timer = useRef<number | null>(null);

  const bet = CASINO_BETS[betIndex];
  const lockedToPoint = point !== null && activeBet !== null;

  const addHistory = useCallback((total: number, wager: number, returned: number, result: string) => {
    setHistory((current) => [
      { id: Date.now(), total, wager, net: returned - wager, result },
      ...current,
    ].slice(0, 5));
  }, []);

  const applyResolution = useCallback((resolution: CrapsResolution, total: number, wager: number, betType: CrapsBet) => {
    if (resolution.settled) {
      if (resolution.returned > 0) addCredits(resolution.returned);
      setPoint(null);
      setActiveBet(null);
      setRoundWager(0);
    } else {
      setPoint(resolution.point ?? null);
      setActiveBet(betType === "field" ? null : betType);
      setRoundWager(wager);
    }

    addHistory(total, wager, resolution.settled ? resolution.returned : wager, resolution.result);
    setOutcome(resolution.outcome);
    setMessage(resolution.message);
  }, [addCredits, addHistory]);

  const settleComeOut = useCallback((betType: Exclude<CrapsBet, "field">, total: number, wager: number) => {
    applyResolution(resolveComeOut(betType, total, wager), total, wager, betType);
  }, [applyResolution]);

  const settlePoint = useCallback((total: number) => {
    if (point === null || activeBet === null || activeBet === "field") return;
    applyResolution(resolvePoint(activeBet, point, total, roundWager), total, roundWager, activeBet);
  }, [activeBet, applyResolution, point, roundWager]);

  const settleField = useCallback((total: number, wager: number) => {
    applyResolution(resolveField(total, wager), total, wager, "field");
  }, [applyResolution]);

  const roll = useCallback(() => {
    if (rolling) return;

    const continuingPoint = lockedToPoint;
    const wager = continuingPoint ? roundWager : bet;
    const betType = continuingPoint ? activeBet : selectedBet;
    if (!betType) return;

    if (!continuingPoint && !spendCredits(wager)) {
      setOutcome("loss");
      setMessage("Not enough credits for that wager. Refill or lower the bet.");
      return;
    }

    setRolling(true);
    setOutcome(null);
    setMessage(continuingPoint ? `Rolling for point ${point}…` : "Dice in the air…");

    let ticks = 0;
    timer.current = window.setInterval(() => {
      setDice([randomDie(), randomDie()]);
      ticks += 1;
      if (ticks < 9) return;
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;

      const finalDice: [number, number] = [randomDie(), randomDie()];
      const total = finalDice[0] + finalDice[1];
      setDice(finalDice);
      setRolling(false);

      if (continuingPoint) settlePoint(total);
      else if (betType === "field") settleField(total, wager);
      else settleComeOut(betType as Exclude<CrapsBet, "field">, total, wager);
    }, 75);
  }, [activeBet, bet, lockedToPoint, point, rolling, roundWager, selectedBet, settleComeOut, settleField, settlePoint, spendCredits]);

  const changeBet = useCallback((direction: -1 | 1) => {
    if (rolling || lockedToPoint) return;
    setBetIndex((current) => Math.min(CASINO_BETS.length - 1, Math.max(0, current + direction)));
    setOutcome(null);
  }, [lockedToPoint, rolling]);

  useEffect(() => onBusyChange(rolling), [onBusyChange, rolling]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        roll();
      }
      if (event.code === "ArrowLeft") changeBet(-1);
      if (event.code === "ArrowRight") changeBet(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, changeBet, roll]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    onBusyChange(false);
  }, [onBusyChange]);

  const pointLabel = point === null ? "OFF" : String(point);
  const selectedLabel = useMemo(() => ({ pass: "PASS LINE", "dont-pass": "DON'T PASS", field: "FIELD" })[selectedBet], [selectedBet]);

  return (
    <div className="game-shell craps-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="noise" />

      <header className="topbar">
        <a className="brand" href="#craps-table" aria-label="Midnight Fortune craps">
          <span className="brand-mark craps-brand-mark">⚄</span>
          <span><strong>MIDNIGHT</strong><small>CRAPS</small></span>
        </a>
        <div className="topbar-actions"><span className="demo-badge">VIRTUAL CREDITS</span><span className="table-limit">MAX 1,000</span></div>
      </header>

      <section className="hero-copy craps-hero" aria-labelledby="craps-title">
        <p className="eyebrow">PASS LINE · DON&apos;T PASS · FIELD</p>
        <h1 id="craps-title">Let the <span>dice decide.</span></h1>
        <p>Play the come-out roll, establish a point, or take a one-roll chance on the Field.</p>
      </section>

      <section className="craps-wrap" id="craps-table" aria-label="Craps game">
        <div className="craps-table">
          <div className="craps-rail">
            <div><span>POINT</span><strong className={point === null ? "point-off" : "point-on"}>{pointLabel}</strong></div>
            <div><span>ACTIVE BET</span><strong>{lockedToPoint ? (activeBet === "pass" ? "PASS LINE" : "DON'T PASS") : selectedLabel}</strong></div>
          </div>

          <div className="dice-stage" aria-live="polite">
            <Die value={dice[0]} rolling={rolling} />
            <Die value={dice[1]} rolling={rolling} />
            <div className="dice-total"><span>TOTAL</span><strong>{dice[0] + dice[1]}</strong></div>
          </div>

          <div className={`craps-message ${outcome ? `outcome-${outcome}` : ""}`} role="status">
            <span className="status-light" /><p>{message}</p>
          </div>

          <div className="craps-bet-grid" aria-label="Craps bet selection">
            {(["pass", "dont-pass", "field"] as CrapsBet[]).map((type) => (
              <button
                key={type}
                type="button"
                className={selectedBet === type ? "selected" : ""}
                onClick={() => { setSelectedBet(type); setOutcome(null); }}
                disabled={rolling || lockedToPoint}
              >
                <strong>{type === "pass" ? "PASS LINE" : type === "dont-pass" ? "DON'T PASS" : "FIELD"}</strong>
                <span>{type === "pass" ? "7 or 11 wins · 2, 3, 12 lose" : type === "dont-pass" ? "2 or 3 wins · 12 pushes" : "2 & 12 pay 2:1"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="craps-controls">
          <div className="meter"><span>CREDITS</span><strong>{formatCredits(credits)}</strong></div>
          <div className="bet-control" aria-label="Craps bet controls">
            <button type="button" onClick={() => changeBet(-1)} disabled={rolling || lockedToPoint || betIndex === 0} aria-label="Decrease bet">−</button>
            <div><span>{lockedToPoint ? "WAGER" : "BET"}</span><strong>{formatCredits(lockedToPoint ? roundWager : bet)}</strong></div>
            <button type="button" onClick={() => changeBet(1)} disabled={rolling || lockedToPoint || betIndex === CASINO_BETS.length - 1} aria-label="Increase bet">+</button>
          </div>
          <button className="roll-button" type="button" onClick={roll} disabled={rolling}>
            <span>{rolling ? "ROLLING" : "ROLL DICE"}</span>
            <small>{lockedToPoint ? `POINT ${point}` : `${formatCredits(bet)} CREDITS`}</small>
          </button>
          <button className="refill-button" type="button" onClick={() => { refillCredits(); setOutcome(null); setMessage("Demo credits refilled. The dice are ready."); }} disabled={rolling || lockedToPoint}>
            <span>REFILL</span><strong>10,000</strong>
          </button>
        </div>
      </section>

      <section className="lower-grid craps-lower-grid" aria-label="Craps information">
        <article className="info-card craps-rules-card">
          <div className="card-heading"><div><span className="section-number">01</span><h2>QUICK RULES</h2></div><p>Simplified table with three core bets.</p></div>
          <div className="craps-rules-grid">
            <div><strong>PASS</strong><span>Come-out 7/11 wins. Make the point before a 7.</span></div>
            <div><strong>DON&apos;T</strong><span>Come-out 2/3 wins. Seven out wins after a point.</span></div>
            <div><strong>FIELD</strong><span>One-roll bet. 2 and 12 pay 2:1; 3, 4, 9, 10, 11 pay even money.</span></div>
          </div>
        </article>
        <aside className="info-stack">
          <article className="info-card history-card">
            <div className="card-heading compact"><div><span className="section-number">02</span><h2>RECENT ROLLS</h2></div></div>
            {history.length ? <div className="history-list">{history.map((item) => (
              <div key={item.id}><span>ROLL {item.total} · BET {formatCredits(item.wager)}</span><strong className={item.net > 0 ? "positive" : item.net < 0 ? "negative" : "muted"}>{item.net > 0 ? `+${formatCredits(item.net)}` : item.net < 0 ? `−${formatCredits(Math.abs(item.net))}` : "—"}</strong><small>{item.result}</small></div>
            ))}</div> : <p className="empty-state">Your last five rolls will appear here.</p>}
          </article>
          <article className="info-card controls-card"><span className="section-number">03</span><h2>QUICK CONTROLS</h2><div className="key-row"><kbd>SPACE</kbd><span>Roll dice</span></div><div className="key-row"><kbd>←</kbd><kbd>→</kbd><span>Change bet</span></div></article>
        </aside>
      </section>

      <footer><p>For entertainment only · No deposits · No withdrawals · Browser-generated outcomes</p><span>Slots, blackjack, and craps · Built with Next.js</span></footer>
    </div>
  );
}
