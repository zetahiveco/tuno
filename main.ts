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

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.disable("x-powered-by");
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
