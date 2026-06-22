"use client";

import { MessageSquareText, Contact } from "lucide-react";
import { HubTabs } from "@/components/hub-tabs";

const TEXT_TABS = [
  { label: "Messages", href: "/texts/messages", icon: MessageSquareText },
  { label: "Recipients", href: "/texts/recipients", icon: Contact },
];

export default function TextsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-6">
      <HubTabs tabs={TEXT_TABS} />
      {children}
    </div>
  );
}
