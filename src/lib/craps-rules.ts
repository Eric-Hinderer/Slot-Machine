export type CrapsBet = "pass" | "dont-pass" | "field";
export type CrapsOutcome = "win" | "loss" | "push" | null;

export type CrapsResolution = {
  settled: boolean;
  returned: number;
  outcome: CrapsOutcome;
  result: string;
  message: string;
  point?: number;
};

const POINTS = new Set([4, 5, 6, 8, 9, 10]);
const FIELD_SINGLE = new Set([3, 4, 9, 10, 11]);
const credits = (value: number) => new Intl.NumberFormat("en-US").format(value);

export function resolveComeOut(betType: Exclude<CrapsBet, "field">, total: number, wager: number): CrapsResolution {
  if (POINTS.has(total)) {
    return {
      settled: false,
      returned: 0,
      outcome: null,
      result: `Point ${total}`,
      message: betType === "pass"
        ? `Point is ${total}. Roll ${total} again before a 7.`
        : `Point is ${total}. Don't Pass wins if a 7 appears first.`,
      point: total,
    };
  }

  if (betType === "pass") {
    if (total === 7 || total === 11) {
      return { settled: true, returned: wager * 2, outcome: "win", result: "Natural", message: `${total} on the come-out! Pass Line wins ${credits(wager)} credits.` };
    }
    return { settled: true, returned: 0, outcome: "loss", result: "Craps", message: `${total} loses the Pass Line wager.` };
  }

  if (total === 2 || total === 3) {
    return { settled: true, returned: wager * 2, outcome: "win", result: "Don't Pass win", message: `${total} on the come-out! Don't Pass wins ${credits(wager)} credits.` };
  }
  if (total === 12) {
    return { settled: true, returned: wager, outcome: "push", result: "Bar 12 push", message: "Bar 12 — the Don't Pass wager pushes." };
  }
  return { settled: true, returned: 0, outcome: "loss", result: "Natural", message: `${total} loses the Don't Pass wager.` };
}

export function resolvePoint(betType: Exclude<CrapsBet, "field">, point: number, total: number, wager: number): CrapsResolution {
  if (total !== point && total !== 7) {
    return { settled: false, returned: 0, outcome: null, result: `Point ${point} continues`, message: `${total}. Point remains ${point}.`, point };
  }

  if (total === point) {
    return betType === "pass"
      ? { settled: true, returned: wager * 2, outcome: "win", result: "Point made", message: `${point} repeats! Pass Line wins ${credits(wager)} credits.` }
      : { settled: true, returned: 0, outcome: "loss", result: "Point made", message: `${point} repeats. Don't Pass loses.` };
  }

  return betType === "pass"
    ? { settled: true, returned: 0, outcome: "loss", result: "Seven out", message: "Seven out. Pass Line loses." }
    : { settled: true, returned: wager * 2, outcome: "win", result: "Seven out", message: `Seven out! Don't Pass wins ${credits(wager)} credits.` };
}

export function resolveField(total: number, wager: number): CrapsResolution {
  if (total === 2 || total === 12) {
    return { settled: true, returned: wager * 3, outcome: "win", result: `${total} pays 2:1`, message: `${total}! Field pays 2:1 — you win ${credits(wager * 2)} credits.` };
  }
  if (FIELD_SINGLE.has(total)) {
    return { settled: true, returned: wager * 2, outcome: "win", result: "Field wins", message: `${total} wins the Field for ${credits(wager)} credits.` };
  }
  return { settled: true, returned: 0, outcome: "loss", result: "Field loses", message: `${total} is outside the Field.` };
}
