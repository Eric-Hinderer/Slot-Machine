"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SymbolKey = "seven" | "wild" | "diamond" | "crown" | "cherry" | "bar";

type SpinRecord = {
  id: number;
  bet: number;
  payout: number;
  lines: number;
};

type WinResult = {
  payout: number;
  cells: Set<string>;
  lines: number;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const SYMBOLS: Record<
  SymbolKey,
  {
    label: string;
    caption: string;
    weight: number;
    payouts: Record<number, number>;
  }
> = {
  seven: {
    label: "7",
    caption: "LUCKY",
    weight: 6,
    payouts: { 3: 12, 4: 30, 5: 100 },
  },
  wild: {
    label: "★",
    caption: "WILD",
    weight: 8,
    payouts: { 3: 10, 4: 24, 5: 75 },
  },
  diamond: {
    label: "◆",
    caption: "DIAMOND",
    weight: 12,
    payouts: { 3: 8, 4: 18, 5: 50 },
  },
  crown: {
    label: "♛",
    caption: "CROWN",
    weight: 16,
    payouts: { 3: 6, 4: 14, 5: 35 },
  },
  cherry: {
    label: "●",
    caption: "CHERRY",
    weight: 25,
    payouts: { 3: 4, 4: 10, 5: 24 },
  },
  bar: {
    label: "BAR",
    caption: "CLASSIC",
    weight: 33,
    payouts: { 3: 3, 4: 7, 5: 16 },
  },
};

const SYMBOL_KEYS = Object.keys(SYMBOLS) as SymbolKey[];
const BETS = [10, 20, 50, 100];
const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
] as const;

const INITIAL_GRID: SymbolKey[][] = [
  ["diamond", "cherry", "crown", "bar", "wild"],
  ["seven", "seven", "seven", "diamond", "crown"],
  ["bar", "crown", "cherry", "wild", "bar"],
];

function pickWeightedSymbol(): SymbolKey {
  const roll = Math.random() * 100;
  let cursor = 0;

  for (const key of SYMBOL_KEYS) {
    cursor += SYMBOLS[key].weight;
    if (roll < cursor) return key;
  }

  return "bar";
}

function createGrid(): SymbolKey[][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () => pickWeightedSymbol()),
  );
}

