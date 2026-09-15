-- CreateTable
CREATE TABLE "SignInAttempt" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignInAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SignInAttempt_lockedUntil_idx" ON "SignInAttempt"("lockedUntil");
