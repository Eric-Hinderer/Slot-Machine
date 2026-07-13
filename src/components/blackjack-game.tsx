"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type RoundPhase = "ready" | "player" | "settled";
type Outcome = "win" | "loss" | "push" | null;

type Card = {
  id: string;
  rank: Rank;
  suit: Suit;
};

type HandRecord = {
  id: number;
  wager: number;
  net: number;
  result: string;
};

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const BETS = [10, 20, 50, 100, 250, 500, 1000];
const STARTING_CREDITS = 10000;

const SUIT_MARKS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function buildDeck(): Card[] {
  const deck = SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })),
  );

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

function drawCard(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) throw new Error("The deck ran out of cards.");
  return card;
}

function getHandValue(hand: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === "A") {
      total += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  let reducedAces = 0;
  while (total > 21 && reducedAces < aces) {
    total -= 10;
    reducedAces += 1;
  }

  return { total, soft: aces > reducedAces };
}

function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && getHandValue(hand).total === 21;
}

function CardView({ card, hidden = false }: { card?: Card; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div className="playing-card card-back" aria-label="Hidden dealer card">
        <span>MF</span>
      </div>
    );
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";

  return (
    <div className={`playing-card ${isRed ? "red-card" : "black-card"}`} aria-label={`${card.rank} of ${card.suit}`}>
      <div className="card-corner">
        <strong>{card.rank}</strong>
        <span>{SUIT_MARKS[card.suit]}</span>
      </div>
      <div className="card-suit">{SUIT_MARKS[card.suit]}</div>
      <div className="card-corner card-corner-bottom">
        <strong>{card.rank}</strong>
        <span>{SUIT_MARKS[card.suit]}</span>
      </div>
    </div>
  );
}

