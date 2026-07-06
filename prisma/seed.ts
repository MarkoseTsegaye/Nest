import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.page.count();
  if (existing > 0) {
    console.log("Database already has pages, skipping seed.");
    return;
  }

  const welcome = await prisma.page.create({
    data: {
      title: "Welcome",
      blocks: {
        create: [
          { type: "heading", headingLevel: 1, content: "Welcome to Nest", order: 0 },
          {
            type: "text",
            content: "This is a scoped-down Notion clone. Use the sidebar to create pages, and turn any page into a database.",
            order: 1,
          },
        ],
      },
    },
  });

  const tasksDb = await prisma.page.create({
    data: {
      title: "Tasks",
      parentId: welcome.id,
      isDatabase: true,
      properties: {
        create: [
          { name: "Status", type: "select", order: 0, selectOptions: JSON.stringify(["Todo", "In Progress", "Done"]) },
          { name: "Due", type: "date", order: 1 },
        ],
      },
    },
    include: { properties: true },
  });

  const status = tasksDb.properties.find((p) => p.name === "Status")!;

  await prisma.page.create({
    data: {
      title: "First task",
      parentId: tasksDb.id,
      propertyValues: {
        create: [{ propertyId: status.id, value: "Todo" }],
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
