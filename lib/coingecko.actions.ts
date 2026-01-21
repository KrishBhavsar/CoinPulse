"use server";

import qs from "query-string";

const BASE_URL = process.env.COINGECKO_BASE_URL;
const API_KEY = process.env.COINGECKO_API_KEY;

if (!BASE_URL) {
  throw new Error("COINGECKO_BASE_URL is not defined");
}

if (!API_KEY) {
  throw new Error("COINGECKO_API_KEY is not defined");
}

export async function fetcher<T>(
  endpoint: string,
  params?: QueryParams,
  revalidate = 60,
): Promise<T> {
  const url = qs.stringifyUrl(
    {
      url: `${BASE_URL}/${endpoint}`,
      query: params,
    },
    { skipEmptyString: true, skipNull: true },
  );

  const response = await fetch(url, {
    headers: {
      'x-cg-demo-api-key': API_KEY,
      'Content-Type': 'application/json',
    } as Record<string, string>,
    next: { revalidate },
  });

  if (!response.ok) {
    const errorBody: CoinGeckoErrorBody = await response.json().catch(() => ({}));

    throw new Error(`API Error: ${response.status}: ${errorBody.error || response.statusText} `);
  }

  return response.json();
}

// Fetch coin list with images (cached heavily since it rarely changes)
export async function getCoinList(): Promise<
  { id: string; symbol: string; name: string; image: string }[]
> {
  return fetcher<{ id: string; symbol: string; name: string; image: string }[]>(
    "/coins/markets",
    { vs_currency: "usd", per_page: 250, page: 1 },
    3600 // Cache for 1 hour
  );
}

// Map period to CoinGecko days parameter
const PERIOD_TO_DAYS: Record<Period, number | "max"> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  "3months": 90,
  "6months": 180,
  yearly: 365,
  max: "max",
};

// Fetch OHLC data from CoinGecko (fallback when Binance doesn't have the symbol)
export async function fetchCoinGeckoOHLC(
  coinId: string,
  period: Period
): Promise<OHLCData[]> {
  const days = PERIOD_TO_DAYS[period];

  try {
    // CoinGecko OHLC endpoint returns [timestamp_ms, open, high, low, close]
    const ohlcData = await fetcher<number[][]>(
      `/coins/${coinId}/ohlc`,
      { vs_currency: "usd", days },
      60
    );

    // Convert timestamp from ms to seconds to match our OHLCData format
    return ohlcData.map(([timestamp, open, high, low, close]) => [
      Math.floor(timestamp / 1000),
      open,
      high,
      low,
      close,
    ]);
  } catch (error) {
    console.error(`CoinGecko OHLC Error for ${coinId}:`, error);
    return [];
  }
}

export async function getPools(
  id: string,
  network?: string | null,
  contractAddress?: string | null,
): Promise<PoolData> {
  const fallback: PoolData = {
    id: '',
    address: '',
    name: '',
    network: '',
  };

  if (network && contractAddress) {
    try {
      const poolData = await fetcher<{ data: PoolData[] }>(
        `/onchain/networks/${network}/tokens/${contractAddress}/pools`,
      );

      return poolData.data?.[0] ?? fallback;
    } catch (error) {
      console.log(error);
      return fallback;
    }
  }

  try {
    const poolData = await fetcher<{ data: PoolData[] }>('/onchain/search/pools', { query: id });

    return poolData.data?.[0] ?? fallback;
  } catch {
    return fallback;
  }
}

