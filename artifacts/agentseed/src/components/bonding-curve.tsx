import type { BondingCurvePoint } from "@workspace/api-client-react";

interface BondingCurveProps {
  points: BondingCurvePoint[];
  currentSupply?: number;
}

export function BondingCurve({ points, currentSupply = 0 }: BondingCurveProps) {
  if (!points || points.length === 0) return null;

  const width = 300;
  const height = 120;
  const padding = { top: 10, right: 16, bottom: 24, left: 40 };
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

  const currentX = toX(currentSupply);
  const currentPriceApprox = 0.0001 * Math.pow(currentSupply + 1, 1.5);
  const currentY = toY(Math.min(currentPriceApprox, maxPrice));

  const priceLabels = [0, maxPrice * 0.5, maxPrice].map((p) => ({
    y: toY(p),
    label: p < 0.001 ? p.toFixed(5) : p.toFixed(3),
  }));

  return (
    <div data-testid="bonding-curve">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 120 }}>
        <defs>
          <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(263,70%,65%)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(263,70%,65%)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <path d={fillD} fill="url(#curveGradient)" />
        <path d={pathD} fill="none" stroke="hsl(263,70%,65%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {priceLabels.map(({ y, label }) => (
          <text
            key={label}
            x={padding.left - 4}
            y={y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="8"
            fill="hsl(215,20%,55%)"
          >
            {label}
          </text>
        ))}

        <text x={padding.left} y={height - 4} fontSize="8" fill="hsl(215,20%,55%)">0</text>
        <text x={width - padding.right} y={height - 4} fontSize="8" fill="hsl(215,20%,55%)" textAnchor="end">
          {maxSupply}
        </text>

        {currentSupply > 0 && (
          <>
            <line
              x1={currentX}
              y1={padding.top}
              x2={currentX}
              y2={padding.top + plotH}
              stroke="hsl(188,90%,52%)"
              strokeWidth="1"
              strokeDasharray="3,2"
            />
            <circle cx={currentX} cy={currentY} r="3" fill="hsl(188,90%,52%)" />
          </>
        )}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>Supply →</span>
        <span>Price ↑</span>
      </div>
    </div>
  );
}
