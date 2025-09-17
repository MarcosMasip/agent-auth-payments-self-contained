import { NextResponse } from "next/server";
import { isLocalMode } from "@/lib/environment";

export async function POST() {
  if (!isLocalMode()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const res = NextResponse.json({ success: true });
  res.headers.set("Set-Cookie", `local_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  return res;
}
