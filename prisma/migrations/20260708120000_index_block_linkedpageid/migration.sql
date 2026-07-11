-- Backlink index: the graph endpoint's inbound query is
-- `SELECT ... FROM "Block" WHERE "linkedPageId" = ?`
-- and SQLite does not create an implicit index for FOREIGN KEYs. Without this
-- the query would scan every Block on every page navigation.
CREATE INDEX "Block_linkedPageId_idx" ON "Block"("linkedPageId");
