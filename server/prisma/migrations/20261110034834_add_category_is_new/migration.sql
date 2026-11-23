-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClothingItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "badge" TEXT NOT NULL DEFAULT '试穿',
    "category" TEXT NOT NULL DEFAULT '',
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ClothingItem" ("badge", "createdAt", "id", "image", "sort", "title") SELECT "badge", "createdAt", "id", "image", "sort", "title" FROM "ClothingItem";
DROP TABLE "ClothingItem";
ALTER TABLE "new_ClothingItem" RENAME TO "ClothingItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
