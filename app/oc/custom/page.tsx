"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, LayoutGrid, Move, Plus, Sparkles } from "lucide-react";

import { useApiQuery } from "@/lib/use-api-query";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import {
  type CustomDashboard,
  type Dataset,
  type Panel,
  RANGE_OPTIONS,
  newPanelId,
  nextPosition,
  starterPanels,
} from "@/lib/custom-dashboard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { useConfirm } from "@/components/confirm-dialog";
import { OcOnly } from "@/components/oc/oc-access-required";
import { DashboardGrid } from "@/components/oc/custom-dashboard/dashboard-grid";
import { PanelEditor } from "@/components/oc/custom-dashboard/panel-editor";

const DASH_KEY = ["oc-custom-dashboard"] as const;

export default function OcCustomDashboardPage() {
  return (
    <OcOnly>
      <CustomDashboardBody />
    </OcOnly>
  );
}

function CustomDashboardBody() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const dash = useApiQuery<CustomDashboard>(DASH_KEY, "/oc/custom-dashboard");
  const catalogue = useApiQuery<Dataset[]>(["oc-custom-datasets"], "/oc/custom-dashboard/datasets", {
    staleTime: Infinity,
  });

  const [editing, setEditing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null);
  // Counts saves so only the latest one's answer is applied: two quick moves
  // can come back out of order, and the older reply mustn't undo the newer.
  const saveSeq = useRef(0);

  const datasets = catalogue.data ?? [];
  const panels = dash.data?.panels ?? [];
  // `range_days` is null for "All time", so only a missing value means the default.
  const rangeDays = dash.data ? dash.data.range_days : 90;

  // Shown straight away, saved in the background, and put back if the save
  // fails, so the screen never shows a dashboard the next visit won't.
  const save = async (next: { panels?: Panel[]; range_days?: number | null }) => {
    const token = session?.id_token;
    if (!token) return;
    const seq = ++saveSeq.current;
    const previous = queryClient.getQueryData<CustomDashboard>(DASH_KEY);
    const body = { range_days: rangeDays, panels, ...next };
    queryClient.setQueryData<CustomDashboard>(DASH_KEY, { ...body, customised: true });
    try {
      const saved = await apiRequest<CustomDashboard>(
        token,
        `${API_BASE}/oc/custom-dashboard`,
        { method: "PUT", body },
        "Couldn't save the dashboard."
      );
      if (seq === saveSeq.current) queryClient.setQueryData<CustomDashboard>(DASH_KEY, saved);
    } catch (e) {
      if (seq === saveSeq.current) queryClient.setQueryData<CustomDashboard>(DASH_KEY, previous);
      toast.error(e instanceof Error ? e.message : "Couldn't save the dashboard.");
    }
  };

  const openEditor = (panel: Panel | null) => {
    setEditingPanel(panel);
    setEditorOpen(true);
  };

  const savePanel = (p: Omit<Panel, "x" | "y" | "w" | "h"> & Partial<Pick<Panel, "x" | "y" | "w" | "h">>) => {
    const existing = panels.find((q) => q.id === p.id);
    const next = existing
      ? panels.map((q) => (q.id === p.id ? { ...q, ...p } : q))
      : [...panels, { w: 6, h: 5, ...nextPosition(panels), ...p } as Panel];
    setEditorOpen(false);
    void save({ panels: next });
  };

  const duplicate = (p: Panel) =>
    void save({
      panels: [...panels, { ...p, id: newPanelId(), title: `${p.title} (copy)`, ...nextPosition(panels) }],
    });

  const remove = (p: Panel) =>
    confirm(
      `Remove "${p.title}" from the dashboard?`,
      () => void save({ panels: panels.filter((q) => q.id !== p.id) })
    );

  const loading = dash.isLoading || catalogue.isLoading;
  const loadError = dash.error ?? catalogue.error;
  const ready = !loading && !loadError;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="Custom Dashboard"
        description="Build your own panels from squadron data, and arrange them how you like."
        actions={
          ready && (
            <div className="flex flex-wrap items-center gap-2">
              {panels.length > 0 && (
                <Button
                  variant={editing ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditing((e) => !e)}
                >
                  {editing ? <Check /> : <Move />}
                  {editing ? "Done" : "Arrange panels"}
                </Button>
              )}
              <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => openEditor(null)}>
                <Plus />
                Add panel
              </Button>
            </div>
          )
        }
      />

      {ready && panels.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Time range"
            value={rangeDays === null ? "all" : String(rangeDays)}
            // Radix sends "" when the pressed item is clicked again; keep it pressed.
            onValueChange={(v) => v && void save({ range_days: v === "all" ? null : Number(v) })}
          >
            {RANGE_OPTIONS.map((o) => (
              <ToggleGroupItem
                key={o.label}
                value={o.days === null ? "all" : String(o.days)}
                className="px-3"
              >
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {editing && (
            <p className="text-muted-foreground text-sm">
              Drag a panel by its grip, or resize it from its corner. Each change is saved.
            </p>
          )}
        </div>
      )}

      {loadError ? (
        <ErrorAlert title="Couldn't load the dashboard" message={loadError.message} />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full md:col-span-2" />
        </div>
      ) : panels.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No panels yet"
          description="A panel counts something (cadets, attendance, qualifications, flying), grouped and filtered however you like. Start from scratch, or add some examples to edit."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => openEditor(null)}>
              <Plus />
              Add panel
            </Button>
            <Button variant="outline" onClick={() => void save({ panels: starterPanels() })}>
              <Sparkles />
              Add examples
            </Button>
          </div>
        </EmptyState>
      ) : (
        <DashboardGrid
          panels={panels}
          datasets={datasets}
          rangeDays={rangeDays}
          editing={editing}
          onLayout={(next) => void save({ panels: next })}
          onEdit={openEditor}
          onDuplicate={duplicate}
          onRemove={remove}
        />
      )}

      {datasets.length > 0 && (
        <PanelEditor
          open={editorOpen}
          panel={editingPanel}
          datasets={datasets}
          rangeDays={rangeDays}
          onOpenChange={setEditorOpen}
          onSave={savePanel}
        />
      )}
      {confirmDialog}
    </div>
  );
}
