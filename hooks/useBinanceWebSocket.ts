'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Use Binance Spot WebSocket (more accessible than Futures)
const WS_BASE = 'wss://stream.binance.com:9443/stream';

// Binance kline intervals mapping
const INTERVAL_MAP: Record<string, string> = {
  '1s': '1s',
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '6h': '6h',
  '8h': '8h',
  '12h': '12h',
  '1d': '1d',
  '3d': '3d',
  '1w': '1w',
  '1M': '1M',
};

interface UseBinanceWebSocketProps {
  symbol: string; // e.g., 'btcusdt' (lowercase)
  interval?: '1s' | '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
}

interface UseBinanceWebSocketReturn {
  price: ExtendedPriceData | null;
  trades: Trade[];
  ohlcv: OHLCData | null;
  isConnected: boolean;
  ticker: BinanceTickerData | null;
}

interface BinanceTickerData {
  priceChange: number;
  priceChangePercent: number;
  weightedAvgPrice: number;
  lastPrice: number;
  lastQty: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

// Binance WebSocket message types
interface BinanceAggTradeMessage {
  e: 'aggTrade';
  E: number; // Event time
  s: string; // Symbol
  a: number; // Aggregate trade ID
  p: string; // Price
  q: string; // Quantity
  f: number; // First trade ID
  l: number; // Last trade ID
  T: number; // Trade time
  m: boolean; // Is buyer maker
}

interface BinanceKlineMessage {
  e: 'kline';
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base volume
    Q: string; // Taker buy quote volume
  };
}

interface BinanceTickerMessage {
  e: '24hrTicker';
  E: number; // Event time
  s: string; // Symbol
  p: string; // Price change
  P: string; // Price change percent
  w: string; // Weighted average price
  c: string; // Last price
  Q: string; // Last quantity
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
  O: number; // Statistics open time
  C: number; // Statistics close time
  F: number; // First trade ID
  L: number; // Last trade ID
  n: number; // Total number of trades
}

interface BinanceMarkPriceMessage {
  e: 'markPriceUpdate';
  E: number; // Event time
  s: string; // Symbol
  p: string; // Mark price
  i: string; // Index price
  P: string; // Estimated settle price
  r: string; // Funding rate
  T: number; // Next funding time
}

interface BinanceCombinedStream {
  stream: string;
  data: BinanceAggTradeMessage | BinanceKlineMessage | BinanceTickerMessage | BinanceMarkPriceMessage;
}

export const useBinanceWebSocket = ({
  symbol,
  interval = '1m',
}: UseBinanceWebSocketProps): UseBinanceWebSocketReturn => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const [price, setPrice] = useState<ExtendedPriceData | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [ohlcv, setOhlcv] = useState<OHLCData | null>(null);
  const [ticker, setTicker] = useState<BinanceTickerData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const cleanupWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!symbol) return;

    const normalizedSymbol = symbol.toLowerCase();
    const binanceInterval = INTERVAL_MAP[interval] || '1m';

    // Build stream names for combined streams (Spot WebSocket)
    const streams = [
      `${normalizedSymbol}@aggTrade`,
      `${normalizedSymbol}@kline_${binanceInterval}`,
      `${normalizedSymbol}@ticker`,
    ].join('/');

    const wsUrl = `${WS_BASE}?streams=${streams}`;

    const connect = () => {
      cleanupWebSocket();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message: BinanceCombinedStream = JSON.parse(event.data);
          const { stream, data } = message;

          // Handle aggregate trades
          if (stream.includes('@aggTrade')) {
            const tradeData = data as BinanceAggTradeMessage;
            const newTrade: Trade = {
              price: parseFloat(tradeData.p),
              amount: parseFloat(tradeData.q),
              value: parseFloat(tradeData.p) * parseFloat(tradeData.q),
              timestamp: tradeData.T,
              type: tradeData.m ? 'sell' : 'buy', // m=true means buyer is maker, so it's a sell
            };

            setTrades((prev) => [newTrade, ...prev].slice(0, 7));
          }

          // Handle kline/candlestick data
          if (stream.includes('@kline_')) {
            const klineData = data as BinanceKlineMessage;
            const candle: OHLCData = [
              Math.floor(klineData.k.t / 1000), // timestamp in seconds (chart expects seconds)
              parseFloat(klineData.k.o), // open
              parseFloat(klineData.k.h), // high
              parseFloat(klineData.k.l), // low
              parseFloat(klineData.k.c), // close
            ];
            setOhlcv(candle);
          }

          // Handle 24hr ticker
          if (stream.includes('@ticker')) {
            const tickerData = data as BinanceTickerMessage;

            setTicker({
              priceChange: parseFloat(tickerData.p),
              priceChangePercent: parseFloat(tickerData.P),
              weightedAvgPrice: parseFloat(tickerData.w),
              lastPrice: parseFloat(tickerData.c),
              lastQty: parseFloat(tickerData.Q),
              openPrice: parseFloat(tickerData.o),
              highPrice: parseFloat(tickerData.h),
              lowPrice: parseFloat(tickerData.l),
              volume: parseFloat(tickerData.v),
              quoteVolume: parseFloat(tickerData.q),
              openTime: tickerData.O,
              closeTime: tickerData.C,
              firstId: tickerData.F,
              lastId: tickerData.L,
              count: tickerData.n,
            });

            // Update price with ticker data for consistency
            setPrice((prev) => ({
              usd: parseFloat(tickerData.c),
              coin: tickerData.s,
              price: parseFloat(tickerData.c),
              change24h: parseFloat(tickerData.P),
              volume24h: parseFloat(tickerData.q),
              timestamp: tickerData.E,
              marketCap: prev?.marketCap,
            }));
          }

        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);

        // Reconnect logic (only if not manually closed)
        if (!event.wasClean && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    };

    console.log('Connecting to Binance WebSocket:', wsUrl);
    connect();

    return () => {
      cleanupWebSocket();
    };
  }, [symbol, interval, cleanupWebSocket]);

  // Reset state when symbol or interval changes
  useEffect(() => {
    setPrice(null);
    setTrades([]);
    setOhlcv(null);
    setTicker(null);
  }, [symbol, interval]);

  return {
    price,
    trades,
    ohlcv,
    isConnected,
    ticker,
  };
};

export default useBinanceWebSocket;