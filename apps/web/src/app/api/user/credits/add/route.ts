import { NextResponse } from "next/server";
import { isLocalMode } from "@/lib/environment";
import { ensureUserRecord, setCredits, getCredits } from "@/lib/db/users";

export async function POST(request: Request) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const { userId, amount } = await request.json();
    if (!userId || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }
    await ensureUserRecord(userId);
    const current = await getCredits(userId);
    const newBalance = await setCredits(userId, current + amount);
    return NextResponse.json({ success: true, newBalance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
