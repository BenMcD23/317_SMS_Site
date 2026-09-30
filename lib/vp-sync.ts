/**
 * Volunteer Portal sync: shared types, labels and the bookmarklet.
 *
 * VP can't be read from this site directly (it sends no CORS headers, and its
 * session cookie isn't ours). The bookmarklet runs public/vp-sync-collector.js
 * inside a VP tab, where VP's API is same-origin, and that script hands the
 * data to a popup of the VP Sync page, which posts it to the API's /vp-sync.
 * The full picture is in SMS_Scrapers_API's docs/vp-sync.md.
 */

export const VP_ORIGIN = "https://volunteers.bader.mod.uk";

/** The ?receive=1 popup the bookmarklet opens; see app/tools/vp-sync/receiver.tsx. */
export const VP_SYNC_RECEIVER_PATH = "/tools/vp-sync?receive=1";

/** Every dataset the API accepts (routers/vp_sync.py DATASETS), in display order. */
export const VP_DATASETS = [
  { id: "mandatory_training", label: "Mandatory training", description: "VP's mandatory training tracker" },
  { id: "learning", label: "E-learning", description: "Learn course history" },
  { id: "exam_results", label: "Classification exams", description: "Exam results" },
  { id: "agreements", label: "Agreements", description: "Code of conduct agreements" },
  { id: "whts", label: "Weapon handling tests", description: "WHTs from Shooting Management" },
  { id: "shooting_log", label: "Shooting log", description: "Range log" },
  { id: "fieldcraft", label: "Fieldcraft", description: "Fieldcraft lessons completed" },
  { id: "aviation", label: "Flying", description: "Flying and gliding sorties" },
] as const;

export type VpDatasetId = (typeof VP_DATASETS)[number]["id"];

export function datasetLabel(id: string): string {
  return VP_DATASETS.find((d) => d.id === id)?.label ?? id;
}

/** VP permissions the syncing account needs, and what each one unlocks. */
export const VP_PERMISSIONS = [
  { name: "Cadet Details – View", unlocks: "the cadet roster, and with it everything else for cadets" },
  { name: "Staff Details – View", unlocks: "the staff roster and CFAV mandatory training" },
  { name: "Learn Results – View", unlocks: "classification exam results" },
  { name: "Shooting Management (WHT)", unlocks: "weapon handling tests" },
  { name: "Aviation logs – View", unlocks: "flying and gliding records" },
];

export type VpSyncStatus = {
  people: number;
  lastRosterSync: { at: string; by: string } | null;
  datasets: Record<string, { count: number; lastSyncedAt: string | null }>;
};

export type VpPersonSummary = {
  cin: number;
  personType: "cadet" | "staff";
  givenName: string | null;
  familyName: string | null;
  rank: string | null;
  syncedAt: string;
  datasets: string[];
};

export type VpPersonDetail = {
  personnelWebId: string;
  cin: number;
  personType: "cadet" | "staff";
  profile: Record<string, unknown>;
  syncedAt: string;
  records: Record<string, { payload: unknown; syncedAt: string; syncedBy: string }>;
};

/** What the collector reports when a run finishes. */
export type VpSyncSummary = {
  people: number;
  notOnSmsRoster: number;
  removed: number;
  recordsStored: number;
  noPermission: string[];
  failed: number;
};

/**
 * The bookmarklet's `javascript:` URL. It stays tiny and loads the real script
 * from this site on every click, so fixing the collector never means asking
 * people to re-add the bookmark. The popup is opened here, in the click itself,
 * because a pop-up opened after the script loads would be blocked.
 */
export function bookmarkletHref(smsOrigin: string): string {
  const code = `(()=>{const o=${JSON.stringify(smsOrigin)};if(location.origin!==${JSON.stringify(VP_ORIGIN)}){alert("Open the Volunteer Portal, sign in, then click this bookmark there.");return}const w=window.open(o+${JSON.stringify(VP_SYNC_RECEIVER_PATH)},"vp-sync","width=520,height=680");if(!w){alert("Allow pop-ups for the Volunteer Portal, then click the bookmark again.");return}window.__vpSync=Object.assign(window.__vpSync||{},{origin:o,popup:w});const s=document.createElement("script");s.src=o+"/vp-sync-collector.js?t="+Date.now();s.onerror=()=>alert("Couldn't load the 317 SMS sync script.");document.body.appendChild(s)})()`;
  return `javascript:${encodeURIComponent(code)}`;
}
