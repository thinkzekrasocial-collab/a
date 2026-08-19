import { NextRequest } from "next/server";
import { sessionFromRequest } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  return Response.json({ user: session });
}
