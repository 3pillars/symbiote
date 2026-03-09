import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { motion } from 'framer-motion'
import { 
  Wallet, 
  TrendingUp, 
  Shield, 
  Activity, 
  Zap,
  BarChart3,
  Settings,
  ChevronRight
} from 'lucide-react'

// Mock data for demo
const mockAgents = [
  { name: 'Alpha Scanner', status: 'Scanning...', pnl: '+2.4%', icon: '📡' },
  { name: 'Executor', status: 'Waiting', pnl: '-', icon: '⚡' },
  { name: 'Risk Manager', status: 'Monitoring', pnl: 'Safe', icon: '🛡️' },
]

const mockActivity = [
  { type: 'trade', msg: 'BTC/USDC position opened', time: '2m ago' },
  { type: 'signal', msg: 'New alpha signal detected', time: '5m ago' },
  { type: 'risk', msg: 'Portfolio rebalanced', time: '12m ago' },
]

function App() {
  const [connected, setConnected] = useState(false)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#12121a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4aa] to-[#00a388] flex items-center justify-center">
                <span className="text-lg font-bold">⬡</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-[#00d4aa] to-[#00a388] bg-clip-text text-transparent">
                Symbiote
              </span>
            </div>
            
            <nav className="hidden md:flex items-center gap-6">
              <a href="#dashboard" className="text-gray-400 hover:text-[#00d4aa] transition-colors">Dashboard</a>
              <a href="#agents" className="text-gray-400 hover:text-[#00d4aa] transition-colors">Agents</a>
              <a href="#activity" className="text-gray-400 hover:text-[#00d4aa] transition-colors">Activity</a>
            </nav>

            <ConnectButton showBalance={false} />
          </div>
        </div>
      </header>

      {/* Hero */}
      {!connected ? (
        <section className="relative py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Self-Organizing{' '}
                <span className="bg-gradient-to-r from-[#00d4aa] to-[#00a388] bg-clip-text text-transparent">
                  Trading Agents
                </span>
              </h1>
              <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
                AI-powered agents that collaborate autonomously to trade in DeFi. 
                No manual trading needed.
              </p>
              
              <div className="flex flex-wrap justify-center gap-8 mb-12">
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#00d4aa]">$0</div>
                  <div className="text-gray-500">Total Value Locked</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#00d4aa]">3</div>
                  <div className="text-gray-500">Active Agents</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#00d4aa]">0%</div>
                  <div className="text-gray-500">Total Return</div>
                </div>
              </div>

              <button
                onClick={() => setConnected(true)}
                className="px-8 py-4 bg-[#00d4aa] text-[#0a0a0f] font-semibold rounded-xl 
                         hover:shadow-[0_0_30px_rgba(0,212,170,0.3)] transition-all duration-200
                         flex items-center gap-2 mx-auto"
              >
                <Wallet className="w-5 h-5" />
                Connect Wallet to Start
              </button>
            </motion.div>
          </div>
        </section>
      ) : (
        /* Dashboard */
        <section id="dashboard" className="py-8 px-4">
          <div className="max-w-7xl mx-auto">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <StatCard icon={Wallet} label="Portfolio Value" value="$0.00" change="+0%" />
              <StatCard icon={TrendingUp} label="Today's P&L" value="$0.00" change="+0%" />
              <StatCard icon={Activity} label="Active Trades" value="0" />
              <StatCard icon={Shield} label="Risk Score" value="Low" status="safe" />
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Portfolio */}
              <div className="lg:col-span-2 bg-[#1a1a24] rounded-2xl p-6 border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Portfolio</h2>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-[#00d4aa] text-[#0a0a0f] rounded-lg font-medium text-sm">
                      Deposit
                    </button>
                    <button className="px-4 py-2 bg-white/10 text-white rounded-lg font-medium text-sm hover:bg-white/20">
                      Withdraw
                    </button>
                  </div>
                </div>
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No active positions</p>
                  <button className="text-[#00d4aa] hover:underline text-sm flex items-center gap-1 mx-auto">
                    Start trading <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Agents */}
              <div id="agents" className="bg-[#1a1a24] rounded-2xl p-6 border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Active Agents</h2>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00d4aa] animate-pulse"></span>
                    <span className="text-sm text-gray-400">Running</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {mockAgents.map((agent, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-[#12121a] rounded-xl">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00d4aa]/20 to-[#00a388]/20 flex items-center justify-center text-xl">
                        {agent.icon}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-sm text-gray-500">{agent.status}</div>
                      </div>
                      <div className={`font-medium ${agent.pnl === 'Safe' ? 'text-[#00d4aa]' : agent.pnl.startsWith('+') ? 'text-green-400' : 'text-gray-400'}`}>
                        {agent.pnl}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity */}
              <div id="activity" className="bg-[#1a1a24] rounded-2xl p-6 border border-white/5">
                <h2 className="text-xl font-semibold mb-6">Recent Activity</h2>
                <div className="space-y-3">
                  {mockActivity.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        item.type === 'trade' ? 'bg-[#00d4aa]/20 text-[#00d4aa]' :
                        item.type === 'signal' ? 'bg-yellow-500/20 text-yellow-500' :
                        'bg-blue-500/20 text-blue-500'
                      }`}>
                        {item.type === 'trade' ? '💰' : item.type === 'signal' ? '📡' : '🛡️'}
                      </div>
                      <div className="flex-1">{item.msg}</div>
                      <div className="text-gray-500">{item.time}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Controls */}
              <div className="bg-[#1a1a24] rounded-2xl p-6 border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Risk Controls</h2>
                  <Settings className="w-5 h-5 text-gray-400" />
                </div>
                <div className="space-y-4">
                  <RiskRow label="Max Position" value="20 ETH" />
                  <RiskRow label="Daily Loss Limit" value="1.5%" />
                  <RiskRow label="Auto-Pause" value="Enabled" status="safe" />
                  <RiskRow label="Leverage Cap" value="3x" />
                </div>
                <button className="w-full mt-6 py-3 bg-white/10 rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                  Configure Risk Parameters
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>Symbiote © 2026 — Self-Organizing Trading Agent Collective</p>
        </div>
      </footer>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, change, status }: { icon: any, label: string, value: string, change?: string, status?: string }) {
  return (
    <div className="bg-[#1a1a24] rounded-2xl p-4 border border-white/5">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {change && (
        <div className={`text-sm ${change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
          {change}
        </div>
      )}
      {status && (
        <div className={`text-sm ${status === 'safe' ? 'text-[#00d4aa]' : 'text-yellow-500'}`}>
          {status}
        </div>
      )}
    </div>
  )
}

function RiskRow({ label, value, status }: { label: string, value: string, status?: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5">
      <span className="text-gray-400">{label}</span>
      <span className={status === 'safe' ? 'text-[#00d4aa]' : ''}>{value}</span>
    </div>
  )
}

export default App
