import { fetcher } from "@/lib/coingecko.actions";
import { CoinOverviewFallback } from "./fallback";
import LiveCoinOverview from "./LiveCoinOverview";

const CoinOverview = async () => {
  try {
    const [coin, coinOHLCData] = await Promise.all([
      fetcher<CoinDetailsData>("/coins/bitcoin", {
        dex_pair_format: "symbol",
      }),
      fetcher<OHLCData[]>("/coins/bitcoin/ohlc", {
        vs_currency: "usd",
        days: 1,
        precision: "full",
      }),
    ]);

    return <LiveCoinOverview coin={coin} coinOHLCData={coinOHLCData} />;
  } catch (error) {
    console.error("Error fetching coin overview:", error);
    return <CoinOverviewFallback />;
  }
};

export default CoinOverview;
