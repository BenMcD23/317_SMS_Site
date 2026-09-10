import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/** Compact KPI tile: a label, a large value, and optional detail line. */
export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </CardContent>
    </Card>
  );
}
