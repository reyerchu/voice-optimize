import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "ve_session";
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

export async function getOrCreateSession() {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;

  if (existing) {
    const session = await prisma.session.findUnique({ where: { id: existing } });
    if (session) {
      await prisma.session.update({
        where: { id: existing },
        data: { lastSeen: new Date() },
      });
      return session;
    }
  }

  const created = await prisma.session.create({ data: {} });
  jar.set(COOKIE_NAME, created.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
  return created;
}

export async function getSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value ?? null;
}
