-- CreateTable
CREATE TABLE "HelloWorld" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelloWorld_pkey" PRIMARY KEY ("id")
);
