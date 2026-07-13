"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CASINO_BETS, formatCredits, isEditableTarget, useCredits } from "@/components/credits-context";
import { createGrid, evaluateGrid, SYMBOL_KEYS, SYMBOLS, type SymbolKey } from "@/lib/slot-rules";

type Props = { active: boolean; onBusyChange: (busy: boolean) => void };
type SpinRecord = { id: number; bet: number; payout: number; lines: number };
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

const INITIAL_GRID: SymbolKey[][] = [
  ["diamond", "cherry", "crown", "bar", "wild"],
  ["seven", "seven", "seven", "diamond", "crown"],
  ["bar", "crown", "cherry", "wild", "bar"],
];

export function SlotMachine({ active, onBusyChange }: Props) {
  const { credits, spendCredits, addCredits, refillCredits } = useCredits();
  const [grid, setGrid] = useState(INITIAL_GRID);
  const [betIndex, setBetIndex] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [message, setMessage] = useState("Line up three or more symbols from the left.");
  const [winCells, setWinCells] = useState<Set<string>>(new Set());
  const [lastPayout, setLastPayout] = useState(0);
  const [history, setHistory] = useState<SpinRecord[]>([]);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const bet = CASINO_BETS[betIndex];

  const tone = useCallback((frequency: number, duration = 0.1) => {
    if (!soundOn) return;
    const Audio = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Audio) return;
    const context = audioRef.current ?? new Audio();
    audioRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }, [soundOn]);

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const spin = useCallback(() => {
    if (spinning) return;
    if (!spendCredits(bet)) {
      setMessage("Not enough credits. Refill or lower the bet.");
      tone(120);
      return;
    }

    setSpinning(true);
    setWinCells(new Set());
    setLastPayout(0);
    setMessage("Reels in motion…");
    tone(220);

    intervalRef.current = window.setInterval(() => setGrid(createGrid()), 85);
    timeoutRef.current = window.setTimeout(() => {
      clearTimers();
      const finalGrid = createGrid();
      const result = evaluateGrid(finalGrid, bet);
      setGrid(finalGrid);
      setWinCells(result.cells);
      setLastPayout(result.payout);
      addCredits(result.payout);
      setHistory((current) => [{ id: Date.now(), bet, payout: result.payout, lines: result.lines }, ...current].slice(0, 5));
      setMessage(result.payout > 0
        ? `Winner! ${result.lines} line${result.lines === 1 ? "" : "s"} paid ${formatCredits(result.payout)} credits.`
        : "No win this spin. The next one could be yours.");
      tone(result.payout > 0 ? 760 : 150, result.payout > 0 ? 0.25 : 0.12);
      setSpinning(false);
    }, 1120);
  }, [addCredits, bet, clearTimers, spendCredits, spinning, tone]);

  const changeBet = useCallback((direction: -1 | 1) => {
    if (spinning) return;
    setBetIndex((current) => Math.min(CASINO_BETS.length - 1, Math.max(0, current + direction)));
    setLastPayout(0);
  }, [spinning]);

  useEffect(() => onBusyChange(spinning), [onBusyChange, spinning]);
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (event.code === "Space") { event.preventDefault(); spin(); }
      if (event.code === "ArrowLeft") changeBet(-1);
      if (event.code === "ArrowRight") changeBet(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, changeBet, spin]);
  useEffect(() => () => {
    clearTimers();
    audioRef.current?.close().catch(() => undefined);
    onBusyChange(false);
  }, [clearTimers, onBusyChange]);

  const paytable = useMemo(() => SYMBOL_KEYS.map((key) => ({ key, ...SYMBOLS[key] })), []);

  return (
    <div className="game-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="noise" />
      {lastPayout >= bet * 10 && <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <span key={i} />)}</div>}
      <header className="topbar">
        <a className="brand" href="#game"><span className="brand-mark">7</span><span><strong>MIDNIGHT</strong><small>FORTUNE</small></span></a>
        <div className="topbar-actions"><span className="demo-badge">VIRTUAL CREDITS</span><button className="icon-button" type="button" onClick={() => setSoundOn((value) => !value)} aria-label="Toggle sound">{soundOn ? "♪" : "×"}</button></div>
      </header>
      <section className="hero-copy"><p className="eyebrow">AFTER DARK · FIVE REELS · FIVE LINES</p><h1>Chase the <span>midnight glow.</span></h1><p>Classic casino energy, reimagined as a fast browser game.</p></section>
      <section className="machine-wrap" id="game">
        <div className="machine-glow" /><div className="machine">
          <div className="machine-header"><div><span className="machine-kicker">HOUSE ORIGINAL</span><h2>MIDNIGHT FORTUNE</h2></div><div className="jackpot"><span>MAX BET</span><strong>1,000</strong></div></div>
          <div className="reel-stage"><div className="line-tabs left-tabs">{[2,4,1,5,3].map((n) => <span key={n}>{n}</span>)}</div><div className={`reels ${spinning ? "spinning" : ""}`}>
            {Array.from({ length: 5 }, (_, column) => <div className="reel" key={column}>{grid.map((row, rowIndex) => {
              const key = row[column]; const symbol = SYMBOLS[key];
              return <div className={`symbol symbol-${key} ${winCells.has(`${rowIndex}-${column}`) ? "winner" : ""}`} key={`${rowIndex}-${column}`}><span className="symbol-glyph">{symbol.label}</span><span className="symbol-caption">{symbol.caption}</span></div>;
            })}</div>)}
          </div><div className="line-tabs right-tabs">{[2,4,1,5,3].map((n) => <span key={n}>{n}</span>)}</div></div>
          <div className={`message-bar ${lastPayout > 0 ? "has-win" : ""}`} role="status"><span className="status-light" /><p>{message}</p>{lastPayout > 0 && <strong>+{formatCredits(lastPayout)}</strong>}</div>
          <div className="controls">
            <div className="meter"><span>CREDITS</span><strong>{formatCredits(credits)}</strong></div>
            <div className="bet-control"><button type="button" onClick={() => changeBet(-1)} disabled={spinning || betIndex === 0}>−</button><div><span>BET</span><strong>{formatCredits(bet)}</strong></div><button type="button" onClick={() => changeBet(1)} disabled={spinning || betIndex === CASINO_BETS.length - 1}>+</button></div>
            <button className="spin-button" type="button" onClick={spin} disabled={spinning}><span className="spin-ring"><span>{spinning ? "SPINNING" : "SPIN"}</span><small>{spinning ? "GOOD LUCK" : `${formatCredits(bet)} CREDITS`}</small></span></button>
            <button className="refill-button" type="button" onClick={() => { refillCredits(); setMessage("Demo credits refilled. Good luck!"); }} disabled={spinning}><span>REFILL</span><strong>10,000</strong></button>
          </div>
        </div>
      </section>
      <section className="lower-grid"><article className="info-card paytable-card"><div className="card-heading"><div><span className="section-number">01</span><h2>PAYTABLE</h2></div><p>Multipliers apply to each five-line bet.</p></div><div className="paytable">{paytable.map((symbol) => <div className="pay-row" key={symbol.key}><div className={`mini-symbol symbol-${symbol.key}`}>{symbol.label}</div><div className="pay-name"><strong>{symbol.caption}</strong>{symbol.key === "wild" && <small>Substitutes for every symbol</small>}</div><span>3× {symbol.payouts[3]}</span><span>4× {symbol.payouts[4]}</span><span>5× {symbol.payouts[5]}</span></div>)}</div></article>
        <aside className="info-stack"><article className="info-card history-card"><div className="card-heading compact"><div><span className="section-number">02</span><h2>RECENT SPINS</h2></div></div>{history.length ? <div className="history-list">{history.map((item) => <div key={item.id}><span>BET {formatCredits(item.bet)}</span><strong className={item.payout ? "positive" : "muted"}>{item.payout ? `+${formatCredits(item.payout)}` : "—"}</strong><small>{item.lines ? `${item.lines} line${item.lines === 1 ? "" : "s"}` : "no win"}</small></div>)}</div> : <p className="empty-state">Your last five spins will appear here.</p>}</article>
        <article className="info-card controls-card"><span className="section-number">03</span><h2>QUICK CONTROLS</h2><div className="key-row"><kbd>SPACE</kbd><span>Spin reels</span></div><div className="key-row"><kbd>←</kbd><kbd>→</kbd><span>Change bet</span></div></article></aside>
      </section>
      <footer><p>For entertainment only · No deposits · No withdrawals · Browser-generated outcomes</p><span>Slots, blackjack, and craps · Built with Next.js</span></footer>
    </div>
  );
}
