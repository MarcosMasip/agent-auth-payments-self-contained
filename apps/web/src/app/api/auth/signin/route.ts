import { NextResponse } from "next/server";
import { isLocalMode, getLocalJwtSecret } from "@/lib/environment";
import { getPrisma } from "@/lib/db/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function POST(request: Request) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const token = jwt.sign({ sub: user.id, email: user.email }, getLocalJwtSecret(), { expiresIn: "7d" });
    const session = { user: { id: user.id, email: user.email }, accessToken: token };
    const res = NextResponse.json({ session });
    res.headers.set("Set-Cookie", `local_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
