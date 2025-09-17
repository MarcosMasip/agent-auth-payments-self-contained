import { getPrisma } from "@/lib/db/client";

export async function ensureUserRecord(id: string, email?: string | null) {
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id,
      email: email || `user_${id}@local.test`,
      passwordHash: "!", // placeholder; not used for Supabase users
      subscription_status: "inactive",
      credits_available: 0,
    },
  });
}

export async function getCredits(id: string) {
  const prisma = getPrisma();
  const u = await prisma.user.findUnique({ where: { id } });
  return u?.credits_available ?? 0;
}

export async function setCredits(id: string, amount: number) {
  const prisma = getPrisma();
  const u = await prisma.user.update({ where: { id }, data: { credits_available: amount } });
  return u.credits_available;
}

export async function upsertSubscriptionFromPrice(id: string, priceId: string, credits: number, email?: string | null) {
  const prisma = getPrisma();
  await prisma.user.upsert({
    where: { id },
    create: {
      id,
      email: email || `user_${id}@local.test`,
      passwordHash: "!",
      subscription_status: "active",
      price_id: priceId,
      credits_available: credits,
    },
    update: {
      subscription_status: "active",
      price_id: priceId,
      credits_available: credits,
    },
  });
}
