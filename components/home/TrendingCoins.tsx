import { fetcher } from "@/lib/coingecko.actions";
import Link from "next/link";
import Image from "next/image";
import { cn, formatCurrency, formatPercentage } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";
import DataTable from "@/components/DataTable";
import { TrendingCoinsFallback } from "./fallback";

const HARDCODED_COINS = ["ethereum", "solana", "binancecoin", "ripple", "sui", "dogecoin"];

type MarketCoin = {
  id: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
};

const TrendingCoins = async () => {
  let coins: MarketCoin[] = [];

  try {
    coins = await fetcher<MarketCoin[]>(
      "/coins/markets",
      {
        vs_currency: "usd",
        ids: HARDCODED_COINS.join(","),
      },
      300
    );
    // Sort coins to match our hardcoded order
    coins = HARDCODED_COINS.map(id => coins.find(c => c.id === id)).filter(Boolean) as MarketCoin[];
  } catch (error) {
    console.error("Error fetching coins:", error);
    return <TrendingCoinsFallback />;
  }

  const columns: DataTableColumn<MarketCoin>[] = [
    {
      header: "Name",
      cellClassName: "name-cell",
      cell: (coin) => {
        return (
          <Link href={`/coins/${coin.id}`}>
            <Image src={coin.image} alt={coin.name} width={36} height={36} />
            <p>{coin.name}</p>
          </Link>
        );
      },
    },
    {
      header: "24h Change",
      cellClassName: "change-cell",
      cell: (coin) => {
        const isTrendingUp = coin.price_change_percentage_24h > 0;

        return (
          <div
            className={cn(
              "price-change",
              isTrendingUp ? "text-green-500" : "text-red-500"
            )}
          >
            <p className="flex items-center">
              {formatPercentage(coin.price_change_percentage_24h)}
              {isTrendingUp ? (
                <TrendingUp width={16} height={16} />
              ) : (
                <TrendingDown width={16} height={16} />
              )}
            </p>
          </div>
        );
      },
    },
    {
      header: "Price",
      cellClassName: "price-cell",
      cell: (coin) => formatCurrency(coin.current_price),
    },
  ];

  return (
    <div id="trending-coins">
      <h4>Top Coins</h4>

      <DataTable
        data={coins}
        columns={columns}
        rowKey={(coin) => coin.id}
        tableClassName="trending-coins-table"
        headerCellClassName="py-3!"
        bodyCellClassName="py-2!"
      />
    </div>
  );
};

export default TrendingCoins;
