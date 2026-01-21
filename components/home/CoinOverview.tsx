import { fetcher } from "@/lib/coingecko.actions";
import { fetchBinanceKlines } from "@/lib/binance.actions";
import { CoinOverviewFallback } from "./fallback";
import LiveCoinOverview from "./LiveCoinOverview";

const CoinOverview = async () => {
  try {
    const [coin, coinOHLCData] = await Promise.all([
      fetcher<CoinDetailsData>("/coins/bitcoin", {
        dex_pair_format: "symbol",
      }),
      fetchBinanceKlines("BTCUSDT", "daily"),
    ]);

    return <LiveCoinOverview coin={coin} coinOHLCData={coinOHLCData} />;
  } catch (error) {
    console.error("Error fetching coin overview:", error);
    return <CoinOverviewFallback />;
  }
};

export default CoinOverview;
