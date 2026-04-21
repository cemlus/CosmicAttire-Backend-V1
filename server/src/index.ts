// server/server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import routes from "./routes.js";

const app = express();

app.use(express.json());

app.use("/api", routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
