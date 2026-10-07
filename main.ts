import cookieParser from "cookie-parser";
import express from "express";
import { join } from "node:path";
import { authRouter } from "@/general/api/routes/auth-routes";
import { keyRouter } from "@/general/api/routes/key-routes";
import { publicRouter } from "@/general/api/routes/public-routes";
import { settingsRouter } from "@/general/api/routes/settings-routes";
import { teamRouter } from "@/general/api/routes/team-routes";
import { userRouter } from "@/general/api/routes/user-routes";
import { prisma } from "@/general/api/services/database";
import { formsRouter } from "@/forms/api/routes/form-routes";
import { publicFormsRouter } from "@/forms/api/routes/public-form-routes";
import { notesRouter } from "@/notes/api/routes/note-routes";
import { schedulerRouter } from "@/scheduler/api/routes/scheduler-routes";
import { publicSchedulerRouter } from "@/scheduler/api/routes/public-scheduler-routes";
import { mailerRouter } from "@/mailer/api/routes/mailer-routes";
import { publicMailerRouter } from "@/mailer/api/routes/public-mailer-routes";
import { crmRouter } from "@/crm/api/routes/crm-routes";
import { tasksRouter } from "@/tasks/api/routes/task-routes";
import { publicTasksRouter } from "@/tasks/api/routes/public-task-routes";
import { documentsRouter } from "@/documents/api/routes/document-routes";
import { publicDocumentsRouter } from "@/documents/api/routes/public-document-routes";
import { cmsRouter } from "@/cms/api/routes/cms-routes";
import { publicCmsRouter } from "@/cms/api/routes/public-cms-routes";

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.disable("x-powered-by");
app.use("/api/notes", express.json({ limit: "2mb" }));
app.use("/api/forms", express.json({ limit: "2mb" }));
app.use("/api/scheduler", express.json({ limit: "2mb" }));
app.use("/api/public/scheduler", express.json({ limit: "2mb" }));
app.use("/api/mailer", express.json({ limit: "2mb" }));
app.use("/api/crm", express.json({ limit: "1mb" }));
app.use("/api/tasks", express.json({ limit: "1mb" }));
app.use("/api/public/tasks", express.json({ limit: "1mb" }));
app.use("/api/documents", express.json({ limit: "1mb" }));
app.use("/api/public/documents", express.json({ limit: "1mb" }));
app.use("/api/cms", express.json({ limit: "2mb" }));
app.use("/api/public/cms", express.json({ limit: "1mb" }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/team", teamRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/keys", keyRouter);
app.use("/api/public", publicRouter);
app.use("/api/notes", notesRouter);
app.use("/api/forms", formsRouter);
app.use("/api/public/forms", publicFormsRouter);
app.use("/api/scheduler", schedulerRouter);
app.use("/api/public/scheduler", publicSchedulerRouter);
app.use("/api/mailer", mailerRouter);
app.use("/api/public/mailer", publicMailerRouter);
app.use("/api/crm", crmRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/public/tasks", publicTasksRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/public/documents", publicDocumentsRouter);
app.use("/api/cms", cmsRouter);
app.use("/api/public/cms", publicCmsRouter);

app.use(express.static(join(import.meta.dir, "public")));
app.use((request, response, next) => {
  if (request.method === "GET" && !request.path.startsWith("/api/")) {
    response.sendFile(join(import.meta.dir, "public", "index.html"), (error) => {
      if (error) next(error);
    });
    return;
  }
  next();
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "An unexpected server error occurred." });
});

const server = app.listen(port, () => {
  console.log(`Tuno is listening on http://localhost:${port}`);
});

let stopping = false;

const shutdown = () => {
  if (stopping) {
    process.exit(1);
  }
  stopping = true;

  const exit = () => {
    void prisma.$disconnect().finally(() => process.exit(0));
  };

  const forceExit = setTimeout(exit, 1_000);
  forceExit.unref();

  server.close(() => {
    clearTimeout(forceExit);
    exit();
  });
  server.closeAllConnections();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
