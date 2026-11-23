import { Router } from "express";
import devicesControllers from "../controllers/devices.controllers";

const router = Router();

router.get("/", devicesControllers.getDevices);
router.post("/");
router.delete("/:id");

export default router;