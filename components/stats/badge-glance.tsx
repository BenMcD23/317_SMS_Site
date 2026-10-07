import type { BadgeBreakdown } from "@/lib/badge-history";
import { BADGE_LABELS, heldCount, LEVEL_ORDER, levelColor } from "@/lib/stats";

/**
 * Every badge on one screen: a row per badge, its bar split by the share of the
 * cohort at each level. Compact enough for the dashboard and for print, where
 * twelve trend cards would be too much.
 */
export function BadgeGlance({ cohort, order }: { cohort: BadgeBreakdown; order?: string[] }) {
  const total = cohort.total_cadets;
  const keys = order ?? Object.keys(BADGE_LABELS);
  const legend = LEVEL_ORDER.filter(
    (l) => l !== "None" && keys.some((k) => (cohort.badges[k]?.[l] ?? 0) > 0)
  );

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {keys.map((key) => {
          const levels = cohort.badges[key] ?? {};
          const label = BADGE_LABELS[key] ?? key;
          const held = heldCount(levels);
          // Unknown levels still count as held, so they get a segment too.
          const segments = [
            ...LEVEL_ORDER.filter((l) => l !== "None" && (levels[l] ?? 0) > 0),
            ...Object.keys(levels).filter((l) => l !== "None" && !LEVEL_ORDER.includes(l) && levels[l] > 0),
          ];
          const summary = segments.map((l) => `${levels[l]} ${l}`).join(", ") || "none held";
          return (
            <li
              key={key}
              className="grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
              aria-label={`${label}: ${held} of ${total} cadets hold it (${summary})`}
            >
              <span className="truncate">{label}</span>
              <div className="bg-muted flex h-3 overflow-hidden rounded-full">
                {total > 0 &&
                  segments.map((l) => (
                    <div
                      key={l}
                      className="border-card h-full border-r-2 last:border-r-0"
                      style={{ width: `${((levels[l] ?? 0) / total) * 100}%`, background: levelColor(l) }}
                      title={`${l}: ${levels[l]}`}
                    />
                  ))}
              </div>
              <span className="text-muted-foreground text-right text-xs tabular-nums">
                {total > 0 ? Math.round((held / total) * 100) : 0}%
              </span>
            </li>
          );
        })}
      </ul>
      {legend.length > 0 && (
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-hidden>
          {legend.map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ background: levelColor(l) }} />
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
