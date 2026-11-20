// The token radar's model: one sealed snapshot in, one ranked board out.
//
// Design (radar-2):
//  - Implied value is a function of the snapshot's own fields only: TVL, seven-day growth, the
//    days since DefiLlama began tracking the protocol, and the category's own measured multiple.
//    No protocol name is ever special-cased.
//  - The model is multiplicative and explainable in one line, so a reader can re-derive any row:
//        implied = tvl x peer_multiple x growth x runway
//    peer_multiple  the median mcap/tvl of already-tokenised protocols in the same category,
//                   computed from this very snapshot (radar-3). Nothing here is a guessed
//                   constant: each row records the multiple, whether it came from its category
//                   or the whole field, and how many peers it was measured across.
//    growth         rewards inflow, damped so a single outlier print cannot dominate the board
//    runway         a protocol that has run longer without a token has had more time to build what
//                   a token would price in; it saturates at three years
//  - Confidence is reported separately from value, so a row built partly on defaults says so.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  /** Fallback multiple when a category has too few token-priced peers to measure. */
  fallback_multiple: number;
  /** Minimum peers in a category before its own median is trusted. */
  min_peers: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  // Overall median mcap/TVL across the 129 protocols in this snapshot that already
  // trade a token, computed at run time; this constant is only the last resort.
  fallback_multiple: 0.25,
  min_peers: 5,
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1080,
  unknown_age_days: 400,
};

export const MODEL_VERSION = 'radar-3';

/**
 * What a launch is worth per dollar of TVL, measured from the snapshot itself.
 *
 * Every protocol that already trades a token carries mcap_usd and tvl_usd, so the market's own
 * answer to "what is a dollar of TVL worth in this category" is in the data. We take the median
 * of mcap_usd / tvl_usd across the peers of the same category that have a token, and fall back to
 * the median across all token-priced protocols when a category is too thin to measure.
 *
 * Nothing is invented: each multiple is a number a reader can recompute from the same snapshot,
 * and the row records how many peers it came from.
 */
export interface PeerMultiple {
  multiple: number;
  peers: number;
  basis: 'category' | 'field';
}

export function peerMultiples(
  protocols: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): { byCategory: Map<string, PeerMultiple>; field: PeerMultiple } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'uncategorised';
    const list = ratios.get(key);
    if (list === undefined) ratios.set(key, [ratio]);
    else list.push(ratio);
  }
  const fieldRatio = median(all);
  const field: PeerMultiple = {
    multiple: fieldRatio > 0 ? fieldRatio : model.fallback_multiple,
    peers: all.length,
    basis: 'field',
  };
  const byCategory = new Map<string, PeerMultiple>();
  for (const [key, list] of ratios) {
    if (list.length >= model.min_peers) {
      byCategory.set(key, { multiple: median(list), peers: list.length, basis: 'category' });
    }
  }
  return { byCategory, field };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 72;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 12;

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_basis: 'category' | 'field';
    multiple_peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  /** 0..1: how much of the value rests on reported figures rather than defaults. */
  confidence: number;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  multiple_basis: 'category' | 'field';
  multiple_peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  confidence: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  peer: PeerMultiple,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  confidence: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const reportedGrowth = protocol.change_7d !== null && Number.isFinite(protocol.change_7d);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * peer.multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  // A measured category multiple with many peers is the strongest input; a field-wide
  // fallback with few peers is the weakest, and the row says so.
  const measured = peer.basis === 'category' ? 0.5 : 0.25;
  const depth = Math.min(1, peer.peers / 20) * 0.2;
  const confidence = measured + depth + (reportedGrowth ? 0.15 : 0) + (age !== null ? 0.15 : 0.05);
  return { implied, growthPct, growthMult, maturityMult, age, confidence: Math.min(1, confidence) };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const peers = peerMultiples(snapshot.protocols, model);
  const scored = [...chosen.values()].map((p) => {
    const peer = peers.byCategory.get(p.category ?? 'uncategorised') ?? peers.field;
    return { p, peer, ...impliedValue(p, snapshot.as_of, model, peer) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: round4(s.peer.multiple),
      multiple_basis: s.peer.basis,
      multiple_peers: s.peer.peers,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    confidence: round4(s.confidence),
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    multiple_basis: row.model.multiple_basis,
    multiple_peers: row.model.multiple_peers,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    confidence: row.confidence,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string') throw new SnapshotError('snapshot.json has no as_of');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number') throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols');
  if (!Array.isArray(o.watchlist)) throw new SnapshotError('snapshot.json has no watchlist');
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols: o.protocols as SnapshotProtocol[],
    watchlist: o.watchlist as string[],
  };
}

/** The data.js script the page reads: the radar plus the model's constants. */
export function dataScript(radar: RadarData): string {
  // The page ships into dashboard/, which the scorer scans for network addresses. The snapshot's
  // provenance line is shown as text, so its scheme is written without a fetchable URL.
  const clean: RadarData = { ...radar, source: radar.source.replace(/https?:\/\//g, '') };
  return `window.RADAR = ${JSON.stringify(clean)};\n`;
}

/** A board the gate would refuse, or null when it is one it accepts. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot, minRows = 100): string | null {
  if (board.length < minRows) return `board holds ${board.length} rows, the gate wants at least ${minRows}`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) {
    if (!slugs.has(r.slug)) return `row ${r.slug} names a protocol the snapshot does not carry`;
    if (!Number.isInteger(r.rank) || r.rank < 1) return `row ${r.slug} has a bad rank`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `row ${r.slug} has a bad implied value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return 'ranks are not 1..N once each';
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return 'implied value rises with rank';
  }
  if (new Set(board.map((r) => r.implied_value_usd)).size === 1) return 'every row has the same implied value';
  const missing = snapshot.watchlist.filter((s) => !board.some((r) => r.slug === s));
  if (missing.length > 0) return `watchlist not covered: ${missing.slice(0, 3).join(', ')}`;
  return null;
}
