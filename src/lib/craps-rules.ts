export const POINT_NUMBERS = [4, 5, 6, 8, 9, 10] as const;
export const HARDWAY_NUMBERS = [4, 6, 8, 10] as const;
export const PROPOSITION_BETS = [
  "any-seven",
  "any-craps",
  "yo",
  "ace-deuce",
  "snake-eyes",
  "boxcars",
] as const;

export type PointNumber = (typeof POINT_NUMBERS)[number];
export type HardwayNumber = (typeof HARDWAY_NUMBERS)[number];
export type PropositionBet = (typeof PROPOSITION_BETS)[number];
export type CrapsOutcome = "win" | "loss" | "push" | null;
export type NumberBetMap = Record<PointNumber, number>;
export type HardwayBetMap = Record<HardwayNumber, number>;
export type PropositionBetMap = Record<PropositionBet, number>;

export type CrapsTableBets = {
  passLine: number;
  dontPass: number;
  passOdds: number;
  dontPassOdds: number;
  come: number;
  dontCome: number;
  comePoints: NumberBetMap;
  dontComePoints: NumberBetMap;
  comeOdds: NumberBetMap;
  dontComeOdds: NumberBetMap;
  place: NumberBetMap;
  hardways: HardwayBetMap;
  field: number;
  propositions: PropositionBetMap;
};

export type CrapsEventKind = "win" | "loss" | "push" | "move" | "point";

export type CrapsEvent = {
  kind: CrapsEventKind;
  label: string;
  stake: number;
  profit: number;
  credit: number;
};

export type CrapsRollResolution = {
  nextPoint: PointNumber | null;
  nextBets: CrapsTableBets;
  creditReturn: number;
  net: number;
  outcome: CrapsOutcome;
  summary: string;
  events: CrapsEvent[];
};

const POINT_SET = new Set<number>(POINT_NUMBERS);
const FIELD_SINGLE = new Set([3, 4, 9, 10, 11]);
const credits = (value: number) => new Intl.NumberFormat("en-US").format(value);

function emptyNumberMap(): NumberBetMap {
  return { 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0 };
}

function emptyHardwayMap(): HardwayBetMap {
  return { 4: 0, 6: 0, 8: 0, 10: 0 };
}

function emptyPropositionMap(): PropositionBetMap {
  return {
    "any-seven": 0,
    "any-craps": 0,
    yo: 0,
    "ace-deuce": 0,
    "snake-eyes": 0,
    boxcars: 0,
  };
}

export function createEmptyCrapsBets(): CrapsTableBets {
  return {
    passLine: 0,
    dontPass: 0,
    passOdds: 0,
    dontPassOdds: 0,
    come: 0,
    dontCome: 0,
    comePoints: emptyNumberMap(),
    dontComePoints: emptyNumberMap(),
    comeOdds: emptyNumberMap(),
    dontComeOdds: emptyNumberMap(),
    place: emptyNumberMap(),
    hardways: emptyHardwayMap(),
    field: 0,
    propositions: emptyPropositionMap(),
  };
}

export function cloneCrapsBets(bets: CrapsTableBets): CrapsTableBets {
  return {
    ...bets,
    comePoints: { ...bets.comePoints },
    dontComePoints: { ...bets.dontComePoints },
    comeOdds: { ...bets.comeOdds },
    dontComeOdds: { ...bets.dontComeOdds },
    place: { ...bets.place },
    hardways: { ...bets.hardways },
    propositions: { ...bets.propositions },
  };
}

export function isPointNumber(total: number): total is PointNumber {
  return POINT_SET.has(total);
}

