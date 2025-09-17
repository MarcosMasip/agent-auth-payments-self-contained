import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isLocalMode, getLocalJwtSecret } from "@/lib/environment";
import jwt from "jsonwebtoken";

export async function GET() {
  if (!isLocalMode()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("local_session")?.value;
    if (!token) return NextResponse.json({ session: null });
    const decoded = jwt.verify(token, getLocalJwtSecret()) as { sub: string; email?: string };
    const session = { user: { id: decoded.sub, email: decoded.email ?? null }, accessToken: token };
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ session: null });
  }
}
