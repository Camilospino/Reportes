import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Almacenamiento de fotos detrás de una interfaz mínima.
 * - "local": disco (desarrollo y pruebas).
 * - "s3": Cloudflare R2 o cualquier S3 compatible (producción). Bucket PRIVADO:
 *   las fotos se entregan a través de /api/fotos/[id], que verifica permisos.
 */
export interface FileStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Devuelve el contenido o null si no existe. */
  get(key: string): Promise<ReadableStream<Uint8Array> | Buffer | null>;
}

/** Las llaves las genera el servidor; aun así se validan (defensa contra path traversal). */
const KEY_RE = /^[a-z0-9/_-]+\.(jpg|jpeg)$/;
function assertKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error(`Llave de almacenamiento inválida: ${key}`);
}

class LocalStorage implements FileStorage {
  constructor(private readonly root: string) {}
  async put(key: string, body: Buffer) {
    assertKey(key);
    const file = path.join(this.root, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  async get(key: string) {
    assertKey(key);
    try {
      return await readFile(path.join(this.root, key));
    } catch {
      return null;
    }
  }
}

class S3Storage implements FileStorage {
  private readonly client: S3Client;
  constructor(private readonly bucket: string) {
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    assertKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body ? (res.Body.transformToWebStream() as ReadableStream<Uint8Array>) : null;
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
}

let instance: FileStorage | undefined;
export function storage(): FileStorage {
  if (!instance) {
    const driver = process.env.STORAGE_DRIVER ?? "local";
    if (driver === "s3") {
      if (!process.env.S3_BUCKET) throw new Error("Falta S3_BUCKET");
      instance = new S3Storage(process.env.S3_BUCKET);
    } else {
      instance = new LocalStorage(path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_STORAGE_DIR ?? "./storage"));
    }
  }
  return instance;
}
