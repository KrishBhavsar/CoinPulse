"use server";

const BINANCE_API_URL = "https://api.binance.us/api/v3";

// Binance 24hr ticker response
interface Binance24hrTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
}

// Binance kline intervals
type BinanceInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

// Map our period config to Binance intervals and limits (not exported - server actions can only export async functions)
const PERIOD_TO_BINANCE: Record<
  Period,
  { interval: BinanceInterval; limit: number }
> = {
  daily: { interval: "30m", limit: 48 }, // 48 * 30min = 24 hours
  weekly: { interval: "4h", limit: 42 }, // 42 * 4h = 7 days
  monthly: { interval: "4h", limit: 180 }, // 180 * 4h = 30 days
  "3months": { interval: "1d", limit: 90 }, // 90 days
  "6months": { interval: "1d", limit: 180 }, // 180 days
  yearly: { interval: "1d", limit: 365 }, // 365 days
  max: { interval: "1w", limit: 500 }, // ~10 years of weekly data
};

// Binance kline response format: [openTime, open, high, low, close, volume, closeTime, ...]
type BinanceKline = [
  number, // Open time
  string, // Open
  string, // High
  string, // Low
  string, // Close
  string, // Volume
  number, // Close time
  string, // Quote asset volume
  number, // Number of trades
  string, // Taker buy base asset volume
  string, // Taker buy quote asset volume
  string // Ignore
];

export async function fetchBinanceKlines(
  symbol: string,
  period: Period
): Promise<OHLCData[]> {
  const { interval, limit } = PERIOD_TO_BINANCE[period];

  // Binance expects uppercase symbol like BTCUSDT
  const binanceSymbol = symbol.toUpperCase();

  const url = `${BINANCE_API_URL}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;

  const response = await fetch(url, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    // Return empty array if symbol not found on Binance (e.g., smaller altcoins)
    console.warn(`Binance API Error for ${binanceSymbol}: ${response.status}`);
    return [];
  }

  const klines: BinanceKline[] = await response.json();

  // Convert to OHLCData format [timestamp_seconds, open, high, low, close]
  return klines.map((kline) => [
    Math.floor(kline[0] / 1000), // Convert ms to seconds
    parseFloat(kline[1]), // Open
    parseFloat(kline[2]), // High
    parseFloat(kline[3]), // Low
    parseFloat(kline[4]), // Close
  ]);
}

// Popular USDT pairs to filter for trending (major coins)
const POPULAR_QUOTE_ASSETS = ["USDT", "BUSD"];

export interface BinanceTrendingCoin {
  symbol: string;
  baseAsset: string;
  price: number;
  priceChangePercent: number;
  volume: number;
}

export async function fetchBinanceTrendingCoins(
  limit: number = 10
): Promise<BinanceTrendingCoin[]> {
  const url = `${BINANCE_API_URL}/ticker/24hr`;

  const response = await fetch(url, {
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!response.ok) {
    console.error(`Binance API Error: ${response.status}`);
    return [];
  }

  const tickers: Binance24hrTicker[] = await response.json();

  // Filter for USDT pairs only and sort by price change percentage (top gainers)
  const trendingCoins = tickers
    .filter((ticker) =>
      POPULAR_QUOTE_ASSETS.some((quote) => ticker.symbol.endsWith(quote))
    )
    .map((ticker) => {
      const quoteAsset =
        POPULAR_QUOTE_ASSETS.find((quote) => ticker.symbol.endsWith(quote)) ||
        "USDT";
      return {
        symbol: ticker.symbol,
        baseAsset: ticker.symbol.replace(quoteAsset, ""),
        price: parseFloat(ticker.lastPrice),
        priceChangePercent: parseFloat(ticker.priceChangePercent),
        volume: parseFloat(ticker.quoteVolume),
      };
    })
    // Sort by highest price change (top gainers = trending)
    .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
    .slice(0, limit);

  return trendingCoins;
}
