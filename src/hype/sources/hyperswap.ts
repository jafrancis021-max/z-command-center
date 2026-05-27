import type { ProofRow } from '../types'

// HyperSwap — Uniswap v2/v3 fork on HyperEVM
// Docs: https://docs.hyperswap.pro/technical-reference/contracts/deployment-addresses
//
// Verified contract addresses:
//   V2 Factory: 0x4df039804873717bff7d03694fb941cf0469b79e
//   V2 Router:  0xda0f518d521e0dE83fAdC8500C2D21b6a6C39bF9
//   V3 Router:  0x4e2960a8cd19b467b82d26d83facb0fae26b094d
//
// BLOCKED: swap volume and LP positions require historical event indexing (Swap/Mint events).
// No official or community subgraph endpoint verified for HyperSwap on HyperEVM.
// Required to implement: subgraph URL + wallet swap/LP query + USD pricing source.
//
// Keys NOT written: swap_vol, swap_volume, lp_value, lp_open, lp_boost, boost, points.

export async function scanHyperSwap(wallet: string): Promise<ProofRow[]> {
  void wallet
  return []
}
