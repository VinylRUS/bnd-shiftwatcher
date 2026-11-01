-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rate" REAL,
    "defStart" TEXT NOT NULL DEFAULT '09:00',
    "defEnd" TEXT NOT NULL DEFAULT '18:00',
    "defLunch" BOOLEAN NOT NULL DEFAULT true,
    "defLunchMin" INTEGER NOT NULL DEFAULT 60,
    "defPlace" TEXT NOT NULL DEFAULT 'Склад',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DayRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "off" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "lunch" BOOLEAN NOT NULL DEFAULT false,
    "lunchMin" INTEGER NOT NULL DEFAULT 0,
    "place" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "DayRow_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Profile_createdAt_idx" ON "Profile"("createdAt");

-- CreateIndex
CREATE INDEX "DayRow_profileId_date_idx" ON "DayRow"("profileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DayRow_profileId_date_key" ON "DayRow"("profileId", "date");

