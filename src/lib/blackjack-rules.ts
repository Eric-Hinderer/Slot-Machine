export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type BlackjackCard = { rank: Rank };

export function getHandValue(hand: BlackjackCard[]): { total: number; soft: boolean } {
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

export function isBlackjack(hand: BlackjackCard[]): boolean {
  return hand.length === 2 && getHandValue(hand).total === 21;
}
