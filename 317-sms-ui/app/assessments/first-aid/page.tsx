import { HeartPulse } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function FirstAidAssessmentPage() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HeartPulse />
        </EmptyMedia>
        <EmptyTitle>First Aid assessments</EmptyTitle>
        <EmptyDescription>This sheet hasn&apos;t been built yet — check back soon.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
