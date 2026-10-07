import { Stat } from "@/components/stat";
import { FLIGHT_ORDER, RANK_ORDER } from "@/lib/cadet-format";
import type { SquadronStats } from "@/lib/stats";

function breakdownLine(counts: Record<string, number>, order: string[]): string {
  const known = order.filter((k) => counts[k] !== undefined).map((k) => `${counts[k]} ${k}`);
  const extra = Object.keys(counts)
    .filter((k) => !order.includes(k))
    .map((k) => `${counts[k]} ${k}`);
  return [...known, ...extra].join(" · ");
}

/** The headline tiles, shared by the dashboard and the stats page so they never disagree. */
export function SquadronKpis({ stats, strengthHint }: { stats: SquadronStats; strengthHint?: string }) {
  const ncoRanks = Object.fromEntries(
    Object.entries(stats.by_rank).filter(([r]) => r !== "Cadet" && r !== "Unknown")
  );
  const ncoCount = Object.values(ncoRanks).reduce((sum, n) => sum + n, 0);
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Stat size="lg" label="Cadets on strength" value={stats.total_cadets} hint={strengthHint} />
      <Stat
        size="lg"
        label="Flights"
        value={Object.keys(stats.by_flight).length}
        hint={breakdownLine(stats.by_flight, FLIGHT_ORDER)}
      />
      <Stat size="lg" label="NCOs" value={ncoCount} hint={breakdownLine(ncoRanks, RANK_ORDER)} />
    </section>
  );
}
