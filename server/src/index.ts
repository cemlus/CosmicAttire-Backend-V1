import express from "express";
import fs from "fs";
import path from "path";
import routes from "./routes.js";
import espRouter from "./esp/routes.js";
import { env } from "./config.js";
import cors from 'cors';

export const app = express();
app.use(cors());
const frontendDir = [
  path.resolve(process.cwd(), "../frontend"),
  path.resolve(process.cwd(), "frontend"),
].find((dir) => fs.existsSync(dir));

app.use(express.json());
app.use(express.text({ type: "*/*" }));

if (frontendDir) {
  app.use(express.static(frontendDir));

  app.get("/profile/:encryptedId", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });

  app.get("/verification-1/:encryptedId", (_req, res) => {
    res.sendFile(path.join(frontendDir, "verification.html"));
  });

} else {
  console.warn("⚠️ Frontend directory not found; browser prototype routes are disabled.");
}

app.use("/api", routes);
app.use("/api/esp", espRouter);

const PORT = env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}