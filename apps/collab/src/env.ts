// The collab service's environment (P1.03). Deliberately thin: DATABASE_URL is the `rhema_collab`
// role's connection string (a Pulumi secret config — the role's grants live in migration 0028, and
// REQ-ARCH-25 forbids a superuser bypass), OBJECTS_BUCKET is the artifacts bucket the content store +
// the `restore/<ydoc>/<ts>` objects land in. No provider/model keys ever reach this service
// (REQ-ARCH-30) — collab holds DB + content-store access only.

export interface CollabEnv {
  readonly port: number;
  readonly databaseUrl: string | null;
  readonly objectsBucket: string | null;
}

export function readCollabEnv(env: NodeJS.ProcessEnv = process.env): CollabEnv {
  return {
    port: Number(env.PORT ?? 8080),
    databaseUrl: env.DATABASE_URL ?? null,
    objectsBucket: env.OBJECTS_BUCKET ?? null,
  };
}
