-- Full-text search index.
-- Standalone FTS5 virtual table (content-populated, default mode) with one row
-- per searchable unit: a page (indexing its title) or a block (indexing its
-- content). The `text` column is tokenized; everything else is UNINDEXED metadata
-- carried along for display/navigation and for delete-by-key on trigger.
--
-- We keep the index in sync via six AFTER triggers on Page and Block. Because
-- Page/Block foreign keys use ON DELETE CASCADE (see the init migration),
-- deleting a root page fires AFTER DELETE triggers on every descendant page and
-- block automatically — no application-level walk required.
CREATE VIRTUAL TABLE "SearchIndex" USING fts5(
    "kind" UNINDEXED,
    "pageId" UNINDEXED,
    "blockId" UNINDEXED,
    "title" UNINDEXED,
    "text",
    tokenize = "porter unicode61 remove_diacritics 2"
);

-- ----- Page triggers -----

-- New page → index its title (blockId '' distinguishes page rows from block rows).
CREATE TRIGGER "SearchIndex_page_ai" AFTER INSERT ON "Page" BEGIN
    INSERT INTO "SearchIndex"("kind", "pageId", "blockId", "title", "text")
    VALUES ('page', NEW."id", '', NEW."title", NEW."title");
END;

-- Renamed page → refresh the page row's indexed text AND the cached title on
-- every block row of that page so search-result cards show the current title.
CREATE TRIGGER "SearchIndex_page_au" AFTER UPDATE OF "title" ON "Page" BEGIN
    UPDATE "SearchIndex" SET "title" = NEW."title", "text" = NEW."title"
        WHERE "kind" = 'page' AND "pageId" = NEW."id";
    UPDATE "SearchIndex" SET "title" = NEW."title"
        WHERE "kind" = 'block' AND "pageId" = NEW."id";
END;

-- Deleted page → drop every index row keyed to it (page row + all its blocks).
-- Fires per-cascade-row, so a subtree delete cleans up its descendants too.
CREATE TRIGGER "SearchIndex_page_ad" AFTER DELETE ON "Page" BEGIN
    DELETE FROM "SearchIndex" WHERE "pageId" = OLD."id";
END;

-- ----- Block triggers -----

-- New block → index its content, caching the containing page's title for display.
CREATE TRIGGER "SearchIndex_block_ai" AFTER INSERT ON "Block" BEGIN
    INSERT INTO "SearchIndex"("kind", "pageId", "blockId", "title", "text")
    SELECT 'block', NEW."pageId", NEW."id",
           (SELECT "title" FROM "Page" WHERE "id" = NEW."pageId"),
           COALESCE(NEW."content", '');
END;

-- Edited block content → refresh the indexed text. UPDATE OF makes this a no-op
-- for other block PATCHes (order, headingLevel).
CREATE TRIGGER "SearchIndex_block_au" AFTER UPDATE OF "content" ON "Block" BEGIN
    UPDATE "SearchIndex" SET "text" = COALESCE(NEW."content", '')
        WHERE "kind" = 'block' AND "blockId" = NEW."id";
END;

-- Deleted block → drop just its row.
CREATE TRIGGER "SearchIndex_block_ad" AFTER DELETE ON "Block" BEGIN
    DELETE FROM "SearchIndex" WHERE "kind" = 'block' AND "blockId" = OLD."id";
END;

-- ----- Backfill for pre-existing rows -----
INSERT INTO "SearchIndex"("kind", "pageId", "blockId", "title", "text")
SELECT 'page', "id", '', "title", "title" FROM "Page";

INSERT INTO "SearchIndex"("kind", "pageId", "blockId", "title", "text")
SELECT 'block', b."pageId", b."id", p."title", COALESCE(b."content", '')
FROM "Block" b
JOIN "Page" p ON p."id" = b."pageId";
