-- Авторизация профилей (v9): вход по 6-значному пинкоду.
--   pinHash — хеш пинкода (scrypt), null → первый вход по имени;
--   isAdmin — право создавать профили и управлять ими;
--   Session — сессии входа (токен живёт в cookie tabel_session).
-- Старейший профиль становится админом: это профиль, созданный первым
-- запуском приложения (или первый в восстановленной копии).

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "Profile" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_profileId_idx" ON "Session"("profileId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- Data: старейший профиль (при равных createdAt решает rowid) становится админом
UPDATE "Profile" SET "isAdmin" = 1
WHERE "rowid" = (
    SELECT "rowid" FROM "Profile" ORDER BY "createdAt" ASC, "rowid" ASC LIMIT 1
);