export function getTotalAtRisk(bets: CrapsTableBets): number {
  const numberTotals = POINT_NUMBERS.reduce(
    (sum, number) => sum
      + bets.comePoints[number]
      + bets.dontComePoints[number]
      + bets.comeOdds[number]
      + bets.dontComeOdds[number]
      + bets.place[number],
    0,
  );
  const hardwayTotal = HARDWAY_NUMBERS.reduce((sum, number) => sum + bets.hardways[number], 0);
  const propositionTotal = PROPOSITION_BETS.reduce((sum, bet) => sum + bets.propositions[bet], 0);
  return bets.passLine
    + bets.dontPass
    + bets.passOdds
    + bets.dontPassOdds
    + bets.come
    + bets.dontCome
    + bets.field
    + numberTotals
    + hardwayTotal
    + propositionTotal;
}

export function getPassOddsProfit(point: PointNumber, wager: number): number {
  if (point === 4 || point === 10) return wager * 2;
  if (point === 5 || point === 9) return Math.floor(wager * 1.5);
  return Math.floor(wager * 1.2);
}

export function getLayOddsProfit(point: PointNumber, wager: number): number {
  if (point === 4 || point === 10) return Math.floor(wager / 2);
  if (point === 5 || point === 9) return Math.floor((wager * 2) / 3);
  return Math.floor((wager * 5) / 6);
}

export function getPlaceProfit(point: PointNumber, wager: number): number {
  if (point === 4 || point === 10) return Math.floor((wager * 9) / 5);
  if (point === 5 || point === 9) return Math.floor((wager * 7) / 5);
  return Math.floor((wager * 7) / 6);
}

export function getOddsLimit(point: PointNumber, flatWager: number): number {
  if (point === 4 || point === 10) return flatWager * 3;
  if (point === 5 || point === 9) return flatWager * 4;
  return flatWager * 5;
}

function eventMessage(event: CrapsEvent): string {
  if (event.kind === "move" || event.kind === "point") return event.label;
  if (event.kind === "push") return `${event.label} pushes`;
  if (event.kind === "win") return `${event.label} +${credits(event.profit)}`;
  return `${event.label} −${credits(event.stake)}`;
}

