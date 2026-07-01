import type { RadarValues } from "@/types/molecule";

const CX = 140;
const CY = 140;
const RADIUS = 110;
const AXIS_COUNT = 6;
const LABELS = ["LIPO", "SIZE", "POLAR", "INSOLU", "INSATU", "FLEX"];
const RINGS = [0.2, 0.4, 0.6, 0.8, 1.0];

function polarToXY(index: number, scale: number): [number, number] {
  const angle = (2 * Math.PI * index) / AXIS_COUNT - Math.PI / 2;
  return [CX + scale * RADIUS * Math.cos(angle), CY + scale * RADIUS * Math.sin(angle)];
}

function polygon(values: number[]): string {
  return values
    .map((v, i) => {
      const [x, y] = polarToXY(i, v);
      return `${x},${y}`;
    })
    .join(" ");
}

interface RadarChartProps {
  data: RadarValues;
}

export function RadarChart({ data }: RadarChartProps) {
  const values = [data.lipo, data.size, data.polar, data.insolu, data.insatu, data.flex];

  return (
    <svg viewBox="0 0 280 280" className="w-full max-w-[280px]">
      {/* Grid rings */}
      {RINGS.map((s) => (
        <polygon
          key={s}
          points={polygon(Array(AXIS_COUNT).fill(s))}
          fill="none"
          stroke="rgb(100,116,139)"
          strokeWidth="0.5"
          opacity={0.3}
        />
      ))}

      {/* Axis lines */}
      {LABELS.map((_, i) => {
        const [x, y] = polarToXY(i, 1);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="rgb(100,116,139)"
            strokeWidth="0.5"
            opacity={0.3}
          />
        );
      })}

      {/* Drug-like zone */}
      <polygon
        points={polygon(Array(AXIS_COUNT).fill(1))}
        fill="rgb(248,113,113)"
        fillOpacity={0.1}
        stroke="rgb(248,113,113)"
        strokeWidth="1"
        strokeDasharray="4 2"
        opacity={0.5}
      />

      {/* Molecule values */}
      <polygon
        points={polygon(values)}
        fill="rgb(52,211,153)"
        fillOpacity={0.25}
        stroke="rgb(16,185,129)"
        strokeWidth="2"
      />

      {/* Value dots */}
      {values.map((v, i) => {
        const [x, y] = polarToXY(i, v);
        return <circle key={i} cx={x} cy={y} r="3.5" fill="rgb(16,185,129)" />;
      })}

      {/* Labels */}
      {LABELS.map((label, i) => {
        const [x, y] = polarToXY(i, 1 + 18 / RADIUS);
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgb(148,163,184)"
            fontSize="11"
            fontWeight="500"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
