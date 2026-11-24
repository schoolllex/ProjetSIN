import express, { ErrorRequestHandler } from "express";
import { join } from "node:path";
import z from "zod";
import { Prisma } from "./generated/prisma/client";
import devicesRoutes from "./routes/devices.routes";
import sensorRoutes from "./routes/sensor.routes";

const app = express();

app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(join(__dirname, "../public")));
app.use("/devices", devicesRoutes);
app.use("/sensor", sensorRoutes);

app.use((req, res) => {
  return res.status(404).json({success: false, error: "Not found"});
});

const handleError: ErrorRequestHandler = (error, req, res, next) => {
  if(res.headersSent) return next(error);

  if(error instanceof z.ZodError){
    return res.status(400).json({success: false, error: "Invalid request", issues: error.issues});
  }

  if(error instanceof Prisma.PrismaClientKnownRequestError){
    if(error.code === "P2002") return res.status(409).json({success: false, error: "Already exists"});
    if(error.code === "P2025") return res.status(404).json({success: false, error: "Not found"});
  }

  if(error.type === "entity.parse.failed"){
    return res.status(400).json({success: false, error: "Invalid JSON"});
  }

  if(error.type === "entity.too.large"){
    return res.status(413).json({success: false, error: "Request body too large"});
  }

  console.error(error);
  return res.status(500).json({success: false, error: "Internal server error"});
}

app.use(handleError);

if(require.main === module){
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}

export default app;
