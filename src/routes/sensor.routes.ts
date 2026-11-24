import { Router } from "express";
import sensorControllers from "../controllers/sensor.controllers";

const router = Router();

router.post("/:deviceid/send", sensorControllers.sendValue);

export default router;