export function resolveCrapsRoll(
  point: PointNumber | null,
  bets: CrapsTableBets,
  dice: readonly [number, number],
): CrapsRollResolution {
  const total = dice[0] + dice[1];
  const hardTotal = dice[0] === dice[1];
  const next = cloneCrapsBets(bets);
  const events: CrapsEvent[] = [];
  let creditReturn = 0;
  let net = 0;
  let nextPoint = point;

  const winAndClear = (label: string, stake: number, profit: number, clear: () => void) => {
    if (stake <= 0) return;
    const credit = stake + profit;
    clear();
    creditReturn += credit;
    net += profit;
    events.push({ kind: "win", label, stake, profit, credit });
  };

  const loseAndClear = (label: string, stake: number, clear: () => void) => {
    if (stake <= 0) return;
    clear();
    net -= stake;
    events.push({ kind: "loss", label, stake, profit: -stake, credit: 0 });
  };

  const pushAndClear = (label: string, stake: number, clear: () => void) => {
    if (stake <= 0) return;
    clear();
    creditReturn += stake;
    events.push({ kind: "push", label, stake, profit: 0, credit: stake });
  };

  const payPersistent = (label: string, stake: number, profit: number) => {
    if (stake <= 0 || profit <= 0) return;
    creditReturn += profit;
    net += profit;
    events.push({ kind: "win", label, stake, profit, credit: profit });
  };

  if (bets.field > 0) {
    if (total === 2 || total === 12) {
      winAndClear(`Field ${total}`, bets.field, bets.field * 2, () => { next.field = 0; });
    } else if (FIELD_SINGLE.has(total)) {
      winAndClear(`Field ${total}`, bets.field, bets.field, () => { next.field = 0; });
    } else {
      loseAndClear("Field", bets.field, () => { next.field = 0; });
    }
  }

  for (const prop of PROPOSITION_BETS) {
    const stake = bets.propositions[prop];
    if (stake <= 0) continue;
    const wins = prop === "any-seven"
      ? total === 7
      : prop === "any-craps"
        ? total === 2 || total === 3 || total === 12
        : prop === "yo"
          ? total === 11
          : prop === "ace-deuce"
            ? total === 3
            : prop === "snake-eyes"
              ? total === 2
              : total === 12;
    const multiplier = prop === "any-seven"
      ? 4
      : prop === "any-craps"
        ? 7
        : prop === "yo" || prop === "ace-deuce"
          ? 15
          : 30;
    const label = {
      "any-seven": "Any Seven",
      "any-craps": "Any Craps",
      yo: "Yo 11",
      "ace-deuce": "Ace Deuce",
      "snake-eyes": "Snake Eyes",
      boxcars: "Boxcars",
    }[prop];
    if (wins) {
      winAndClear(label, stake, stake * multiplier, () => { next.propositions[prop] = 0; });
    } else {
      loseAndClear(label, stake, () => { next.propositions[prop] = 0; });
    }
  }

  if (point !== null) {
    for (const number of POINT_NUMBERS) {
      const stake = bets.place[number];
      if (stake <= 0) continue;
      if (total === 7) {
        loseAndClear(`Place ${number}`, stake, () => { next.place[number] = 0; });
      } else if (total === number) {
        payPersistent(`Place ${number}`, stake, getPlaceProfit(number, stake));
      }
    }

    for (const number of HARDWAY_NUMBERS) {
      const stake = bets.hardways[number];
      if (stake <= 0) continue;
      if (total === 7 || (total === number && !hardTotal)) {
        loseAndClear(`Hard ${number}`, stake, () => { next.hardways[number] = 0; });
      } else if (total === number && hardTotal) {
        payPersistent(`Hard ${number}`, stake, stake * (number === 4 || number === 10 ? 7 : 9));
      }
    }
  }

  for (const number of POINT_NUMBERS) {
    const comeFlat = bets.comePoints[number];
    const comeOdds = bets.comeOdds[number];
    if (comeFlat > 0 && (total === number || total === 7)) {
      if (total === number) {
        const oddsProfit = point === null ? 0 : getPassOddsProfit(number, comeOdds);
        winAndClear(`Come ${number}`, comeFlat, comeFlat, () => { next.comePoints[number] = 0; });
        if (comeOdds > 0) {
          if (point === null) pushAndClear(`Come odds ${number} off`, comeOdds, () => { next.comeOdds[number] = 0; });
          else winAndClear(`Come odds ${number}`, comeOdds, oddsProfit, () => { next.comeOdds[number] = 0; });
        }
      } else {
        loseAndClear(`Come ${number}`, comeFlat, () => { next.comePoints[number] = 0; });
        if (comeOdds > 0) {
          if (point === null) pushAndClear(`Come odds ${number} off`, comeOdds, () => { next.comeOdds[number] = 0; });
          else loseAndClear(`Come odds ${number}`, comeOdds, () => { next.comeOdds[number] = 0; });
        }
      }
    }

    const dontFlat = bets.dontComePoints[number];
    const dontOdds = bets.dontComeOdds[number];
    if (dontFlat > 0 && (total === number || total === 7)) {
      if (total === 7) {
        winAndClear(`Don't Come ${number}`, dontFlat, dontFlat, () => { next.dontComePoints[number] = 0; });
        if (dontOdds > 0) {
          winAndClear(`Don't Come odds ${number}`, dontOdds, getLayOddsProfit(number, dontOdds), () => { next.dontComeOdds[number] = 0; });
        }
      } else {
        loseAndClear(`Don't Come ${number}`, dontFlat, () => { next.dontComePoints[number] = 0; });
        if (dontOdds > 0) loseAndClear(`Don't Come odds ${number}`, dontOdds, () => { next.dontComeOdds[number] = 0; });
      }
    }
  }

  if (point !== null) {
    if (bets.come > 0) {
      if (total === 7 || total === 11) {
        winAndClear("Come", bets.come, bets.come, () => { next.come = 0; });
      } else if (total === 2 || total === 3 || total === 12) {
        loseAndClear("Come", bets.come, () => { next.come = 0; });
      } else if (isPointNumber(total)) {
        next.comePoints[total] += bets.come;
        next.come = 0;
        events.push({ kind: "move", label: `Come travels to ${total}`, stake: bets.come, profit: 0, credit: 0 });
      }
    }

    if (bets.dontCome > 0) {
      if (total === 2 || total === 3) {
        winAndClear("Don't Come", bets.dontCome, bets.dontCome, () => { next.dontCome = 0; });
      } else if (total === 12) {
        pushAndClear("Don't Come bar 12", bets.dontCome, () => { next.dontCome = 0; });
      } else if (total === 7 || total === 11) {
        loseAndClear("Don't Come", bets.dontCome, () => { next.dontCome = 0; });
      } else if (isPointNumber(total)) {
        next.dontComePoints[total] += bets.dontCome;
        next.dontCome = 0;
        events.push({ kind: "move", label: `Don't Come travels to ${total}`, stake: bets.dontCome, profit: 0, credit: 0 });
      }
    }
  }

  if (point === null) {
    if (isPointNumber(total)) {
      nextPoint = total;
      events.push({ kind: "point", label: `Point established: ${total}`, stake: 0, profit: 0, credit: 0 });
    } else {
      if (bets.passLine > 0) {
        if (total === 7 || total === 11) {
          winAndClear("Pass Line", bets.passLine, bets.passLine, () => { next.passLine = 0; });
        } else {
          loseAndClear("Pass Line", bets.passLine, () => { next.passLine = 0; });
        }
      }
      if (bets.dontPass > 0) {
        if (total === 2 || total === 3) {
          winAndClear("Don't Pass", bets.dontPass, bets.dontPass, () => { next.dontPass = 0; });
        } else if (total === 12) {
          pushAndClear("Don't Pass bar 12", bets.dontPass, () => { next.dontPass = 0; });
        } else {
          loseAndClear("Don't Pass", bets.dontPass, () => { next.dontPass = 0; });
        }
      }
    }
  } else if (total === point || total === 7) {
    if (total === point) {
      winAndClear("Pass Line", bets.passLine, bets.passLine, () => { next.passLine = 0; });
      if (bets.passOdds > 0) {
        winAndClear("Pass odds", bets.passOdds, getPassOddsProfit(point, bets.passOdds), () => { next.passOdds = 0; });
      }
      loseAndClear("Don't Pass", bets.dontPass, () => { next.dontPass = 0; });
      if (bets.dontPassOdds > 0) loseAndClear("Don't Pass odds", bets.dontPassOdds, () => { next.dontPassOdds = 0; });
      nextPoint = null;
      events.push({ kind: "point", label: `Point ${point} made`, stake: 0, profit: 0, credit: 0 });
    } else {
      loseAndClear("Pass Line", bets.passLine, () => { next.passLine = 0; });
      if (bets.passOdds > 0) loseAndClear("Pass odds", bets.passOdds, () => { next.passOdds = 0; });
      winAndClear("Don't Pass", bets.dontPass, bets.dontPass, () => { next.dontPass = 0; });
      if (bets.dontPassOdds > 0) {
        winAndClear("Don't Pass odds", bets.dontPassOdds, getLayOddsProfit(point, bets.dontPassOdds), () => { next.dontPassOdds = 0; });
      }
      nextPoint = null;
      events.push({ kind: "point", label: "Seven out — point off", stake: 0, profit: 0, credit: 0 });
    }
  }

  const decisionEvents = events.filter((event) => event.kind === "win" || event.kind === "loss" || event.kind === "push");
  const outcome: CrapsOutcome = net > 0 ? "win" : net < 0 ? "loss" : decisionEvents.length > 0 ? "push" : null;
  const summary = events.length > 0
    ? events.slice(0, 4).map(eventMessage).join(" · ") + (events.length > 4 ? ` · +${events.length - 4} more` : "")
    : nextPoint === null
      ? `${total}. Come-out continues.`
      : `${total}. Point remains ${nextPoint}.`;

  return { nextPoint, nextBets: next, creditReturn, net, outcome, summary, events };
}
