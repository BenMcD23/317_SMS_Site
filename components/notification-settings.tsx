"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorAlert } from "@/components/error-alert";
import {
  currentSubscription,
  disablePush,
  enablePush,
  getPushConfig,
  lookupDevice,
  needsHomeScreenInstall,
  pushSupported,
  sendTestPush,
  setPushTopics,
  type PushConfig,
} from "@/lib/push";

type Status =
  | { kind: "loading" }
  | { kind: "install" }
  | { kind: "unsupported" }
  | { kind: "server-off" }
  | { kind: "error"; message: string }
  | { kind: "ready"; config: PushConfig; subscribed: boolean; topics: string[] };

/** One labelled switch; the whole row is the label so it's a full-width tap target. */
function SwitchRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex min-h-9 cursor-pointer items-center justify-between gap-4 font-normal"
    >
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </Label>
  );
}

/**
 * Push notifications for this device, on the settings page: on/off, which
 * topics, and a test. Each phone or computer is signed up separately, so the
 * laptop can stay quiet while the phone buzzes.
 */
export function NotificationSettings() {
  const { data: session } = useSession();
  const token = session?.id_token;
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async (): Promise<Status> => {
      if (!pushSupported()) return { kind: needsHomeScreenInstall() ? "install" : "unsupported" };
      const config = await getPushConfig(token);
      if (!config.enabled || !config.publicKey) return { kind: "server-off" };
      const sub = await currentSubscription();
      const device = sub ? await lookupDevice(token, sub.endpoint) : { subscribed: false, topics: [] };
      return { kind: "ready", config, ...device };
    })()
      .catch((e: unknown): Status => ({ kind: "error", message: e instanceof Error ? e.message : String(e) }))
      .then((next) => {
        if (!cancelled) setStatus(next);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status.kind === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading notification settings">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }
  if (status.kind === "error")
    return <ErrorAlert title="Couldn't load notifications" message={status.message} />;
  if (status.kind === "install") {
    return (
      <p className="text-muted-foreground text-sm">
        On an iPhone or iPad, add 317 SMS to your Home Screen first (Share, then Add to Home Screen), open it
        from there, and turn notifications on in its Settings.
      </p>
    );
  }
  if (status.kind === "unsupported") {
    return <p className="text-muted-foreground text-sm">This browser can&apos;t show notifications.</p>;
  }
  if (status.kind === "server-off") {
    return (
      <p className="text-muted-foreground text-sm">Notifications aren&apos;t set up on the server yet.</p>
    );
  }

  const { config, subscribed, topics } = status;
  const blocked = !subscribed && typeof Notification !== "undefined" && Notification.permission === "denied";

  async function run(action: () => Promise<{ subscribed: boolean; topics: string[] }>, done?: string) {
    setBusy(true);
    try {
      const next = await action();
      setStatus({ kind: "ready", config, ...next });
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function toggleDevice(on: boolean) {
    if (!token) return;
    if (on) {
      // Everything on to start with; it's easier to turn one off than to find them.
      const all = config.topics.map((t) => t.key);
      return run(() => enablePush(token, config.publicKey!, all), "Notifications on for this device");
    }
    return run(async () => {
      await disablePush(token);
      return { subscribed: false, topics: [] };
    }, "Notifications off for this device");
  }

  function toggleTopic(key: string, on: boolean) {
    if (!token) return;
    const next = config.topics.map((t) => t.key).filter((k) => (k === key ? on : topics.includes(k)));
    return run(() => setPushTopics(token, next));
  }

  async function test() {
    if (!token) return;
    setBusy(true);
    try {
      await sendTestPush(token);
      toast.success("Test sent. It should arrive in a few seconds.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send a test notification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SwitchRow
        id="push-device"
        title="Notifications on this device"
        description="Alerts on this phone or computer, even when the app is closed. Turn them on separately on each device."
        checked={subscribed}
        disabled={busy || blocked}
        onChange={toggleDevice}
      />
      {blocked && (
        <p className="text-warning text-sm">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then come
          back.
        </p>
      )}
      {subscribed && (
        <>
          <div className="flex flex-col gap-3 border-t pt-4">
            {config.topics.map((t) => (
              <SwitchRow
                key={t.key}
                id={`push-topic-${t.key}`}
                title={t.label}
                description={t.description}
                checked={topics.includes(t.key)}
                disabled={busy}
                onChange={(on) => toggleTopic(t.key, on)}
              />
            ))}
          </div>
          <Button variant="outline" className="h-9 self-start" onClick={test} disabled={busy}>
            <BellRing />
            Send a test
          </Button>
        </>
      )}
    </div>
  );
}
