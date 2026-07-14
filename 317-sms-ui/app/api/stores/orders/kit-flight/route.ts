import { proxyToApi } from "@/lib/api-proxy";

export async function POST() {
  return proxyToApi("/stores/orders/kit-flight", { method: "POST" });
}
