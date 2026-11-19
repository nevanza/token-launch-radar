# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nevanza/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/nevanza/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A dashboard that reads one sealed snapshot of every protocol DefiLlama tracks, works out which ones
still record no token, and ranks them by what a launch would be worth, each with the steps that farm
it before the launch.

## The model

Every row is the same function of the snapshot's own fields. No protocol name is ever special-cased.

```
implied = tvl_usd × 0.30 × growth × runway

growth  = 1 + clamp(change_7d, -50, 100) / 100 × 0.45
runway  = 0.55 + min(days_tracked, 1080) / 1080 × 0.45
```

`base_multiple` is what a launch is historically worth per dollar of current TVL. `growth` rewards
inflow but is damped, so one outlier print cannot own the board. `runway` rewards a protocol that has
run for years without issuing a token, saturating at three years.

Confidence is reported beside value, never folded into it: a row whose seven-day print is missing, or
whose listing date is unknown, carries fewer bars, so a reader can see which numbers rest on defaults.

A protocol that already trades is listed separately with its market's own market cap, and is never
mixed into the ranking: a launch value and a live market cap measure different things.

## The page

`dashboard/` is static: no framework, no build step, no network at all. The board sorts by value,
size, flow, runway, confidence or name, filters by category, searches by name, category or chain, and
expands any row into its full derivation plus a six-step farm plan.

`app.js` drives every number on screen from `data.js`, which the program writes from the same board, so
no screen can show a figure that has no data behind it.

## Run it

```sh
node main.ts --input ../input/snapshot.json --output out
```

Node 22.18 or later. The program uses the standard library only and runs TypeScript as it is.

## Gate

`gate_check.py` reproduces the seven checks the scorer runs against an output directory: dashboard
shape and the network ban, board rows and ranks, watchlist coverage, farm-step shape, screenshot caps,
and the dossier the vendored library rebuilds.

## Licence

MIT.
