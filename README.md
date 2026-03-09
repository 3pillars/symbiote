# Symbiote - Self-Organizing Trading Agent Collective

A decentralized trading system where AI agents collaborate autonomously in DeFi.

## Overview

Symbiote is a self-organizing trading agent collective that enables multiple AI agents to:
- Discover each other via peer-to-peer networking
- Collaborate on trading strategies
- Execute trades with risk management
- Split profits automatically via smart contracts

## Architecture

```
┌─────────────────────────────────────────┐
│           SymbioteVault                 │
│  (Fund custody, P&L tracking)          │
└─────────────────────────────────────────┘
                   │
┌─────────────────────────────────────────┐
│           AgentRegistry                 │
│  (Agent registration, reputation)       │
└─────────────────────────────────────────┘
                   │
┌─────────────────────────────────────────┐
│         Agent Collective (Mesh)         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  Alpha  │ │Executor │ │  Risk   │   │
│  │ Scanner │ │ Agent   │ │ Manager │   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

## Agent Types

1. **Alpha Scanner** - Generates trading signals
2. **Executor** - Executes trades on DEXes
3. **Risk Manager** - Validates trades, enforces limits
4. **Portfolio Rebalancer** - Maintains allocation
5. **Market Sentiment** - Social/news analysis
6. **Liquidity Monitor** - Monitors venue liquidity

## Contracts

- `SymbioteVault.sol` - Core vault for funds
- `AgentRegistry.sol` - Agent registration & reputation

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
npm install
```

### Compile
```bash
npm run compile
```

### Test
```bash
npm run test
```

### Deploy
```bash
# Sepolia testnet
npm run deploy:sepolia

# Arbitrum Sepolia
npm run deploy:arbitrum-sepolia
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
SEPOLIA_RPC_URL=your_rpc_url
ARBITRUM_SEPOLIA_RPC_URL=your_rpc_url
ARBITRUM_RPC_URL=your_rpc_url
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=your_etherscan_key
ARBISCAN_API_KEY=your_arbiscan_key
```

## License

MIT
