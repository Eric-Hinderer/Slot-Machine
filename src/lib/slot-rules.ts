export type SymbolKey = "seven" | "wild" | "diamond" | "crown" | "cherry" | "bar";

export type SlotSymbol = {
  label: string;
  caption: string;
  weight: number;
  payouts: Record<number, number>;
};

export type WinResult = {
  payout: number;
  cells: Set<string>;
  lines: number;
};

export const SYMBOLS: Record<SymbolKey, SlotSymbol> = {
  seven: { label: "7", caption: "LUCKY", weight: 6, payouts: { 3: 12, 4: 30, 5: 100 } },
  wild: { label: "★", caption: "WILD", weight: 8, payouts: { 3: 10, 4: 24, 5: 75 } },
  diamond: { label: "◆", caption: "DIAMOND", weight: 12, payouts: { 3: 8, 4: 18, 5: 50 } },
  crown: { label: "♛", caption: "CROWN", weight: 16, payouts: { 3: 6, 4: 14, 5: 35 } },
  cherry: { label: "●", caption: "CHERRY", weight: 25, payouts: { 3: 4, 4: 10, 5: 24 } },
  bar: { label: "BAR", caption: "CLASSIC", weight: 33, payouts: { 3: 3, 4: 7, 5: 16 } },
};

export const SYMBOL_KEYS = Object.keys(SYMBOLS) as SymbolKey[];
export const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
] as const;

export function pickWeightedSymbol(random = Math.random): SymbolKey {
  const roll = random() * 100;
  let cursor = 0;
  for (const key of SYMBOL_KEYS) {
    cursor += SYMBOLS[key].weight;
    if (roll < cursor) return key;
  }
  return "bar";
}

export function createGrid(random = Math.random): SymbolKey[][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () => pickWeightedSymbol(random)),
  );
}

export function evaluateGrid(grid: SymbolKey[][], bet: number): WinResult {
  if (grid.length !== 3 || grid.some((row) => row.length !== 5)) {
    throw new Error("A slot grid must contain three rows and five columns.");
  }

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
      if (symbol === target || symbol === "wild") matches += 1;
      else break;
    }

    if (matches >= 3) {
      payout += Math.round(lineBet * (SYMBOLS[target].payouts[matches] ?? 0));
      winningLines += 1;
      for (let column = 0; column < matches; column += 1) {
        winningCells.add(`${line[column]}-${column}`);
      }
    }
  });

  return { payout, cells: winningCells, lines: winningLines };
}
