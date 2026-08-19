import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { errResponse, sessionFromRequest } from "@/lib/http";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await sessionFromRequest(request);
    if (session) {
      await logAudit({
        userId: session.id,
        action: "Logout",
        module: "Auth",
        description: `User "${session.username}" logged out.`,
      });
    }
    const response = Response.json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    );
    return response;
  } catch (error) {
    return errResponse(error);
  }
}
