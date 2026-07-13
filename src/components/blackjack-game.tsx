"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CASINO_BETS, formatCredits, isEditableTarget, useCredits } from "@/components/credits-context";
import { getHandValue, isBlackjack, type Rank } from "@/lib/blackjack-rules";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Phase = "ready" | "player" | "settled";
type Outcome = "win" | "loss" | "push" | null;
type Card = { id: string; rank: Rank; suit: Suit };
type RecordItem = { id: number; wager: number; net: number; result: string };
type Props = { active: boolean; onBusyChange: (busy: boolean) => void };

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const MARKS: Record<Suit, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };

function buildDeck(): Card[] {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function draw(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) throw new Error("The deck ran out of cards.");
  return card;
}

function CardView({ card, hidden = false }: { card?: Card; hidden?: boolean }) {
  if (!card || hidden) return <div className="playing-card card-back" aria-label="Hidden card"><span>MF</span></div>;
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return <div className={`playing-card ${red ? "red-card" : "black-card"}`} aria-label={`${card.rank} of ${card.suit}`}>
    <div className="card-corner"><strong>{card.rank}</strong><span>{MARKS[card.suit]}</span></div>
    <div className="card-suit">{MARKS[card.suit]}</div>
    <div className="card-corner card-corner-bottom"><strong>{card.rank}</strong><span>{MARKS[card.suit]}</span></div>
  </div>;
}

