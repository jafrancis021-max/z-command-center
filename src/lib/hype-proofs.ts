export const PROJECTS = {
  HYPERLIQUID: 'hyperliquid',
  HYPERLEND:   'hyperlend',
  HYPERSWAP:   'hyperswap',
  KINETIQ:     'kinetiq',
  FELIX:       'felix',
  HYPE_S2:     'hype_s2',
} as const

export const HYPERLIQUID_KEYS = {
  PERPS_SIZE:     'perps_size',
  COLLATERAL:     'collateral',
  AGENT:          'agent',
  SPOT_VOL:       'spot_vol',
  SPOT_SWAP:      'spot_swap',
  PERPS_SHORT:    'perps_short',
  PERPS_DEPOSIT:  'perps_deposit',   // renamed from perps_collateral
  AGENT_APPROVE:  'agent_approve',   // renamed from agent_approved
  ACTIVITY:       'activity',        // renamed from activity_tracking
} as const

export const HYPERLEND_KEYS = {
  SUPPLIED:      'supplied',
  BORROWED:      'borrowed',
  HF:            'hf',
  CLAIMS:        'claims',
  SUPPLY:        'supply',
  BORROW:        'borrow',
  SHARED_CREDIT: 'shared_credit',
  CLAIM_POINTS:  'claim_points',
} as const

export const HYPERSWAP_KEYS = {
  SWAP_VOL:    'swap_vol',    // metric: 7-day USD swap volume
  SWAP_VOLUME: 'swap_volume', // requirement: has swapped
  LP_VALUE:    'lp_value',    // metric: LP position value
  LP_OPEN:     'lp_open',     // requirement: has open LP position
  LP_BOOST:    'lp_boost',    // requirement: has boosted LP
  BOOST:       'boost',       // metric: boost multiplier
  POINTS:      'points',      // metric: HyperSwap points
} as const

export const KINETIQ_KEYS = {
  STAKE:         'stake',         // requirement: has staked kHYPE
  STAKED:        'staked',        // metric cell: kHYPE balance
  HOLD_STHYPE:   'hold_stHYPE',  // requirement: holds stHYPE
  STHYPE:        'stHYPE',       // metric cell: stHYPE balance
} as const

export const FELIX_KEYS = {
  SUPPLY:        'supply',        // requirement: has supplied collateral
  SUPPLIED:      'supplied',      // metric cell: collateral USD value
  BORROW:        'borrow',        // requirement: has taken a loan
  BORROWED:      'borrowed',      // metric cell: debt USD value
  SHARED_CREDIT: 'shared_credit', // requirement: has both supply and borrow
  SNAPSHOT:      'snapshot',      // requirement: snapshot/points eligibility
} as const

export const HYPE_S2_KEYS = {
  PERPS_OPEN:  'perps_open',   // requirement: has open perps position
  AGENT:       'agent',        // requirement + cell: has API agent
  ACTIVITY:    'activity',     // requirement: any platform activity
  PERPS_VOL:   'perps_vol',    // metric cell: 30-day perps fill volume (USD)
  ACTIVE_DAYS: 'active_days',  // metric cell: unique active days (30-day window)
} as const

export type ProjectId      = typeof PROJECTS[keyof typeof PROJECTS]
export type HyperliquidKey = typeof HYPERLIQUID_KEYS[keyof typeof HYPERLIQUID_KEYS]
export type HyperlendKey   = typeof HYPERLEND_KEYS[keyof typeof HYPERLEND_KEYS]
export type HyperswapKey   = typeof HYPERSWAP_KEYS[keyof typeof HYPERSWAP_KEYS]
export type KinetiqKey     = typeof KINETIQ_KEYS[keyof typeof KINETIQ_KEYS]
export type FelixKey       = typeof FELIX_KEYS[keyof typeof FELIX_KEYS]
export type HypeS2Key      = typeof HYPE_S2_KEYS[keyof typeof HYPE_S2_KEYS]
export type RequirementKey = HyperliquidKey | HyperlendKey | HyperswapKey | KinetiqKey | FelixKey | HypeS2Key
