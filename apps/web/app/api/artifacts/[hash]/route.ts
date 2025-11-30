// /web/app/api/artifacts/[hash]/route.ts
import { jsonError } from "@/lib/apiError";
import { getArtifact } from "../store";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { hash: string } }) {
  const artifact = getArtifact(params.hash);
  if (!artifact) {
    return jsonError("NOT_FOUND", "artifact not found", 404);
  }
  return new Response(artifact, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
