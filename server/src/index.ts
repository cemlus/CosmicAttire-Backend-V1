import express from "express";
import routes from "./routes.js";
import espRouter from "./esp/routes.js";
import { env } from "./config.js";

export const app = express();

app.use(express.json());

app.use("/api", routes);
app.use("/api/esp", espRouter);

const PORT = env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