function evaluateGrid(grid: SymbolKey[][], bet: number): WinResult {
  const lineBet = bet / PAYLINES.length;
  const winningCells = new Set<string>();
  let payout = 0;
  let winningLines = 0;

  PAYLINES.forEach((line) => {
    const lineSymbols = line.map((row, column) => grid[row][column]);
    const firstNonWild = lineSymbols.find((symbol) => symbol !== "wild");
    const target = firstNonWild ?? "wild";
    let matches = 0;

    for (const symbol of lineSymbols) {
      if (symbol === target || symbol === "wild") {
        matches += 1;
      } else {
        break;
      }
    }

    if (matches >= 3) {
      const multiplier = SYMBOLS[target].payouts[matches] ?? 0;
      payout += Math.round(lineBet * multiplier);
      winningLines += 1;

      for (let column = 0; column < matches; column += 1) {
        winningCells.add(`${line[column]}-${column}`);
      }
    }
  });

  return { payout, cells: winningCells, lines: winningLines };
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function SlotMachine() {
  const [grid, setGrid] = useState<SymbolKey[][]>(INITIAL_GRID);
  const [credits, setCredits] = useState(1000);
  const [bet, setBet] = useState(20);
  const [isSpinning, setIsSpinning] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [message, setMessage] = useState("Line up three or more symbols from the left.");
  const [winCells, setWinCells] = useState<Set<string>>(new Set());
  const [lastPayout, setLastPayout] = useState(0);
  const [history, setHistory] = useState<SpinRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const spinLock = useRef(false);
  const animationInterval = useRef<number | null>(null);
  const settleTimeout = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const bigWin = lastPayout >= bet * 10;

  const playTone = useCallback(
    (frequency: number, duration: number, type: OscillatorType = "sine", delay = 0) => {
      if (!soundOn) return;

      const AudioContextClass =
        window.AudioContext || (window as AudioWindow).webkitAudioContext;
      if (!AudioContextClass) return;

      const context = audioContext.current ?? new AudioContextClass();
      audioContext.current = context;

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    },
    [soundOn],
  );

  const playResultSound = useCallback(
    (payout: number) => {
      if (payout > 0) {
        [523, 659, 784, 1047].forEach((frequency, index) => {
          playTone(frequency, 0.22, "triangle", index * 0.09);
        });
      } else {
        playTone(150, 0.18, "sawtooth");
      }
    },
    [playTone],
  );

  const clearTimers = useCallback(() => {
    if (animationInterval.current !== null) {
      window.clearInterval(animationInterval.current);
      animationInterval.current = null;
    }
    if (settleTimeout.current !== null) {
      window.clearTimeout(settleTimeout.current);
      settleTimeout.current = null;
    }
  }, []);

  const spin = useCallback(() => {
    if (spinLock.current || isSpinning) return;

    if (credits < bet) {
      setMessage("Not enough credits. Refill the demo balance to keep playing.");
      playTone(110, 0.2, "square");
      return;
    }

    spinLock.current = true;
    setIsSpinning(true);
    setWinCells(new Set());
    setLastPayout(0);
    setMessage("Reels in motion…");
    setCredits((current) => current - bet);
    playTone(220, 0.12, "square");

    let ticks = 0;
    animationInterval.current = window.setInterval(() => {
      setGrid(createGrid());
      ticks += 1;
      if (ticks % 3 === 0) playTone(180 + ticks * 8, 0.04, "square");
    }, 85);

    settleTimeout.current = window.setTimeout(() => {
      clearTimers();
      const finalGrid = createGrid();
      const result = evaluateGrid(finalGrid, bet);

      setGrid(finalGrid);
      setWinCells(result.cells);
      setLastPayout(result.payout);
      setCredits((current) => current + result.payout);
      setHistory((current) => [
        {
          id: Date.now(),
          bet,
          payout: result.payout,
          lines: result.lines,
        },
        ...current,
      ].slice(0, 5));

      if (result.payout > 0) {
        const lineWord = result.lines === 1 ? "line" : "lines";
        setMessage(`Winner! ${result.lines} ${lineWord} paid ${formatCredits(result.payout)} credits.`);
      } else {
        setMessage("No win this spin. The next one could be yours.");
      }

      playResultSound(result.payout);
      setIsSpinning(false);
      spinLock.current = false;
    }, 1120);
  }, [bet, clearTimers, credits, isSpinning, playResultSound, playTone]);

  const changeBet = useCallback(
    (direction: -1 | 1) => {
      if (isSpinning) return;
      const currentIndex = BETS.indexOf(bet);
      const nextIndex = Math.min(BETS.length - 1, Math.max(0, currentIndex + direction));
      setBet(BETS[nextIndex]);
      setLastPayout(0);
    },
    [bet, isSpinning],
  );

  const refillCredits = () => {
    if (isSpinning) return;
    setCredits(1000);
    setLastPayout(0);
    setWinCells(new Set());
    setMessage("Demo credits refilled. Good luck!");
    playTone(440, 0.12, "triangle");
    playTone(660, 0.18, "triangle", 0.08);
  };

  useEffect(() => {
    try {
      const savedCredits = Number(window.localStorage.getItem("midnight-fortune-credits"));
      const savedBet = Number(window.localStorage.getItem("midnight-fortune-bet"));
      const savedSound = window.localStorage.getItem("midnight-fortune-sound");

      if (Number.isFinite(savedCredits) && savedCredits >= 0) setCredits(savedCredits);
      if (BETS.includes(savedBet)) setBet(savedBet);
      if (savedSound !== null) setSoundOn(savedSound === "true");
    } catch {
      // Local storage can be unavailable in private browsing contexts.
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem("midnight-fortune-credits", String(credits));
      window.localStorage.setItem("midnight-fortune-bet", String(bet));
      window.localStorage.setItem("midnight-fortune-sound", String(soundOn));
    } catch {
      // The game remains fully usable without persistence.
    }
  }, [bet, credits, hasLoaded, soundOn]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        spin();
      }
      if (event.code === "ArrowLeft") changeBet(-1);
      if (event.code === "ArrowRight") changeBet(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeBet, spin]);

  useEffect(() => {
    return () => {
      clearTimers();
      audioContext.current?.close().catch(() => undefined);
    };
  }, [clearTimers]);

  const payoutPreview = useMemo(
    () =>
      SYMBOL_KEYS.map((key) => ({
        key,
        symbol: SYMBOLS[key],
      })),
    [],
  );

  return (
    <div className="game-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="noise" />

      {bigWin && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      )}

      <header className="topbar">
        <a className="brand" href="#game" aria-label="Midnight Fortune home">
          <span className="brand-mark">7</span>
          <span>
            <strong>MIDNIGHT</strong>
            <small>FORTUNE</small>
          </span>
        </a>

        <div className="topbar-actions">
          <span className="demo-badge">VIRTUAL CREDITS</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setSoundOn((current) => !current)}
            aria-label={soundOn ? "Mute sound" : "Turn sound on"}
            title={soundOn ? "Mute sound" : "Turn sound on"}
          >
            {soundOn ? "♪" : "×"}
          </button>
        </div>
      </header>

      <section className="hero-copy" aria-labelledby="game-title">
        <p className="eyebrow">AFTER DARK · FIVE REELS · FIVE LINES</p>
        <h1 id="game-title">
          Chase the <span>midnight glow.</span>
        </h1>
        <p>Classic casino energy, reimagined as a fast, polished browser game.</p>
      </section>

      <section className="machine-wrap" id="game" aria-label="Slot machine game">
        <div className="machine-glow" />
        <div className="machine">
          <div className="machine-header">
            <div>
              <span className="machine-kicker">HOUSE ORIGINAL</span>
              <h2>MIDNIGHT FORTUNE</h2>
            </div>
            <div className="jackpot">
              <span>TOP PRIZE</span>
              <strong>100×</strong>
            </div>
          </div>

          <div className="reel-stage">
            <div className="line-tabs left-tabs" aria-hidden="true">
              {[2, 4, 1, 5, 3].map((line) => <span key={line}>{line}</span>)}
            </div>

            <div className={`reels ${isSpinning ? "spinning" : ""}`} aria-live="polite">
              {Array.from({ length: 5 }, (_, column) => (
                <div className="reel" key={column}>
                  {grid.map((row, rowIndex) => {
                    const key = row[column];
                    const symbol = SYMBOLS[key];
                    const isWinner = winCells.has(`${rowIndex}-${column}`);

                    return (
                      <div
                        className={`symbol symbol-${key} ${isWinner ? "winner" : ""}`}
                        key={`${rowIndex}-${column}`}
                        aria-label={symbol.caption}
                      >
                        <span className="symbol-glyph">{symbol.label}</span>
                        <span className="symbol-caption">{symbol.caption}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="line-tabs right-tabs" aria-hidden="true">
              {[2, 4, 1, 5, 3].map((line) => <span key={line}>{line}</span>)}
            </div>
          </div>

          <div className={`message-bar ${lastPayout > 0 ? "has-win" : ""}`} role="status">
            <span className="status-light" />
            <p>{message}</p>
            {lastPayout > 0 && <strong>+{formatCredits(lastPayout)}</strong>}
          </div>

          <div className="controls">
            <div className="meter">
              <span>CREDITS</span>
              <strong>{formatCredits(credits)}</strong>
            </div>

            <div className="bet-control" aria-label="Bet controls">
              <button
                type="button"
                onClick={() => changeBet(-1)}
                disabled={isSpinning || bet === BETS[0]}
                aria-label="Decrease bet"
              >
                −
              </button>
              <div>
                <span>BET</span>
                <strong>{bet}</strong>
              </div>
              <button
                type="button"
                onClick={() => changeBet(1)}
                disabled={isSpinning || bet === BETS[BETS.length - 1]}
                aria-label="Increase bet"
              >
                +
              </button>
            </div>

            <button
              className="spin-button"
              type="button"
              onClick={spin}
              disabled={isSpinning}
              aria-label={isSpinning ? "Reels are spinning" : `Spin for ${bet} credits`}
            >
              <span className="spin-ring">
                <span>{isSpinning ? "SPINNING" : "SPIN"}</span>
                <small>{isSpinning ? "GOOD LUCK" : `${bet} CREDITS`}</small>
              </span>
            </button>

            <button className="refill-button" type="button" onClick={refillCredits} disabled={isSpinning}>
              <span>REFILL</span>
              <strong>1,000</strong>
            </button>
          </div>
        </div>
      </section>

      <section className="lower-grid" aria-label="Game information">
        <article className="info-card paytable-card">
          <div className="card-heading">
            <div>
              <span className="section-number">01</span>
              <h2>PAYTABLE</h2>
            </div>
            <p>Multipliers apply to each five-line bet.</p>
          </div>
          <div className="paytable">
            {payoutPreview.map(({ key, symbol }) => (
              <div className="pay-row" key={key}>
                <div className={`mini-symbol symbol-${key}`}>{symbol.label}</div>
                <div className="pay-name">
                  <strong>{symbol.caption}</strong>
                  {key === "wild" && <small>Substitutes for every symbol</small>}
                </div>
                <span>3× {symbol.payouts[3]}</span>
                <span>4× {symbol.payouts[4]}</span>
                <span>5× {symbol.payouts[5]}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="info-stack">
          <article className="info-card history-card">
            <div className="card-heading compact">
              <div>
                <span className="section-number">02</span>
                <h2>RECENT SPINS</h2>
              </div>
            </div>
            {history.length > 0 ? (
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id}>
                    <span>BET {item.bet}</span>
                    <strong className={item.payout > 0 ? "positive" : "muted"}>
                      {item.payout > 0 ? `+${formatCredits(item.payout)}` : "—"}
                    </strong>
                    <small>{item.lines ? `${item.lines} line${item.lines > 1 ? "s" : ""}` : "no win"}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Your last five spins will appear here.</p>
            )}
          </article>

          <article className="info-card controls-card">
            <span className="section-number">03</span>
            <h2>QUICK CONTROLS</h2>
            <div className="key-row"><kbd>SPACE</kbd><span>Spin reels</span></div>
            <div className="key-row"><kbd>←</kbd><kbd>→</kbd><span>Change bet</span></div>
          </article>
        </aside>
      </section>

      <footer>
        <p>For entertainment only · No deposits · No withdrawals · Browser-generated outcomes</p>
        <span>Built for the web with Next.js</span>
      </footer>
    </div>
  );
}
