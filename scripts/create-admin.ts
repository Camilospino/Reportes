/**
 * Crea (o restablece) un ADMINISTRADOR. Pensado para producción.
 *
 *   ADMIN_USERNAME=ana ADMIN_NAME="Ana Martínez" ADMIN_PASSWORD='...' npm run admin:create
 *
 * Con Docker:
 *   docker compose run --rm -e ADMIN_USERNAME=ana -e ADMIN_NAME="Ana Martínez" \
 *     -e ADMIN_PASSWORD='...' migrate npm run admin:create
 */
import { PrismaClient } from "@prisma/client";
import { passwordSchema, usernameSchema } from "../src/domain/schemas";
import { hashPassword } from "../src/server/password";

const prisma = new PrismaClient();

async function main() {
  const username = usernameSchema.parse(process.env.ADMIN_USERNAME);
  const name = (process.env.ADMIN_NAME ?? "").trim();
  if (!name) throw new Error("Falta ADMIN_NAME");
  const pw = passwordSchema.safeParse(process.env.ADMIN_PASSWORD ?? "");
  if (!pw.success) throw new Error(`ADMIN_PASSWORD no válida: ${pw.error.issues.map((i) => i.message).join(" ")}`);

  const passwordHash = await hashPassword(pw.data);
  const user = await prisma.user.upsert({
    where: { username },
    update: { name, passwordHash, role: "ADMIN", active: true, mustChangePassword: false },
    create: { username, name, passwordHash, role: "ADMIN" },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`✔ Administrador '${username}' listo.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
