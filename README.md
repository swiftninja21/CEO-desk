# CEO Desk

Read-only mobile dashboard for Aj's public Solana wallet. It is a static site: HTML, CSS, and JS, with no build step and no backend. The page never asks for a private key or a wallet connection.

GitHub Pages (main branch, root): https://swiftninja21.github.io/CEO-desk/

The desk reads:

- Solana `getBalance`, `getSignaturesForAddress`, and `getTokenAccountsByOwner` (SPL Token and Token-2022) for `7MDqGWcdgesJHxWs2a1YSaKobcqWe7yU5kjz4XNBKPMa`
- The copy target `C2P1Zap9Qb6ovaXiUPH4cVbJCDUjbmhzwngcDFTgFp8v`
- SOL/USD from CoinGecko, then DexScreener, then Coinbase
- Token names and prices from DexScreener when a balance exists

The recorded stake is 1.106 SOL ($99.10) at 12:08 PM ET on Nov 7, 2026. If a feed fails, the screen says so instead of inventing a number.
