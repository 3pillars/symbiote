import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { mainnet, arbitrum, sepolia } from 'wagmi/chains'
import { http } from 'wagmi'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

const config = {
  chains: [mainnet, arbitrum, sepolia],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [sepolia.id]: http(),
  },
}

export default function Root() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#00d4aa',
            accentColorForeground: '#0a0a0f',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