export function BlackjackGame({ active, onBusyChange }: Props) {
  const { credits, spendCredits, addCredits, refillCredits } = useCredits();
  const [betIndex, setBetIndex] = useState(2);
  const [roundBet, setRoundBet] = useState(CASINO_BETS[2]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [message, setMessage] = useState("Choose a wager and deal the cards.");
  const [history, setHistory] = useState<RecordItem[]>([]);
  const bet = CASINO_BETS[betIndex];
  const playerValue = useMemo(() => getHandValue(player).total, [player]);
  const dealerValue = useMemo(() => getHandValue(dealer).total, [dealer]);
  const visibleDealerValue = dealer.length ? getHandValue([dealer[0]]).total : 0;

  const finish = useCallback((finalPlayer: Card[], finalDealer: Card[], wager: number) => {
    const p = getHandValue(finalPlayer).total;
    const d = getHandValue(finalDealer).total;
    const playerNatural = isBlackjack(finalPlayer);
    const dealerNatural = isBlackjack(finalDealer);
    let returned = 0;
    let nextOutcome: Outcome = "loss";
    let result = "Dealer wins";
    let nextMessage = `Dealer wins ${d} to ${p}.`;

    if (p > 21) { result = "Player bust"; nextMessage = `Bust at ${p}. Dealer takes the hand.`; }
    else if (playerNatural && dealerNatural) { returned = wager; nextOutcome = "push"; result = "Push"; nextMessage = "Both hands have blackjack. Your wager is returned."; }
    else if (playerNatural) { returned = Math.round(wager * 2.5); nextOutcome = "win"; result = "Blackjack"; nextMessage = `Blackjack pays 3:2 — you win ${formatCredits(returned - wager)} credits.`; }
    else if (dealerNatural) { result = "Dealer blackjack"; nextMessage = "Dealer has blackjack."; }
    else if (d > 21) { returned = wager * 2; nextOutcome = "win"; result = "Dealer bust"; nextMessage = `Dealer busts at ${d}. You win ${formatCredits(wager)} credits.`; }
    else if (p > d) { returned = wager * 2; nextOutcome = "win"; result = "Player wins"; nextMessage = `You win ${p} to ${d}.`; }
    else if (p === d) { returned = wager; nextOutcome = "push"; result = "Push"; nextMessage = `Push at ${p}. Your wager is returned.`; }

    addCredits(returned);
    setPlayer(finalPlayer);
    setDealer(finalDealer);
    setOutcome(nextOutcome);
    setMessage(nextMessage);
    setPhase("settled");
    setHistory((current) => [{ id: Date.now(), wager, net: returned - wager, result }, ...current].slice(0, 5));
  }, [addCredits]);

  const playDealer = useCallback((currentPlayer: Card[], currentDealer: Card[], currentDeck: Card[], wager: number) => {
    const nextDealer = [...currentDealer];
    const nextDeck = [...currentDeck];
    while (getHandValue(nextDealer).total < 17) nextDealer.push(draw(nextDeck));
    setDeck(nextDeck);
    finish(currentPlayer, nextDealer, wager);
  }, [finish]);

  const deal = useCallback(() => {
    if (phase === "player") return;
    if (!spendCredits(bet)) { setOutcome("loss"); setMessage("Not enough credits. Refill or lower the bet."); return; }
    const nextDeck = buildDeck();
    const nextPlayer = [draw(nextDeck), draw(nextDeck)];
    const nextDealer = [draw(nextDeck), draw(nextDeck)];
    setRoundBet(bet);
    setDeck(nextDeck);
    setPlayer(nextPlayer);
    setDealer(nextDealer);
    setOutcome(null);
    if (isBlackjack(nextPlayer) || isBlackjack(nextDealer)) finish(nextPlayer, nextDealer, bet);
    else { setPhase("player"); setMessage("Your move: hit, stand, or double down."); }
  }, [bet, finish, phase, spendCredits]);

  const hit = useCallback(() => {
    if (phase !== "player") return;
    const nextDeck = [...deck];
    const nextPlayer = [...player, draw(nextDeck)];
    const total = getHandValue(nextPlayer).total;
    setDeck(nextDeck);
    setPlayer(nextPlayer);
    if (total > 21) finish(nextPlayer, dealer, roundBet);
    else if (total === 21) playDealer(nextPlayer, dealer, nextDeck, roundBet);
    else setMessage(`${total}. Hit again or stand.`);
  }, [dealer, deck, finish, phase, playDealer, player, roundBet]);

  const stand = useCallback(() => {
    if (phase === "player") playDealer(player, dealer, deck, roundBet);
  }, [dealer, deck, phase, playDealer, player, roundBet]);

  const doubleDown = useCallback(() => {
    if (phase !== "player" || player.length !== 2) return;
    if (!spendCredits(roundBet)) { setMessage("You need enough credits to match the original wager."); return; }
    const nextDeck = [...deck];
    const nextPlayer = [...player, draw(nextDeck)];
    const doubled = roundBet * 2;
    setRoundBet(doubled);
    setDeck(nextDeck);
    if (getHandValue(nextPlayer).total > 21) finish(nextPlayer, dealer, doubled);
    else playDealer(nextPlayer, dealer, nextDeck, doubled);
  }, [dealer, deck, finish, phase, playDealer, player, roundBet, spendCredits]);

  const changeBet = useCallback((direction: -1 | 1) => {
    if (phase === "player") return;
    setBetIndex((current) => Math.min(CASINO_BETS.length - 1, Math.max(0, current + direction)));
    setOutcome(null);
  }, [phase]);

  useEffect(() => onBusyChange(phase === "player"), [onBusyChange, phase]);
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (event.code === "ArrowLeft") changeBet(-1);
      if (event.code === "ArrowRight") changeBet(1);
      if (event.key.toLowerCase() === "h") hit();
      if (event.key.toLowerCase() === "s") stand();
      if (event.key.toLowerCase() === "d") doubleDown();
      if ((event.code === "Space" || event.code === "Enter") && phase !== "player") { event.preventDefault(); deal(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, changeBet, deal, doubleDown, hit, phase, stand]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const canDouble = phase === "player" && player.length === 2 && credits >= roundBet;
  const shownDealer = phase === "player" ? visibleDealerValue : dealerValue;

  return <div className="game-shell blackjack-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="noise" />
    <header className="topbar"><a className="brand" href="#blackjack-table"><span className="brand-mark blackjack-brand-mark">♠</span><span><strong>MIDNIGHT</strong><small>BLACKJACK</small></span></a><div className="topbar-actions"><span className="demo-badge">VIRTUAL CREDITS</span><span className="table-limit">MAX 1,000</span></div></header>
    <section className="hero-copy blackjack-hero"><p className="eyebrow">DEALER STANDS ON 17 · BLACKJACK PAYS 3:2</p><h1>Own the <span>night table.</span></h1><p>Build toward 21, read the dealer, and make every virtual-credit wager count.</p></section>
    <section className="blackjack-wrap" id="blackjack-table"><div className="blackjack-glow" /><div className="blackjack-table">
      <div className="felt-mark felt-mark-top">BLACKJACK PAYS 3 TO 2</div>
      <div className="hand-zone dealer-zone"><div className="hand-heading"><span>DEALER</span><strong>{dealer.length ? shownDealer : "—"}</strong></div><div className="card-row">{dealer.length ? dealer.map((card, index) => <CardView key={card.id} card={card} hidden={phase === "player" && index === 1} />) : <><CardView hidden /><CardView hidden /></>}</div></div>
      <div className={`blackjack-message ${outcome ? `outcome-${outcome}` : ""}`} role="status"><span className="status-light" /><p>{message}</p></div>
      <div className="hand-zone player-zone"><div className="hand-heading"><span>YOUR HAND</span><strong>{player.length ? playerValue : "—"}</strong></div><div className="card-row">{player.length ? player.map((card) => <CardView key={card.id} card={card} />) : <><CardView hidden /><CardView hidden /></>}</div></div>
      <div className="felt-mark felt-mark-bottom">DEALER DRAWS TO 16 · STANDS ON ALL 17</div>
    </div>
    <div className="blackjack-controls"><div className="meter"><span>CREDITS</span><strong>{formatCredits(credits)}</strong></div><div className="bet-control"><button type="button" onClick={() => changeBet(-1)} disabled={phase === "player" || betIndex === 0}>−</button><div><span>BET</span><strong>{formatCredits(bet)}</strong></div><button type="button" onClick={() => changeBet(1)} disabled={phase === "player" || betIndex === CASINO_BETS.length - 1}>+</button></div>
      <div className="blackjack-actions">{phase === "player" ? <><button className="table-action hit-action" type="button" onClick={hit}>HIT</button><button className="table-action stand-action" type="button" onClick={stand}>STAND</button><button className="table-action double-action" type="button" onClick={doubleDown} disabled={!canDouble}>DOUBLE</button></> : <button className="deal-button" type="button" onClick={deal}><span>{phase === "settled" ? "DEAL AGAIN" : "DEAL"}</span><small>{formatCredits(bet)} CREDITS</small></button>}</div>
      <button className="refill-button" type="button" onClick={() => { refillCredits(); setOutcome(null); setMessage("Demo credits refilled. The table is open."); }} disabled={phase === "player"}><span>REFILL</span><strong>10,000</strong></button>
    </div></section>
    <section className="lower-grid blackjack-lower-grid"><article className="info-card blackjack-rules-card"><div className="card-heading"><div><span className="section-number">01</span><h2>TABLE RULES</h2></div><p>One freshly shuffled deck per hand.</p></div><div className="rules-grid"><div><strong>3:2</strong><span>Natural blackjack</span></div><div><strong>17</strong><span>Dealer stands</span></div><div><strong>2×</strong><span>Double down</span></div><div><strong>1K</strong><span>Maximum wager</span></div></div></article>
      <aside className="info-stack"><article className="info-card history-card"><div className="card-heading compact"><div><span className="section-number">02</span><h2>RECENT HANDS</h2></div></div>{history.length ? <div className="history-list">{history.map((item) => <div key={item.id}><span>BET {formatCredits(item.wager)}</span><strong className={item.net > 0 ? "positive" : item.net < 0 ? "negative" : "muted"}>{item.net > 0 ? `+${formatCredits(item.net)}` : item.net < 0 ? `−${formatCredits(Math.abs(item.net))}` : "PUSH"}</strong><small>{item.result}</small></div>)}</div> : <p className="empty-state">Your last five hands will appear here.</p>}</article><article className="info-card controls-card"><span className="section-number">03</span><h2>QUICK CONTROLS</h2><div className="key-row"><kbd>H</kbd><span>Hit</span></div><div className="key-row"><kbd>S</kbd><span>Stand</span></div><div className="key-row"><kbd>D</kbd><span>Double</span></div></article></aside>
    </section>
    <footer><p>For entertainment only · No deposits · No withdrawals · Browser-generated outcomes</p><span>Slots, blackjack, and craps · Built with Next.js</span></footer>
  </div>;
}
