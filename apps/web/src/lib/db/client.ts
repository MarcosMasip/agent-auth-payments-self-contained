// Import Prisma client in a way that is resilient to type resolution issues
// with certain Next.js/TS configurations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PrismaPkg = require("@prisma/client");
type PrismaClient = InstanceType<typeof PrismaPkg.PrismaClient>;

let prisma: PrismaClient | null = null;

export function getPrisma() {
  if (!prisma) prisma = new PrismaPkg.PrismaClient();
  return prisma;
}
