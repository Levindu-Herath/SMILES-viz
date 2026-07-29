import type { RadarValues } from "@/types/molecule";
import { primary, text, warning } from "@/constants/theme";
import { Tooltip, type TooltipSide } from "@/components/ui/Tooltip";

const CX = 140;
const CY = 140;
const RADIUS = 110;
const AXIS_COUNT = 6;
const RINGS = [0.2, 0.4, 0.6, 0.8, 1.0];

interface AxisInfo {
  label: string;
  fullName: string;
  description: string;
  range: string;
  side: TooltipSide;
}

// Definitions + suitable ranges per SwissADME's bioavailability radar methodology.
// `side` controls which direction each tooltip opens, chosen so it never points
// off the six-sided hexagon back toward empty space (e.g. the top-right SIZE
// label opens its tooltip to the left, toward the chart's center).
const AXES: AxisInfo[] = [
  {
    label: "LIPO",
    fullName: "Lipophilicity",
    description: "Measures how well a molecule dissolves in fats/oils vs water (XLOGP3)",
    range: "−0.7 to +5.0",
    side: "bottom",
  },
  {
    label: "SIZE",
    fullName: "Molecular Weight",
    description: "Total molecular weight of the compound",
    range: "150 to 500 g/mol",
    side: "left",
  },
  {
    label: "POLAR",
    fullName: "Polarity",
    description: "Topological Polar Surface Area (TPSA) — indicates membrane permeability",
    range: "20 to 130 Å²",
    side: "left",
  },
  {
    label: "INSOLU",
    fullName: "Insolubility",
    description: "Water solubility estimate (ESOL log S) — lower means less soluble",
    range: "log S not greater than 6",
    side: "top",
  },
  {
    label: "INSATU",
    fullName: "Insaturation",
    description: "Fraction of sp3 carbons (Csp3) — indicates 3D character of the molecule",
    range: "Fraction Csp3 ≥ 0.25",
    side: "right",
  },
  {
    label: "FLEX",
    fullName: "Flexibility",
    description: "Number of rotatable bonds — indicates molecular rigidity/flexibility",
    range: "No more than 9",
    side: "right",
  },
];

function AxisTooltipContent({ fullName, description, range }: Omit<AxisInfo, "label" | "side">) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-white">{fullName}</p>
      <p className="mt-0.5 text-xs font-normal text-white/80">{description}</p>
      <p className="mt-1 text-xs font-medium text-primary-300">Range: {range}</p>
    </div>
  );
}

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
    <div className="relative w-full max-w-[280px]">
      <svg viewBox="0 0 280 280" className="w-full h-auto">
      {/* Grid rings */}
      {RINGS.map((s) => (
        <polygon
          key={s}
          points={polygon(Array(AXIS_COUNT).fill(s))}
          fill="none"
          stroke={text.muted}
          strokeWidth="0.5"
          opacity={0.4}
        />
      ))}

      {/* Axis lines */}
      {AXES.map((_, i) => {
        const [x, y] = polarToXY(i, 1);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke={text.muted}
            strokeWidth="0.5"
            opacity={0.4}
          />
        );
      })}

      {/* Drug-like zone (reference boundary) */}
      <polygon
        points={polygon(Array(AXIS_COUNT).fill(1))}
        fill={warning.bg}
        fillOpacity={0.3}
        stroke={warning.text}
        strokeWidth="1"
        strokeDasharray="4 2"
        opacity={0.6}
      />

      {/* Molecule values */}
      <polygon
        points={polygon(values)}
        fill={primary[500]}
        fillOpacity={0.15}
        stroke={primary[500]}
        strokeWidth="2"
      />

      {/* Value dots */}
      {values.map((v, i) => {
        const [x, y] = polarToXY(i, v);
        return <circle key={i} cx={x} cy={y} r="4" fill={primary[500]} />;
      })}
      </svg>

      {/* Axis labels — rendered as HTML overlay (not SVG <text>) so each one
          can host an interactive tooltip trigger with real DOM hover/focus/tap
          handling, which plain SVG text can't do cleanly. */}
      {AXES.map((axis, i) => {
        const [x, y] = polarToXY(i, 1 + 18 / RADIUS);
        const leftPct = (x / 280) * 100;
        const topPct = (y / 280) * 100;
        return (
          <div
            key={axis.label}
            className="absolute"
            style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: "translate(-50%, -50%)" }}
          >
            <Tooltip side={axis.side} content={<AxisTooltipContent {...axis} />}>
              <span className="text-[11px] font-medium text-text-secondary cursor-help underline decoration-dotted decoration-text-muted underline-offset-2">
                {axis.label}
              </span>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
