import { Router } from "express";
import devicesControllers from "../controllers/devices.controllers";
import fanControllers from "../controllers/fan.controllers";

const router = Router();

router.get("/", devicesControllers.getDevices);
router.post("/", devicesControllers.createDevices);
router.post("/register", devicesControllers.registerDevice);
router.patch("/fans/settings", fanControllers.setFanGroup);
router.get("/:deviceid/fan", fanControllers.getFan);
router.post("/:deviceid/fan", fanControllers.addFan);
router.patch("/:deviceid/fan", fanControllers.setFan);
router.get("/:deviceid/fan/thresholds", fanControllers.getThresholds);
router.patch("/:deviceid/fan/thresholds", fanControllers.setThresholds);
router.post("/:deviceid/fan/state", fanControllers.reportFan);
router.delete("/:id", devicesControllers.deleteDevice);

export default router;
