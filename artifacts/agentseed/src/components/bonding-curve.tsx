import type { BondingCurvePoint } from "@workspace/api-client-react";

interface BondingCurveProps {
  points: BondingCurvePoint[];
  currentSupply: number;
  currentPrice?: number;
  treasuryBalance?: number;
  holderCount?: number;
  tokenSymbol?: string;
  isLive?: boolean;
}

export function BondingCurve({
  points,
  currentSupply,
  currentPrice,
  treasuryBalance,
  holderCount,
  tokenSymbol,
  isLive = false,
}: BondingCurveProps) {
  if (!points || points.length === 0) return null;

  const width = 320;
  const height = 140;
  const padding = { top: 12, right: 16, bottom: 24, left: 48 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxPrice = Math.max(...points.map((p) => p.price), 0.0001);
  const maxSupply = Math.max(...points.map((p) => p.supply), 1);

  const toX = (s: number) => padding.left + (s / maxSupply) * plotW;
  const toY = (p: number) => padding.top + plotH - (p / maxPrice) * plotH;

  const pathD = points
    .map((pt, i) => `${i === 0 ? "M" : "L"}${toX(pt.supply).toFixed(1)},${toY(pt.price).toFixed(1)}`)
    .join(" ");

  const fillD =
    pathD +
    ` L${toX(points[points.length - 1].supply).toFixed(1)},${(padding.top + plotH).toFixed(1)}` +
    ` L${toX(points[0].supply).toFixed(1)},${(padding.top + plotH).toFixed(1)} Z`;

  const safeSupply = Math.min(currentSupply, maxSupply);
  const currentX = toX(safeSupply);
  const computedPrice = currentPrice ?? 0.0001 * Math.pow(currentSupply + 1, 1.5);
  const currentY = toY(Math.min(computedPrice, maxPrice));

  const priceLabels = [0, maxPrice * 0.5, maxPrice].map((p) => ({
    y: toY(p),
    label: p < 0.001 ? p.toFixed(5) : p.toFixed(3),
  }));

  const formatPrice = (n: number) => (n < 0.001 ? n.toFixed(5) : n.toFixed(4));
  const formatNumber = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n % 1 === 0 ? n.toString() : n.toFixed(2);

  return (
    <div data-testid="bonding-curve" className="space-y-3">
      {(currentPrice !== undefined || treasuryBalance !== undefined || holderCount !== undefined) && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          {currentPrice !== undefined && (
            <div data-testid="bonding-current-price">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Price
              </div>
              <div className="font-mono text-foreground">
                {formatPrice(currentPrice)}
                {tokenSymbol && (
                  <span className="text-muted-foreground text-[10px] ml-1">/{tokenSymbol}</span>
                )}
              </div>
            </div>
          )}
          {treasuryBalance !== undefined && (
            <div data-testid="bonding-treasury">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Treasury
              </div>
              <div className="font-mono text-foreground">{formatNumber(treasuryBalance)}</div>
            </div>
          )}
          {holderCount !== undefined && (
            <div data-testid="bonding-holders">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Holders
              </div>
              <div className="font-mono text-foreground">{holderCount}</div>
            </div>
          )}
        </div>
      )}

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 140 }}>
        <defs>
          <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(220,13%,13%)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="hsl(220,13%,13%)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={fillD} fill="url(#curveGradient)" />
        <path d={pathD} fill="none" stroke="hsl(220,13%,13%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {priceLabels.map(({ y, label }) => (
          <text
            key={label}
            x={padding.left - 4}
            y={y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="8"
            fill="hsl(220,9%,46%)"
          >
            {label}
          </text>
        ))}

        <text x={padding.left} y={height - 4} fontSize="8" fill="hsl(220,9%,46%)">0</text>
        <text x={width - padding.right} y={height - 4} fontSize="8" fill="hsl(220,9%,46%)" textAnchor="end">
          {formatNumber(maxSupply)}
        </text>

        {currentSupply > 0 && (
          <line
            x1={currentX}
            y1={padding.top}
            x2={currentX}
            y2={padding.top + plotH}
            stroke="hsl(220,13%,13%)"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="3,2"
          />
        )}
        <circle cx={currentX} cy={currentY} r="3.5" fill="hsl(220,13%,13%)" />
        <circle cx={currentX} cy={currentY} r="6" fill="hsl(220,13%,13%)" fillOpacity="0.15">
          {isLive && (
            <animate
              attributeName="r"
              values="5;9;5"
              dur="2s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <text
          x={Math.min(currentX + 6, width - padding.right - 30)}
          y={Math.max(currentY - 8, padding.top + 8)}
          fontSize="8"
          fill="hsl(220,13%,13%)"
          fontFamily="monospace"
        >
          {formatNumber(currentSupply)}
        </text>
      </svg>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Supply →</span>
        <span>Price ↑</span>
      </div>
    </div>
  );
}