export function BlackjackGame() {
  const [credits, setCredits] = useState(STARTING_CREDITS);
  const [bet, setBet] = useState(50);
  const [roundBet, setRoundBet] = useState(50);
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [phase, setPhase] = useState<RoundPhase>("ready");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [message, setMessage] = useState("Choose a wager and deal the cards.");
  const [history, setHistory] = useState<HandRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const playerValue = useMemo(() => getHandValue(playerHand), [playerHand]);
  const dealerValue = useMemo(() => getHandValue(dealerHand), [dealerHand]);
  const dealerVisibleValue = dealerHand.length > 0 ? getHandValue([dealerHand[0]]).total : 0;

  const addHistory = useCallback((wager: number, returned: number, result: string) => {
    setHistory((current) => [
      { id: Date.now(), wager, net: returned - wager, result },
      ...current,
    ].slice(0, 5));
  }, []);

  const finishRound = useCallback(
    (finalPlayer: Card[], finalDealer: Card[], wager: number) => {
      const playerTotal = getHandValue(finalPlayer).total;
      const dealerTotal = getHandValue(finalDealer).total;
      const playerNatural = isBlackjack(finalPlayer);
      const dealerNatural = isBlackjack(finalDealer);
      let returned = 0;
      let resultLabel = "Dealer wins";
      let nextOutcome: Outcome = "loss";
      let nextMessage = `Dealer wins ${dealerTotal} to ${playerTotal}.`;

      if (playerTotal > 21) {
        nextMessage = `Bust at ${playerTotal}. Dealer takes the hand.`;
        resultLabel = "Player bust";
      } else if (playerNatural && dealerNatural) {
        returned = wager;
        nextOutcome = "push";
        resultLabel = "Push";
        nextMessage = "Both hands have blackjack. Your wager is returned.";
      } else if (playerNatural) {
        returned = Math.round(wager * 2.5);
        nextOutcome = "win";
        resultLabel = "Blackjack";
        nextMessage = `Blackjack pays 3:2 — you win ${formatCredits(returned - wager)} credits.`;
      } else if (dealerNatural) {
        resultLabel = "Dealer blackjack";
        nextMessage = "Dealer has blackjack.";
      } else if (dealerTotal > 21) {
        returned = wager * 2;
        nextOutcome = "win";
        resultLabel = "Dealer bust";
        nextMessage = `Dealer busts at ${dealerTotal}. You win ${formatCredits(wager)} credits.`;
      } else if (playerTotal > dealerTotal) {
        returned = wager * 2;
        nextOutcome = "win";
        resultLabel = "Player wins";
        nextMessage = `You win ${playerTotal} to ${dealerTotal}.`;
      } else if (playerTotal === dealerTotal) {
        returned = wager;
        nextOutcome = "push";
        resultLabel = "Push";
        nextMessage = `Push at ${playerTotal}. Your wager is returned.`;
      }

      if (returned > 0) setCredits((current) => current + returned);
      setPlayerHand(finalPlayer);
      setDealerHand(finalDealer);
      setOutcome(nextOutcome);
      setMessage(nextMessage);
      setPhase("settled");
      addHistory(wager, returned, resultLabel);
    },
    [addHistory],
  );

  const playDealer = useCallback(
    (currentPlayer: Card[], currentDealer: Card[], currentDeck: Card[], wager: number) => {
      const dealerCards = [...currentDealer];
      const remainingDeck = [...currentDeck];

      while (getHandValue(dealerCards).total < 17) {
        dealerCards.push(drawCard(remainingDeck));
      }

      setDeck(remainingDeck);
      finishRound(currentPlayer, dealerCards, wager);
    },
    [finishRound],
  );

  const deal = useCallback(() => {
    if (phase === "player") return;
    if (credits < bet) {
      setOutcome("loss");
      setMessage("Not enough credits for that wager. Refill or lower the bet.");
      return;
    }

    const nextDeck = buildDeck();
    const nextPlayer = [drawCard(nextDeck), drawCard(nextDeck)];
    const nextDealer = [drawCard(nextDeck), drawCard(nextDeck)];

    setCredits((current) => current - bet);
    setRoundBet(bet);
    setDeck(nextDeck);
    setPlayerHand(nextPlayer);
    setDealerHand(nextDealer);
    setOutcome(null);

    if (isBlackjack(nextPlayer) || isBlackjack(nextDealer)) {
      finishRound(nextPlayer, nextDealer, bet);
    } else {
      setPhase("player");
      setMessage("Your move: hit, stand, or double down.");
    }
  }, [bet, credits, finishRound, phase]);

  const hit = useCallback(() => {
    if (phase !== "player") return;
    const nextDeck = [...deck];
    const nextPlayer = [...playerHand, drawCard(nextDeck)];
    const total = getHandValue(nextPlayer).total;

    setDeck(nextDeck);
    setPlayerHand(nextPlayer);

    if (total > 21) {
      finishRound(nextPlayer, dealerHand, roundBet);
    } else if (total === 21) {
      playDealer(nextPlayer, dealerHand, nextDeck, roundBet);
    } else {
      setMessage(`${total}. Hit again or stand.`);
    }
  }, [dealerHand, deck, finishRound, phase, playDealer, playerHand, roundBet]);

  const stand = useCallback(() => {
    if (phase !== "player") return;
    playDealer(playerHand, dealerHand, deck, roundBet);
  }, [dealerHand, deck, phase, playDealer, playerHand, roundBet]);

  const doubleDown = useCallback(() => {
    if (phase !== "player" || playerHand.length !== 2) return;
    if (credits < roundBet) {
      setMessage("You need enough credits to match the original wager before doubling.");
      return;
    }

    const nextDeck = [...deck];
    const nextPlayer = [...playerHand, drawCard(nextDeck)];
    const doubledWager = roundBet * 2;

    setCredits((current) => current - roundBet);
    setRoundBet(doubledWager);
    setDeck(nextDeck);

    if (getHandValue(nextPlayer).total > 21) {
      finishRound(nextPlayer, dealerHand, doubledWager);
    } else {
      playDealer(nextPlayer, dealerHand, nextDeck, doubledWager);
    }
  }, [credits, dealerHand, deck, finishRound, phase, playDealer, playerHand, roundBet]);

  const changeBet = useCallback(
    (direction: -1 | 1) => {
      if (phase === "player") return;
      const currentIndex = BETS.indexOf(bet);
      const nextIndex = Math.min(BETS.length - 1, Math.max(0, currentIndex + direction));
      setBet(BETS[nextIndex]);
      setRoundBet(BETS[nextIndex]);
      setOutcome(null);
    },
    [bet, phase],
  );

  const refillCredits = () => {
    if (phase === "player") return;
    setCredits(STARTING_CREDITS);
    setOutcome(null);
    setMessage("Demo credits refilled. The table is open.");
  };

  useEffect(() => {
    try {
      const savedCredits = Number(window.localStorage.getItem("midnight-fortune-credits"));
      const savedBet = Number(window.localStorage.getItem("midnight-blackjack-bet"));
      if (Number.isFinite(savedCredits) && savedCredits >= 0) setCredits(savedCredits);
      if (BETS.includes(savedBet)) {
        setBet(savedBet);
        setRoundBet(savedBet);
      }
    } catch {
      // The game remains usable when local storage is unavailable.
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem("midnight-fortune-credits", String(credits));
      window.localStorage.setItem("midnight-blackjack-bet", String(bet));
    } catch {
      // Persistence is optional.
    }
  }, [bet, credits, hasLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft") changeBet(-1);
      if (event.code === "ArrowRight") changeBet(1);
      if (event.key.toLowerCase() === "h") hit();
      if (event.key.toLowerCase() === "s") stand();
      if (event.key.toLowerCase() === "d" && phase === "player") doubleDown();
      if ((event.code === "Space" || event.code === "Enter") && phase !== "player") {
        event.preventDefault();
        deal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeBet, deal, doubleDown, hit, phase, stand]);

  const dealerScore = phase === "player" ? dealerVisibleValue : dealerValue.total;
  const canDouble = phase === "player" && playerHand.length === 2 && credits >= roundBet;

  return (
    <div className="game-shell blackjack-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="noise" />

      <header className="topbar">
        <a className="brand" href="#blackjack-table" aria-label="Midnight Fortune blackjack">
          <span className="brand-mark blackjack-brand-mark">♠</span>
          <span>
            <strong>MIDNIGHT</strong>
            <small>BLACKJACK</small>
          </span>
        </a>
        <div className="topbar-actions">
          <span className="demo-badge">VIRTUAL CREDITS</span>
          <span className="table-limit">MAX 1,000</span>
        </div>
      </header>

      <section className="hero-copy blackjack-hero" aria-labelledby="blackjack-title">
        <p className="eyebrow">CLASSIC RULES · DEALER STANDS ON 17 · BLACKJACK PAYS 3:2</p>
        <h1 id="blackjack-title">Own the <span>night table.</span></h1>
        <p>Build toward 21, read the dealer, and make every virtual-credit wager count.</p>
      </section>

      <section className="blackjack-wrap" id="blackjack-table" aria-label="Blackjack game">
        <div className="blackjack-glow" />
        <div className="blackjack-table">
          <div className="felt-mark felt-mark-top">BLACKJACK PAYS 3 TO 2</div>

          <div className="hand-zone dealer-zone">
            <div className="hand-heading">
              <span>DEALER</span>
              <strong>{dealerHand.length ? dealerScore : "—"}</strong>
            </div>
            <div className="card-row">
              {dealerHand.length ? dealerHand.map((card, index) => (
                <CardView key={card.id} card={card} hidden={phase === "player" && index === 1} />
              )) : <><CardView hidden /><CardView hidden /></>}
            </div>
          </div>

          <div className={`blackjack-message ${outcome ? `outcome-${outcome}` : ""}`} role="status">
            <span className="status-light" />
            <p>{message}</p>
          </div>

          <div className="hand-zone player-zone">
            <div className="hand-heading">
              <span>YOUR HAND</span>
              <strong>{playerHand.length ? playerValue.total : "—"}</strong>
            </div>
            <div className="card-row">
              {playerHand.length ? playerHand.map((card) => <CardView key={card.id} card={card} />) : <><CardView hidden /><CardView hidden /></>}
            </div>
          </div>

          <div className="felt-mark felt-mark-bottom">DEALER MUST DRAW TO 16 · STAND ON ALL 17</div>
        </div>

        <div className="blackjack-controls">
          <div className="meter">
            <span>CREDITS</span>
            <strong>{formatCredits(credits)}</strong>
          </div>

          <div className="bet-control" aria-label="Blackjack bet controls">
            <button type="button" onClick={() => changeBet(-1)} disabled={phase === "player" || bet === BETS[0]} aria-label="Decrease bet">−</button>
            <div><span>BET</span><strong>{formatCredits(bet)}</strong></div>
            <button type="button" onClick={() => changeBet(1)} disabled={phase === "player" || bet === BETS[BETS.length - 1]} aria-label="Increase bet">+</button>
          </div>

          <div className="blackjack-actions">
            {phase === "player" ? (
              <>
                <button className="table-action hit-action" type="button" onClick={hit}>HIT</button>
                <button className="table-action stand-action" type="button" onClick={stand}>STAND</button>
                <button className="table-action double-action" type="button" onClick={doubleDown} disabled={!canDouble}>DOUBLE</button>
              </>
            ) : (
              <button className="deal-button" type="button" onClick={deal}>
                <span>{phase === "settled" ? "DEAL AGAIN" : "DEAL"}</span>
                <small>{formatCredits(bet)} CREDITS</small>
              </button>
            )}
          </div>

          <button className="refill-button" type="button" onClick={refillCredits} disabled={phase === "player"}>
            <span>REFILL</span>
            <strong>10,000</strong>
          </button>
        </div>
      </section>

      <section className="lower-grid blackjack-lower-grid" aria-label="Blackjack information">
        <article className="info-card blackjack-rules-card">
          <div className="card-heading">
            <div><span className="section-number">01</span><h2>TABLE RULES</h2></div>
            <p>One freshly shuffled deck per hand.</p>
          </div>
          <div className="rules-grid">
            <div><strong>3:2</strong><span>Natural blackjack</span></div>
            <div><strong>17</strong><span>Dealer stands</span></div>
            <div><strong>2×</strong><span>Double down</span></div>
            <div><strong>1K</strong><span>Maximum wager</span></div>
          </div>
        </article>

        <aside className="info-stack">
          <article className="info-card history-card">
            <div className="card-heading compact"><div><span className="section-number">02</span><h2>RECENT HANDS</h2></div></div>
            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id}>
                    <span>BET {formatCredits(item.wager)}</span>
                    <strong className={item.net > 0 ? "positive" : item.net < 0 ? "negative" : "muted"}>{item.net > 0 ? `+${formatCredits(item.net)}` : item.net < 0 ? `−${formatCredits(Math.abs(item.net))}` : "PUSH"}</strong>
                    <small>{item.result}</small>
                  </div>
                ))}
              </div>
            ) : <p className="empty-state">Your last five hands will appear here.</p>}
          </article>

          <article className="info-card controls-card">
            <span className="section-number">03</span><h2>QUICK CONTROLS</h2>
            <div className="key-row"><kbd>H</kbd><span>Hit</span></div>
            <div className="key-row"><kbd>S</kbd><span>Stand</span></div>
            <div className="key-row"><kbd>D</kbd><span>Double</span></div>
          </article>
        </aside>
      </section>

      <footer>
        <p>For entertainment only · No deposits · No withdrawals · Browser-generated outcomes</p>
        <span>Slots and blackjack · Built with Next.js</span>
      </footer>
    </div>
  );
}
