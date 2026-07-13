"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCredits, isEditableTarget, useCredits } from "@/components/credits-context";
import {
  HARDWAY_NUMBERS,
  POINT_NUMBERS,
  PROPOSITION_BETS,
  cloneCrapsBets,
  createEmptyCrapsBets,
  getOddsLimit,
  getTotalAtRisk,
  resolveCrapsRoll,
  type CrapsOutcome,
  type CrapsTableBets,
  type HardwayNumber,
  type PointNumber,
  type PropositionBet,
} from "@/lib/craps-rules";

const CRAPS_CHIPS = [10, 25, 50, 100, 250, 500, 1000] as const;
const MAX_SPOT_BET = 1000;

type BetMode = "place" | "remove";

type RollRecord = {
  id: number;
  dice: [number, number];
  atRisk: number;
  net: number;
  result: string;
};

type CrapsGameProps = {
  active: boolean;
  onBusyChange: (busy: boolean) => void;
};

type BetSpotProps = {
  label: string;
  detail?: string;
  amount: number;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  className?: string;
  compact?: boolean;
};

const PROP_LABELS: Record<PropositionBet, { label: string; detail: string }> = {
  "any-seven": { label: "ANY 7", detail: "Pays 4:1" },
  "any-craps": { label: "ANY CRAPS", detail: "2, 3, 12 · Pays 7:1" },
  yo: { label: "YO 11", detail: "Pays 15:1" },
  "ace-deuce": { label: "ACE DEUCE", detail: "3 · Pays 15:1" },
  "snake-eyes": { label: "SNAKE EYES", detail: "2 · Pays 30:1" },
  boxcars: { label: "BOXCARS", detail: "12 · Pays 30:1" },
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

function Chip({ amount, small = false }: { amount: number; small?: boolean }) {
  if (amount <= 0) return null;
  return <span className={`table-chip ${small ? "table-chip-small" : ""}`}>{formatCredits(amount)}</span>;
}

function BetSpot({ label, detail, amount, onClick, disabled, locked, className = "", compact }: BetSpotProps) {
  return (
    <button
      type="button"
      className={`craps-bet-spot ${amount > 0 ? "has-bet" : ""} ${locked ? "locked" : ""} ${compact ? "compact" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={`${label}${amount > 0 ? `, ${amount} credits` : ""}${locked ? ", locked" : ""}`}
    >
      <span className="bet-copy"><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <Chip amount={amount} small={compact} />
      {locked && <span className="contract-tag">CONTRACT</span>}
    </button>
  );
}

export function CrapsGame({ active, onBusyChange }: CrapsGameProps) {
  const { credits, spendCredits, addCredits, refillCredits } = useCredits();
  const [chipIndex, setChipIndex] = useState(2);
  const [mode, setMode] = useState<BetMode>("place");
  const [bets, setBets] = useState<CrapsTableBets>(() => createEmptyCrapsBets());
  const [point, setPoint] = useState<PointNumber | null>(null);
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState("Select a chip and place bets anywhere on the layout.");
  const [outcome, setOutcome] = useState<CrapsOutcome>(null);
  const [history, setHistory] = useState<RollRecord[]>([]);
  const timer = useRef<number | null>(null);

  const chip = CRAPS_CHIPS[chipIndex];
  const totalAtRisk = useMemo(() => getTotalAtRisk(bets), [bets]);

  const adjustSpot = useCallback((
    label: string,
    current: number,
    max: number,
    locked: boolean,
    apply: (next: CrapsTableBets, amount: number) => void,
  ) => {
    if (rolling) return;
    if (locked) {
      setOutcome(null);
      setMessage(`${label} is a contract bet and stays until it wins or loses.`);
      return;
    }

    if (mode === "place") {
      if (current + chip > max) {
        setOutcome(null);
        setMessage(`${label} allows up to ${formatCredits(max)} credits here.`);
        return;
      }
      if (!spendCredits(chip)) {
        setOutcome("loss");
        setMessage("Not enough credits for that chip. Remove a bet, lower the chip, or refill.");
        return;
      }
      setBets((currentBets) => {
        const next = cloneCrapsBets(currentBets);
        apply(next, current + chip);
        return next;
      });
      setOutcome(null);
      setMessage(`${formatCredits(chip)} credits placed on ${label}.`);
      return;
    }

    if (current <= 0) {
      setOutcome(null);
      setMessage(`There is no ${label} bet to remove.`);
      return;
    }
    const removed = Math.min(chip, current);
    setBets((currentBets) => {
      const next = cloneCrapsBets(currentBets);
      apply(next, current - removed);
      return next;
    });
    addCredits(removed);
    setOutcome(null);
    setMessage(`${formatCredits(removed)} credits removed from ${label}.`);
  }, [addCredits, chip, mode, rolling, spendCredits]);

  const adjustSimple = useCallback((
    key: "passLine" | "dontPass" | "passOdds" | "dontPassOdds" | "come" | "dontCome" | "field",
    label: string,
    max = MAX_SPOT_BET,
    locked = false,
  ) => {
    adjustSpot(label, bets[key], max, locked, (next, amount) => { next[key] = amount; });
  }, [adjustSpot, bets]);

  const adjustNumber = useCallback((
    key: "place" | "comeOdds" | "dontComeOdds",
    number: PointNumber,
    label: string,
    max = MAX_SPOT_BET,
  ) => {
    adjustSpot(label, bets[key][number], max, false, (next, amount) => { next[key][number] = amount; });
  }, [adjustSpot, bets]);

  const adjustHardway = useCallback((number: HardwayNumber) => {
    adjustSpot(`Hard ${number}`, bets.hardways[number], MAX_SPOT_BET, false, (next, amount) => {
      next.hardways[number] = amount;
    });
  }, [adjustSpot, bets.hardways]);

  const adjustProposition = useCallback((prop: PropositionBet) => {
    adjustSpot(PROP_LABELS[prop].label, bets.propositions[prop], MAX_SPOT_BET, false, (next, amount) => {
      next.propositions[prop] = amount;
    });
  }, [adjustSpot, bets.propositions]);

  const removableTotal = useMemo(() => {
    let amount = bets.passOdds + bets.dontPassOdds + bets.come + bets.dontCome + bets.field;
    if (point === null) amount += bets.passLine + bets.dontPass;
    for (const number of POINT_NUMBERS) {
      amount += bets.comeOdds[number] + bets.dontComeOdds[number] + bets.place[number];
    }
    for (const number of HARDWAY_NUMBERS) amount += bets.hardways[number];
    for (const prop of PROPOSITION_BETS) amount += bets.propositions[prop];
    return amount;
  }, [bets, point]);

  const clearRemovable = useCallback(() => {
    if (rolling || removableTotal <= 0) return;
    setBets((current) => {
      const next = cloneCrapsBets(current);
      if (point === null) {
        next.passLine = 0;
        next.dontPass = 0;
      }
      next.passOdds = 0;
      next.dontPassOdds = 0;
      next.come = 0;
      next.dontCome = 0;
      next.field = 0;
      for (const number of POINT_NUMBERS) {
        next.comeOdds[number] = 0;
        next.dontComeOdds[number] = 0;
        next.place[number] = 0;
      }
      for (const number of HARDWAY_NUMBERS) next.hardways[number] = 0;
      for (const prop of PROPOSITION_BETS) next.propositions[prop] = 0;
      return next;
    });
    addCredits(removableTotal);
    setOutcome(null);
    setMessage(`${formatCredits(removableTotal)} removable credits returned to your rack.`);
  }, [addCredits, point, removableTotal, rolling]);

  const roll = useCallback(() => {
    if (rolling) return;
    if (totalAtRisk <= 0) {
      setOutcome(null);
      setMessage("Place at least one bet before rolling.");
      return;
    }

    setRolling(true);
    setOutcome(null);
    setMessage(point === null ? "Come-out roll — dice in the air…" : `Point ${point} is on — dice in the air…`);

    let ticks = 0;
    timer.current = window.setInterval(() => {
      setDice([randomDie(), randomDie()]);
      ticks += 1;
      if (ticks < 10) return;
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;

      const finalDice: [number, number] = [randomDie(), randomDie()];
      const resolution = resolveCrapsRoll(point, bets, finalDice);
      setDice(finalDice);
      setBets(resolution.nextBets);
      setPoint(resolution.nextPoint);
      if (resolution.creditReturn > 0) addCredits(resolution.creditReturn);
      setOutcome(resolution.outcome);
      setMessage(resolution.summary);
      setHistory((current) => [
        {
          id: Date.now(),
          dice: finalDice,
          atRisk: totalAtRisk,
          net: resolution.net,
          result: resolution.summary,
        },
        ...current,
      ].slice(0, 8));
      setRolling(false);
    }, 72);
  }, [addCredits, bets, point, rolling, totalAtRisk]);

  const changeChip = useCallback((direction: -1 | 1) => {
    if (rolling) return;
    setChipIndex((current) => Math.min(CRAPS_CHIPS.length - 1, Math.max(0, current + direction)));
  }, [rolling]);

  useEffect(() => onBusyChange(rolling), [onBusyChange, rolling]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        roll();
      }
      if (event.code === "ArrowLeft") changeChip(-1);
      if (event.code === "ArrowRight") changeChip(1);
      if (event.key.toLowerCase() === "r") setMode((current) => current === "place" ? "remove" : "place");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, changeChip, roll]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    onBusyChange(false);
  }, [onBusyChange]);

  const passLocked = point !== null && bets.passLine > 0;
  const dontPassLocked = point !== null && bets.dontPass > 0;
  const canPlaceLine = point === null;
  const canPlaceCome = point !== null;

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
        <div className="topbar-actions">
          <span className="demo-badge">VIRTUAL CREDITS</span>
          <span className="table-limit">1,000 PER SPOT</span>
        </div>
      </header>

      <section className="hero-copy craps-hero" aria-labelledby="craps-title">
        <p className="eyebrow">FULL TABLE · MULTIPLE BETS · TRUE ODDS</p>
        <h1 id="craps-title">Take over the <span>whole table.</span></h1>
        <p>Stack chips across line bets, Come bets, numbers, hardways, the Field, and center action.</p>
      </section>

      <section className="craps-wrap" id="craps-table" aria-label="Full craps table">
        <div className="craps-table craps-table-full">
          <div className="craps-rail">
            <div><span>POINT</span><strong className={point === null ? "point-off" : "point-on"}>{point ?? "OFF"}</strong></div>
            <div className="rail-dice">
              <Die value={dice[0]} rolling={rolling} />
              <Die value={dice[1]} rolling={rolling} />
              <span className="rail-total">{dice[0] + dice[1]}</span>
            </div>
            <div><span>AT RISK</span><strong>{formatCredits(totalAtRisk)}</strong></div>
          </div>

          <div className={`craps-message ${outcome ? `outcome-${outcome}` : ""}`} role="status">
            <span className="status-light" /><p>{message}</p>
          </div>

          <div className="number-board" aria-label="Number bets">
            {POINT_NUMBERS.map((number) => {
              const comeFlat = bets.comePoints[number];
              const dontFlat = bets.dontComePoints[number];
              const comeOddsMax = comeFlat > 0 ? getOddsLimit(number, comeFlat) : 0;
              const dontOddsMax = dontFlat > 0 ? dontFlat * 5 : 0;
              return (
                <div className={`number-column ${point === number ? "point-number" : ""}`} key={number}>
                  <div className="number-heading">
                    <span>{number}</span>
                    {point === number && <b>ON</b>}
                  </div>
                  <BetSpot
                    label="PLACE"
                    detail={number === 6 || number === 8 ? "Pays 7:6" : number === 5 || number === 9 ? "Pays 7:5" : "Pays 9:5"}
                    amount={bets.place[number]}
                    onClick={() => adjustNumber("place", number, `Place ${number}`)}
                    disabled={rolling}
                    compact
                  />
                  <div className="travel-bet">
                    <span>COME</span><Chip amount={comeFlat} small />
                  </div>
                  <BetSpot
                    label="COME ODDS"
                    detail={comeFlat > 0 ? `Max ${formatCredits(comeOddsMax)}` : "Needs Come bet"}
                    amount={bets.comeOdds[number]}
                    onClick={comeFlat > 0 ? () => adjustNumber("comeOdds", number, `Come odds ${number}`, comeOddsMax) : undefined}
                    disabled={rolling || comeFlat <= 0}
                    compact
                  />
                  <div className="travel-bet dont-travel">
                    <span>DON'T</span><Chip amount={dontFlat} small />
                  </div>
                  <BetSpot
                    label="LAY ODDS"
                    detail={dontFlat > 0 ? `Max ${formatCredits(dontOddsMax)}` : "Needs Don't Come"}
                    amount={bets.dontComeOdds[number]}
                    onClick={dontFlat > 0 ? () => adjustNumber("dontComeOdds", number, `Don't Come odds ${number}`, dontOddsMax) : undefined}
                    disabled={rolling || dontFlat <= 0}
                    compact
                  />
                </div>
              );
            })}
          </div>

          <div className="line-layout">
            <BetSpot
              label="DON'T COME"
              detail={canPlaceCome ? "2 or 3 wins · Bar 12" : "Available after a point"}
              amount={bets.dontCome}
              onClick={canPlaceCome ? () => adjustSimple("dontCome", "Don't Come") : undefined}
              disabled={rolling || !canPlaceCome}
              className="dont-come-box"
            />
            <BetSpot
              label="COME"
              detail={canPlaceCome ? "7 or 11 wins · Travels on a number" : "Available after a point"}
              amount={bets.come}
              onClick={canPlaceCome ? () => adjustSimple("come", "Come") : undefined}
              disabled={rolling || !canPlaceCome}
              className="come-box"
            />
          </div>

          <div className="center-action">
            <div className="hardway-grid" aria-label="Hardway bets">
              {HARDWAY_NUMBERS.map((number) => (
                <BetSpot
                  key={number}
                  label={`HARD ${number}`}
                  detail={number === 4 || number === 10 ? "Pays 7:1" : "Pays 9:1"}
                  amount={bets.hardways[number]}
                  onClick={() => adjustHardway(number)}
                  disabled={rolling}
                  compact
                />
              ))}
            </div>
            <div className="proposition-grid" aria-label="Proposition bets">
              {PROPOSITION_BETS.map((prop) => (
                <BetSpot
                  key={prop}
                  label={PROP_LABELS[prop].label}
                  detail={PROP_LABELS[prop].detail}
                  amount={bets.propositions[prop]}
                  onClick={() => adjustProposition(prop)}
                  disabled={rolling}
                  compact
                />
              ))}
            </div>
          </div>

          <BetSpot
            label="FIELD"
            detail="3, 4, 9, 10, 11 pay 1:1 · 2 and 12 pay 2:1"
            amount={bets.field}
            onClick={() => adjustSimple("field", "Field")}
            disabled={rolling}
            className="field-box"
          />

          <div className="contract-lines">
            <div className="contract-row dont-pass-row">
              <BetSpot
                label="DON'T PASS BAR 12"
                detail={canPlaceLine ? "Come-out bet · Pays even money" : "Locked while point is on"}
                amount={bets.dontPass}
                onClick={() => adjustSimple("dontPass", "Don't Pass", MAX_SPOT_BET, dontPassLocked)}
                disabled={rolling || (!canPlaceLine && !dontPassLocked)}
                locked={dontPassLocked}
              />
              <BetSpot
                label="LAY ODDS"
                detail={point && bets.dontPass > 0 ? "True odds · Up to 5×" : "Needs Don't Pass and point"}
                amount={bets.dontPassOdds}
                onClick={point && bets.dontPass > 0 ? () => adjustSimple("dontPassOdds", "Don't Pass odds", bets.dontPass * 5) : undefined}
                disabled={rolling || !point || bets.dontPass <= 0}
                compact
              />
            </div>
            <div className="contract-row pass-row">
              <BetSpot
                label="PASS LINE"
                detail={canPlaceLine ? "Come-out bet · Pays even money" : "Locked while point is on"}
                amount={bets.passLine}
                onClick={() => adjustSimple("passLine", "Pass Line", MAX_SPOT_BET, passLocked)}
                disabled={rolling || (!canPlaceLine && !passLocked)}
                locked={passLocked}
              />
              <BetSpot
                label="TAKE ODDS"
                detail={point && bets.passLine > 0 ? `True odds · Max ${formatCredits(getOddsLimit(point, bets.passLine))}` : "Needs Pass Line and point"}
                amount={bets.passOdds}
                onClick={point && bets.passLine > 0 ? () => adjustSimple("passOdds", "Pass odds", getOddsLimit(point, bets.passLine)) : undefined}
                disabled={rolling || !point || bets.passLine <= 0}
                compact
              />
            </div>
          </div>
        </div>

        <div className="craps-controls craps-controls-full">
          <div className="meter"><span>CREDITS</span><strong>{formatCredits(credits)}</strong></div>
          <div className="chip-selector" aria-label="Chip denomination">
            <button type="button" onClick={() => changeChip(-1)} disabled={rolling || chipIndex === 0} aria-label="Previous chip">−</button>
            <div><span>CHIP</span><strong>{formatCredits(chip)}</strong></div>
            <button type="button" onClick={() => changeChip(1)} disabled={rolling || chipIndex === CRAPS_CHIPS.length - 1} aria-label="Next chip">+</button>
          </div>
          <div className="bet-mode" aria-label="Bet editing mode">
            <button type="button" className={mode === "place" ? "active" : ""} onClick={() => setMode("place")} disabled={rolling}>PLACE</button>
            <button type="button" className={mode === "remove" ? "active" : ""} onClick={() => setMode("remove")} disabled={rolling}>REMOVE</button>
          </div>
          <button className="roll-button" type="button" onClick={roll} disabled={rolling || totalAtRisk <= 0}>
            <span>{rolling ? "ROLLING" : "ROLL DICE"}</span>
            <small>{point === null ? "COME-OUT" : `POINT ${point}`}</small>
          </button>
          <button className="clear-bets-button" type="button" onClick={clearRemovable} disabled={rolling || removableTotal <= 0}>
            <span>CLEAR REMOVABLE</span><strong>{formatCredits(removableTotal)}</strong>
          </button>
          <button
            className="refill-button"
            type="button"
            onClick={() => { refillCredits(); setOutcome(null); setMessage("Demo credits refilled. Select a chip and place your bets."); }}
            disabled={rolling || totalAtRisk > 0}
          >
            <span>REFILL</span><strong>10,000</strong>
          </button>
        </div>
      </section>

      <section className="lower-grid craps-lower-grid" aria-label="Craps information">
        <article className="info-card craps-rules-card">
          <div className="card-heading">
            <div><span className="section-number">01</span><h2>TABLE GUIDE</h2></div>
            <p>Place and hardway bets are off on the come-out roll.</p>
          </div>
          <div className="craps-rules-grid full-rules-grid">
            <div><strong>LINE + COME</strong><span>Contract bets pay even money. Add true-odds bets after a number is established.</span></div>
            <div><strong>PLACE</strong><span>Numbers stay up after winning and lose on a seven. Remove them between rolls.</span></div>
            <div><strong>CENTER</strong><span>Field and proposition bets resolve in one roll. Hardways stay until hit or beaten.</span></div>
            <div><strong>CHIPS</strong><span>Choose a denomination, click spots to add chips, then switch to Remove to take permitted bets down.</span></div>
          </div>
        </article>

        <aside className="info-stack">
          <article className="info-card history-card craps-history-card">
            <div className="card-heading compact"><div><span className="section-number">02</span><h2>RECENT ROLLS</h2></div></div>
            {history.length ? <div className="history-list">{history.map((item) => (
              <div key={item.id}>
                <span>{item.dice[0]} + {item.dice[1]} = {item.dice[0] + item.dice[1]} · {formatCredits(item.atRisk)} active</span>
                <strong className={item.net > 0 ? "positive" : item.net < 0 ? "negative" : "muted"}>{item.net > 0 ? `+${formatCredits(item.net)}` : item.net < 0 ? `−${formatCredits(Math.abs(item.net))}` : "—"}</strong>
                <small>{item.result}</small>
              </div>
            ))}</div> : <p className="empty-state">Your last eight rolls will appear here.</p>}
          </article>
          <article className="info-card controls-card">
            <span className="section-number">03</span><h2>QUICK CONTROLS</h2>
            <div className="key-row"><kbd>SPACE</kbd><span>Roll dice</span></div>
            <div className="key-row"><kbd>←</kbd><kbd>→</kbd><span>Change chip</span></div>
            <div className="key-row"><kbd>R</kbd><span>Place / remove</span></div>
          </article>
        </aside>
      </section>

      <footer><p>For entertainment only · No deposits · No withdrawals · Browser-generated outcomes</p><span>Slots, blackjack, and full-table craps · Built with Next.js</span></footer>
    </div>
  );
}
