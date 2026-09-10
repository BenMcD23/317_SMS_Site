// Shared types + display helpers for the committee request tracker.

export type CommitteeRequestStatus =
  | "submitted"
  | "sent_to_committee"
  | "approved"
  | "rejected"
  | "sent_for_payment"
  | "paid"
  | "withdrawn";

export interface CommitteeRequestItem {
  description: string;
  cost: number;
}

export interface CommitteeReceipt {
  id: number;
  filename: string;
  mime_type: string;
  uploaded_at: string | null;
}

export interface CommitteeRequestSummary {
  id: number;
  reference: string;
  title: string;
  total: number;
  status: CommitteeRequestStatus;
  requester_name: string;
  requester_email: string;
  created_at: string | null;
  receipt_count: number;
}

export interface CommitteeRequestDetail extends CommitteeRequestSummary {
  items: CommitteeRequestItem[];
  justification: string;
  rejection_reason: string | null;
  sent_to_committee_at: string | null;
  sent_to_committee_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  sent_for_payment_at: string | null;
  paid_at: string | null;
  paid_marked_by: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  receipts: CommitteeReceipt[];
  can_approve: boolean;
  is_requester: boolean;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const STATUS_LABELS: Record<CommitteeRequestStatus, string> = {
  submitted: "Submitted",
  sent_to_committee: "With committee",
  approved: "Approved",
  rejected: "Rejected",
  sent_for_payment: "Sent for payment",
  paid: "Paid",
  withdrawn: "Withdrawn",
};

// Badge variant + a colour class for statuses the default variants don't cover.
export const STATUS_STYLE: Record<
  CommitteeRequestStatus,
  { variant: BadgeVariant; className?: string }
> = {
  submitted: { variant: "secondary" },
  sent_to_committee: { variant: "outline", className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  approved: { variant: "outline", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rejected: { variant: "destructive" },
  sent_for_payment: { variant: "outline", className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500" },
  paid: { variant: "outline", className: "text-muted-foreground" },
  withdrawn: { variant: "outline", className: "text-muted-foreground line-through" },
};

export function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
