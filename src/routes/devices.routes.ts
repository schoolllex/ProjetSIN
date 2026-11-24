import { Router } from "express";
import devicesControllers from "../controllers/devices.controllers";

const router = Router();

router.get("/", devicesControllers.getDevices);
router.post("/", devicesControllers.createDevices);
router.post("/register", devicesControllers.registerDevice);
router.delete("/:id", devicesControllers.deleteDevice);

export default router;
