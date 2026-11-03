import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, arbitrum, polygon, base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'SI PALING TRADING',
  projectId: 'a1b2c3d4e5f678901234567890abcdef', // Boleh diisi string bebas dulu untuk testing lokal
  chains: [mainnet, arbitrum, polygon, base],
  ssr: true,
});