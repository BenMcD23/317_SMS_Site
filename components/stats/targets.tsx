"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Plus, Trash2, TrendingUp, TriangleAlert } from "lucide-react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { formatDate, formatShortDate, todayLocal } from "@/lib/format";
import {
  BADGE_LABELS,
  cohortOf,
  describeTarget,
  flightLabel,
  type SquadronStats,
  type StatsPoint,
  type StatsTarget,
  targetOutlook,
  targetPct,
  targetSeries,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

/**
 * Squadron goals for badges, set by staff: where each stands now, its trend
 * against the goal line, and whether the current pace gets there by the due
 * date. Anyone who can see the page sees the targets; only staff change them.
 */

const ANY = "any";
const ALL = "all";

function Outlook({ series, target }: { series: { date: string; pct: number }[]; target: StatsTarget }) {
  const o = targetOutlook(series, target);
  // Status colours always come with an icon and words, never colour alone.
  if (o.status === "met")
    return (
      <span className="text-success flex items-center gap-1 text-xs font-medium">
        <CircleCheck className="size-3.5" /> Target met
      </span>
    );
  if (o.status === "unknown")
    return <span className="text-muted-foreground text-xs">Needs two weeks of history to project</span>;
  if (o.status === "on-track")
    return (
      <span className="text-success flex items-center gap-1 text-xs font-medium">
        <TrendingUp className="size-3.5" /> On track · projected {formatDate(o.projectedDate)}
      </span>
    );
  return (
    <span className="text-warning flex items-center gap-1 text-xs font-medium">
      <TriangleAlert className="size-3.5" />
      {o.projectedDate
        ? `Behind · projected ${formatDate(o.projectedDate)}`
        : "Behind · not rising in this range"}
    </span>
  );
}

function TargetCard({
  target,
  stats,
  history,
  live,
  onDelete,
}: {
  target: StatsTarget;
  stats: SquadronStats | null | undefined;
  history: StatsPoint[];
  live: boolean;
  onDelete?: () => void;
}) {
  const now = targetPct(cohortOf(stats, target.flight, target.exclude_juniors), target.badge, target.levels);
  // A past range's trend ends on its last snapshot, like every other chart.
  const series = targetSeries(history, live ? stats : null, target);
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-sm leading-snug">{describeTarget(target)}</CardTitle>
        {onDelete && (
          <CardAction>
            <Button
              variant="ghost"
              size="icon"
              className="no-print text-muted-foreground size-7"
              aria-label={`Delete target: ${describeTarget(target)}`}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${Math.min(now ?? 0, 100)}%` }}
            />
            {/* The goal, marked on the bar. */}
            <div
              className="bg-foreground absolute inset-y-0 w-0.5"
              style={{ left: `${target.target_pct}%` }}
              aria-hidden
            />
          </div>
          <span className="text-xs tabular-nums">
            {now === null ? "—" : `${now}%`}{" "}
            <span className="text-muted-foreground">/ {target.target_pct}%</span>
          </span>
        </div>
        <Outlook series={series} target={target} />
        {series.length >= 2 && (
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={(d) => formatShortDate(String(d))}
                formatter={(v) => [`${v}%`, "Holding it"]}
              />
              <ReferenceLine y={target.target_pct} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function AddTargetDialog({
  open,
  onOpenChange,
  flights,
  badgeLevels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flights: string[];
  badgeLevels: Record<string, string[]>;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [badge, setBadge] = useState("first_aid");
  const [minLevel, setMinLevel] = useState(ANY);
  const [flight, setFlight] = useState(ALL);
  const [excludeJuniors, setExcludeJuniors] = useState(true);
  const [pct, setPct] = useState("80");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);

  const levels = badgeLevels[badge] ?? [];
  const pctNum = Number(pct);
  const badPct = !Number.isInteger(pctNum) || pctNum < 1 || pctNum > 100;
  const problem = badPct ? "Target must be 1–100%" : !due ? "Pick a due date" : null;

  const save = async () => {
    setTriedSave(true);
    if (problem || !session?.id_token) return;
    setSaving(true);
    try {
      await apiRequest(session.id_token, `${API_BASE}/stats/targets`, {
        method: "POST",
        body: {
          badge,
          min_level: minLevel === ANY ? null : minLevel,
          flight: flight === ALL ? null : flight,
          exclude_juniors: excludeJuniors,
          target_pct: pctNum,
          due,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["stats", "targets"] });
      toast.success("Target added");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the target.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a target</DialogTitle>
          <DialogDescription>The share of cadets who should hold a badge by a date.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-badge">Badge</Label>
              <Select
                value={badge}
                onValueChange={(v) => {
                  setBadge(v);
                  setMinLevel(ANY);
                }}
              >
                <SelectTrigger id="target-badge" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BADGE_LABELS).map(([key, name]) => (
                    <SelectItem key={key} value={key}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-level">At least</Label>
              <Select value={minLevel} onValueChange={setMinLevel}>
                <SelectTrigger id="target-level" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any level</SelectItem>
                  {levels.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l} or better
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-flight">Who</Label>
              <Select value={flight} onValueChange={setFlight}>
                <SelectTrigger id="target-flight" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Whole squadron</SelectItem>
                  {flights.map((f) => (
                    <SelectItem key={f} value={f}>
                      {flightLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="target-juniors"
                checked={excludeJuniors}
                onCheckedChange={(v) => setExcludeJuniors(v === true)}
              />
              <Label htmlFor="target-juniors" className="font-normal">
                Exclude juniors
              </Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-pct">Target %</Label>
              <Input
                id="target-pct"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-due">By</Label>
              <Input
                id="target-due"
                type="date"
                min={todayLocal()}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>
          {/* The date starts empty, so it's only flagged once Add is pressed: nagging before
              it's picked helps nobody, but a greyed-out Add with no reason read as broken. */}
          {(badPct || triedSave) && problem && (
            <p className="text-destructive text-xs" role="alert">
              {problem}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={badPct || saving}>
              {saving ? "Saving…" : "Add target"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TargetsSection({
  targets,
  stats,
  history,
  flights,
  badgeLevels,
  canEdit,
  live,
}: {
  targets: StatsTarget[];
  stats: SquadronStats | null | undefined;
  history: StatsPoint[];
  live: boolean;
  flights: string[];
  badgeLevels: Record<string, string[]>;
  canEdit: boolean;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [adding, setAdding] = useState(false);

  const remove = (t: StatsTarget) =>
    confirm(`Delete the target "${describeTarget(t)}"?`, async () => {
      try {
        await apiRequest(session!.id_token!, `${API_BASE}/stats/targets/${t.id}`, { method: "DELETE" });
        await queryClient.invalidateQueries({ queryKey: ["stats", "targets"] });
        toast.success("Target deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the target.");
      }
    });

  if (!canEdit && targets.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">Targets</h2>
          <p className="text-muted-foreground text-sm">
            Projections fit a straight line through the selected range, so treat them as a guide
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" className="no-print" onClick={() => setAdding(true)}>
            <Plus /> Add target
          </Button>
        )}
      </div>
      {targets.length === 0 ? (
        <p className={cn("text-muted-foreground rounded-md border border-dashed px-4 py-3 text-sm")}>
          No targets yet. Add one to track a badge goal, like 80% of non-juniors with Blue First Aid by the
          summer.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {targets.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              stats={stats}
              history={history}
              live={live}
              onDelete={canEdit ? () => remove(t) : undefined}
            />
          ))}
        </div>
      )}
      {canEdit && (
        <AddTargetDialog open={adding} onOpenChange={setAdding} flights={flights} badgeLevels={badgeLevels} />
      )}
      {confirmDialog}
    </section>
  );
}
