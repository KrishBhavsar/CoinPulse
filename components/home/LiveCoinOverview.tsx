"use client";

import Image from "next/image";
import { formatCurrency } from "@/lib/utils";
import CandlestickChart from "../CandlestickChart";
import useBinanceWebSocket from "@/hooks/useBinanceWebSocket";

interface LiveCoinOverviewProps {
  coin: CoinDetailsData;
  coinOHLCData: OHLCData[];
}

const LiveCoinOverview = ({ coin, coinOHLCData }: LiveCoinOverviewProps) => {
  const { ohlcv, price } = useBinanceWebSocket({
    symbol: "btcusdt",
    interval: "30m",
  });

  const displayPrice = price?.usd ?? coin.market_data.current_price.usd;

  return (
    <div id="coin-overview">
      <CandlestickChart
        data={coinOHLCData}
        coinId="bitcoin"
        symbol="BTCUSDT"
        liveOhlcv={ohlcv}
        mode="live"
        initialPeriod="daily"
      >
        <div className="header pt-2">
          <Image
            src={coin.image.large}
            alt={coin.name}
            width={56}
            height={56}
          />
          <div className="info">
            <p>
              {coin.name} / {coin.symbol.toUpperCase()}
            </p>
            <h1>{formatCurrency(displayPrice)}</h1>
          </div>
        </div>
      </CandlestickChart>
    </div>
  );
};

export default LiveCoinOverview;
