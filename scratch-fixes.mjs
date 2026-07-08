import { chromium } from "playwright";

const OUT = "/tmp/claude-0/-home-user-Nest/13f8e3d2-3ee1-5d24-a549-b05b0897371b/scratchpad";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("[console.error] " + m.text()); });

async function newPage() {
  await page.locator("aside").getByRole("button", { name: "New page" }).click();
  await page.waitForFunction(() => location.pathname.startsWith("/pages/"));
  await page.locator('main [role="textbox"]').first().waitFor();
  await page.waitForTimeout(500);
}

const log = {};
try {
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.locator("aside").getByText("Welcome").first().waitFor({ timeout: 10000 });

  // ---------- 1) Fresh page: default block, Turn into DB visible ----------
  await newPage();
  log.defaultBlockOnFresh = (await page.locator('main [role="textbox"]').count()) === 1;
  log.turnIntoDbShownEmpty = await page.getByText("Turn into database").isVisible().catch(() => false);

  // ---------- 2) Enter creates new block ----------
  const ed1 = page.locator('main [role="textbox"]').first();
  await ed1.click();
  await ed1.type("hello");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  log.enterCreatesNewBlock = (await page.locator('main [role="textbox"]').count()) === 2;
  const activeId = await page.evaluate(() => document.activeElement?.id ?? "");
  log.newBlockFocused = activeId.startsWith("block-field-");
  // Blur so parent state catches up (typing only commits on blur)
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(900);
  log.turnIntoDbHiddenWithContent = !(await page.getByText("Turn into database").isVisible().catch(() => false));

  // ---------- 3) Slash /h1 clears text on convert ----------
  await newPage();
  const ed2 = page.locator('main [role="textbox"]').first();
  await ed2.click();
  await ed2.type("/h1");
  await page.waitForTimeout(400);
  const menuVisible = await page.locator('button:has-text("Heading 1")').isVisible().catch(() => false);
  log.slashMenuShows = menuVisible;
  await page.locator('button:has-text("Heading 1")').first().click();
  await page.waitForTimeout(500);
  const editorText = await page.locator('main [role="textbox"]').first().textContent();
  log.slashH1ClearsText = (editorText ?? "").trim() === "";
  log.slashH1ConvertsToHeading =
    (await page.locator('main [role="textbox"].text-2xl').count()) >= 1;

  // ---------- 4) Slash /bul + Enter picks bulleted ----------
  await newPage();
  const ed3 = page.locator('main [role="textbox"]').first();
  await ed3.click();
  await ed3.type("/bul");
  await page.waitForTimeout(400);
  // Enter should pick the top match (Bulleted list)
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const bulletMarker = await page.locator('main').getByText("•", { exact: true }).count();
  log.slashBulEnterPicksBulleted = bulletMarker >= 1;
  const bulEditor = page.locator('main [role="textbox"]').first();
  const bulText = await bulEditor.textContent();
  log.slashBulClearsText = (bulText ?? "").trim() === "";

  // ---------- 5) /num + Enter picks numbered ----------
  await newPage();
  const ed4 = page.locator('main [role="textbox"]').first();
  await ed4.click();
  await ed4.type("/num");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const numMarker = await page.locator('main').getByText(/^1\./).count();
  log.slashNumEnterPicksNumbered = numMarker >= 1;

  // ---------- 6) Toolbar: mouseup timing + button applies mark ----------
  await newPage();
  const ed5 = page.locator('main [role="textbox"]').first();
  await ed5.click();
  await ed5.type("hello world");
  await page.waitForTimeout(200);

  // Toolbar should NOT be visible while just typing
  const preSelToolbar = await page.getByRole("button", { name: "Bold" }).isVisible().catch(() => false);
  log.toolbarHiddenBeforeSelection = !preSelToolbar;

  // Simulate a mouse-based selection: mousedown → move → mouseup on the text
  await page.evaluate(() => {
    const el = document.querySelectorAll('main [role="textbox"]')[0];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    if (!text) return;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // Fire a real mouseup to trigger our new toolbar timing
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.waitForTimeout(400);
  log.toolbarShowsAfterMouseup = await page.getByRole("button", { name: "Bold" }).isVisible().catch(() => false);
  await page.screenshot({ path: `${OUT}/fix-toolbar.png` });
  await page.getByRole("button", { name: "Bold" }).click();
  await page.waitForTimeout(500);
  const bold = await page.locator('main [role="textbox"] [data-bold="1"]').count();
  log.toolbarBoldApplies = bold >= 1;

  // ---------- 7) Gutter + button per row ----------
  await newPage();
  const before = await page.locator('main [role="textbox"]').count();
  await page.locator('main .group').first().hover();
  await page.waitForTimeout(300);
  const addBtn = page.locator('button[title="Add block below"]').first();
  log.gutterAddVisibleOnHover = await addBtn.isVisible().catch(() => false);
  await addBtn.click();
  await page.getByRole("menu").waitFor({ timeout: 3000 });
  await page.getByRole("menuitem", { name: "Text", exact: true }).click();
  await page.waitForTimeout(400);
  const after = await page.locator('main [role="textbox"]').count();
  log.gutterInsertsBlockAfter = after === before + 1;

  // ---------- 8) Bottom "Add block" removed ----------
  log.bottomAddBlockGone = !(await page.getByText("Add block", { exact: true }).isVisible().catch(() => false));
} catch (e) {
  await page.screenshot({ path: `${OUT}/fix-FAIL.png` });
  console.log("FAILED:", e.message.split("\n")[0]);
}

console.log(JSON.stringify({ log, errors }, null, 2));
await browser.close();
