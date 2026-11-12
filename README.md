# CEO Desk

Read-only mobile dashboard for Aj's public Solana wallet. It is a static site: HTML, CSS, and JS, with no build step and no backend. The page never asks for a private key or a wallet connection.

GitHub Pages (main branch, root): https://swiftninja21.github.io/CEO-desk/

The desk reads:

- Solana `getBalance`, `getSignaturesForAddress`, and `getTokenAccountsByOwner` (SPL Token and Token-2022) for copying wallet W1, `7MDqGWcdgesJHxWs2a1YSaKobcqWe7yU5kjz4XNBKPMa`
- A full read (balance, signatures, SPL token accounts, and Token-2022 accounts) tries `https://public.rpc.solanavibestation.com`, then `https://solana-rpc.publicnode.com`, then `https://api.mainnet-beta.solana.com`. A Safari `Load failed`, a timeout, or HTTP 429 moves to the next host. From a browser on this Pages origin, mainnet-beta returns HTTP 403 with the message `Access forbidden`. publicnode may also 403 a program-wide token scan unless a personal token is supplied; no API key is shipped in the page.
- If those full reads fail, `getBalance` alone is tried on publicnode, then `https://solana.api.pocket.network` (Pocket requires a mint filter for token scans). A failed poll keeps the last complete portfolio on the vault instead of clearing it.
- When a poll fails, the last successful chain read stays on screen with its timestamp and a STALE or OFFLINE pill. The page does not invent a balance. Retry backoff stays between 20s and 60s.
- Copy target 8P, `8pYLN2Zm9ECVRXHRcU7a4tYpSPMaJME3Qt7JKa9LirEG`, on execution wallet W1. Backup is none. Killua is history, labeled Killua-era.
- SOL/USD from CoinGecko, then DexScreener, then Coinbase
- Token prices from DexScreener. PUSSY (`FZxHLUGiGchY5uvvoeqh1EKiXTrGdN67WUBhUc1fLoat`) uses the SOL pair `HcyYBrZVFDDVBLtLxL5C1HDJND1p86BoNA6m7MjBKE3p`.

Trojan settings effective Nov 11, 2026 at 6:53 PM ET, when the leader switched from Killua to 8P. Buy is 0.05 SOL. Max spend per buy is 0.05 SOL. Copy sell is on when 8P sells. Auto sell is on: take profit sells 50% at +100%, stop loss sells 100% at −30%. Priority fee 0.001, bribe 0.0005, slippage 15%, MEV on. Market cap and min liquidity are blank. Exclude launchpad is off. Duplicate buys are prevented. Max open 2 and the −$10 day stop are Aj's rules, not enforced by Trojan. The day stop uses today's portfolio change since midnight ET.

The recorded stake is 1.106 SOL ($99.10) at 12:08 PM ET on Nov 7, 2026. All-time P/L is cash SOL plus token market value, minus 1.106 SOL. Today stores one baseline per ET date in local storage: the seeded Nov 11, 2026 baseline is 0.812 SOL, and any later date keeps the first portfolio value seen after midnight. USD is the SOL result at the current SOL price. Cash alone is not the P/L while a token is held. If a feed fails, the screen says so instead of inventing a number.

Killua (`95TWoKkvv2z85EXBzd2z6NwbxH2f54AvwuCA9x3NoKep`) was the copy target from Nov 8, 2026 at about 11:52 AM ET until 6:53 PM ET on Nov 11. Those entries stay in the history log as Killua-era. Johnson (`J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB`) was the copy target, with backup Doji (`5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg`), from Nov 7, 2026 at 3:36 PM ET until the Nov 8 switch.
