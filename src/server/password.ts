import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "node:crypto";

// Argon2id con los parámetros por defecto de @node-rs/argon2 (m=19 MiB, t=2, p=1),
// que coinciden con la recomendación mínima de OWASP.

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Verifica contra un hash ficticio para que "usuario no existe" tarde lo mismo que "clave errada". */
export async function verifyDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("contraseña-ficticia-para-igualar-tiempos");
  await verifyPassword(await dummyHash, password);
  return false;
}

/** Contraseña temporal fácil de dictar por teléfono: sin caracteres ambiguos (0/O, 1/l/I). */
export function generateTempPassword(length = 10): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)]!, digits[randomInt(digits.length)]!];
  while (chars.length < length) chars.push(all[randomInt(all.length)]!);
  // Mezcla Fisher–Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
