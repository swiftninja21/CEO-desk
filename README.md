# CEO Desk

Read-only mobile dashboard for Aj's public Solana wallet. It is a static site: HTML, CSS, and JS, with no build step and no backend. The page never asks for a private key or a wallet connection.

GitHub Pages (main branch, root): https://swiftninja21.github.io/CEO-desk/

The desk reads:

- Solana `getBalance`, `getSignaturesForAddress`, and `getTokenAccountsByOwner` (SPL Token and Token-2022) for copying wallet W1, `7MDqGWcdgesJHxWs2a1YSaKobcqWe7yU5kjz4XNBKPMa`
- A full read (balance, signatures, SPL token accounts, and Token-2022 accounts) tries `https://public.rpc.solanavibestation.com`, then `https://api.mainnet-beta.solana.com`. From a browser on this Pages origin, mainnet-beta returns HTTP 403 with the message `Access forbidden`.
- If both full reads fail, `getBalance` alone is tried on `https://solana.api.pocket.network`, then `https://solana-rpc.publicnode.com`. Those two are not asked for a program-wide token scan: Pocket requires a mint filter, and publicnode returns 403 for that method unless a personal token is supplied. No API key is shipped in the page.
- When a poll fails, the last successful chain read stays on screen with its timestamp and a STALE or OFFLINE pill. The page does not invent a balance. Retry backoff stays between 20s and 60s.
- Copy target Killua, `95TWoKkvv2z85EXBzd2z6NwbxH2f54AvwuCA9x3NoKep`. Backup is none.
- SOL/USD from CoinGecko, then DexScreener, then Coinbase
- Token prices from DexScreener. PUSSY (`FZxHLUGiGchY5uvvoeqh1EKiXTrGdN67WUBhUc1fLoat`) uses the SOL pair `HcyYBrZVFDDVBLtLxL5C1HDJND1p86BoNA6m7MjBKE3p`.

Trojan settings effective Nov 8, 2026 at about 11:52 AM ET, when the target switched to Killua. Min liquidity was cleared at about 2:26 PM ET the same day. Buy is 0.1 SOL fixed, priority fee 0.001, bribe 0.0005, slippage 15%, MEV on. Copy sell is on when Killua sells. Take profit sells 50% at +100%. Stop loss sells 100% at −30%. Min liquidity is none. Market cap filter is none. Max spend is 0.1 SOL. Launchpads are allowed. Duplicate buys are prevented. Max open 2 and the day stop after −$10 are personal rules, not enforced by Trojan.

The recorded stake is 1.106 SOL ($99.10) at 12:08 PM ET on Nov 7, 2026. P/L is cash SOL plus token market value, minus 1.106 SOL. USD is that SOL result at the current SOL price. Cash alone is not the P/L while a token is held. If a feed fails, the screen says so instead of inventing a number.

Johnson (`J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB`) was the copy target, with backup Doji (`5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg`), from Nov 7, 2026 at 3:36 PM ET until the Nov 8 switch. That remains in the on-page history log.
