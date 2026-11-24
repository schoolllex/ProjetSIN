import { Router } from "express";
import devicesControllers from "../controllers/devices.controllers";
import fanControllers from "../controllers/fan.controllers";

const router = Router();

router.get("/", devicesControllers.getDevices);
router.post("/", devicesControllers.createDevices);
router.post("/register", devicesControllers.registerDevice);
router.get("/:deviceid/fan", fanControllers.getFan);
router.patch("/:deviceid/fan", fanControllers.setFan);
router.post("/:deviceid/fan/state", fanControllers.reportFan);
router.delete("/:id", devicesControllers.deleteDevice);

export default router;
