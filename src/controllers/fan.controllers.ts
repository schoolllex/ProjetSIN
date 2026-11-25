import { Request, Response } from "express";
import z from "zod";
import prismaDB from "../prisma/prismaDB";
import { getApiKeyHash } from "../utils/apiKey";

export const FAN_IDENTIFIER = "fan";

const deviceIdSchema = z.string().min(5).max(191);

const settingsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("AUTO") }),
  z.object({ mode: z.literal("MANUAL"), on: z.boolean() })
]);

const stateSchema = z.object({ on: z.boolean() });

const groupSchema = z.object({
  deviceIds: z.array(deviceIdSchema).min(1),
  settings: settingsSchema
});

function fanSettings(settings: z.infer<typeof settingsSchema>) {
  return settings.mode === "MANUAL"
    ? { mode: settings.mode, desiredState: settings.on }
    : { mode: settings.mode };
}

const thresholdsSchema = z.object({
  startThreshold: z.number(),
  stopThreshold: z.number()
}).refine(({ startThreshold, stopThreshold }) => stopThreshold < startThreshold, {
  message: "Le seuil d'arrêt doit être inférieur au seuil de démarrage.",
  path: ["stopThreshold"]
});

const thresholdFields = {
  startThreshold: true,
  stopThreshold: true
} as const;

function saveFan(deviceId: string, thresholds?: z.infer<typeof thresholdsSchema>) {
  return prismaDB.fan.upsert({
    where: {
      deviceId_identifier: {
        deviceId,
        identifier: FAN_IDENTIFIER
      }
    },
    create: {
      deviceId,
      identifier: FAN_IDENTIFIER,
      name: "Ventilateur",
      ...thresholds
    },
    update: thresholds ?? {}
  });
}

async function findFan(req: Request) {
  const deviceId = deviceIdSchema.parse(req.params.deviceid);
  const apiKeyHash = getApiKeyHash(req);
  if (!apiKeyHash) return;

  const device = await prismaDB.device.findUnique({
    where: { 
      id: deviceId, 
      apiKeyHash, 
      firmware: "TEMPERATURE" 
    },
    select: { 
      id: true 
    }
  });
  if (!device) return;

  return saveFan(deviceId);
}

async function findTemperatureDevice(req: Request) {
  const deviceId = deviceIdSchema.parse(req.params.deviceid);

  return prismaDB.device.findUnique({
    where: { id: deviceId, firmware: "TEMPERATURE" },
    select: { id: true }
  });
}

async function getThresholds(req: Request, res: Response) {
  const device = await findTemperatureDevice(req);
  if (!device) return res.status(404).json({ error: "Capteur de température introuvable." });

  const fan = await prismaDB.fan.findUnique({
    where: { deviceId_identifier: { deviceId: device.id, identifier: FAN_IDENTIFIER } },
    select: thresholdFields
  });
  const { startThreshold, stopThreshold } = fan ?? await saveFan(device.id);

  return res.json({ startThreshold, stopThreshold });
}

async function setThresholds(req: Request, res: Response) {
  const thresholds = thresholdsSchema.parse(req.body);
  const device = await findTemperatureDevice(req);
  if (!device) return res.status(404).json({ error: "Capteur de température introuvable." });

  const { startThreshold, stopThreshold } = await saveFan(device.id, thresholds);

  return res.json({ startThreshold, stopThreshold });
}

async function addFan(req: Request, res: Response) {
  const device = await findTemperatureDevice(req);
  if (!device) return res.status(404).json({ error: "Capteur de température introuvable." });

  await saveFan(device.id);
  return res.json({ success: true });
}

async function setFanGroup(req: Request, res: Response) {
  const { deviceIds, settings } = groupSchema.parse(req.body);
  const ids = [...new Set(deviceIds)];

  const updated = await prismaDB.fan.updateMany({
    where: {
      identifier: FAN_IDENTIFIER,
      deviceId: { in: ids },
      device: { firmware: "TEMPERATURE" }
    },
    data: fanSettings(settings)
  });

  return res.json({ updated: updated.count, requested: ids.length });
}

async function getFan(req: Request, res: Response) {
  const fan = await findFan(req);

  if (!fan) return res.status(401).json({ error: "Invalid API key or device" });

  return res.json({ fan });
}

async function setFan(req: Request, res: Response) {
  const settings = settingsSchema.parse(req.body);
  const fan = await findFan(req);
  if (!fan) return res.status(401).json({ error: "Invalid API key or device" });

  const updated = await prismaDB.fan.update({
    where: { 
      id: fan.id 
    },
    data: fanSettings(settings)
  });
  return res.json({ fan: updated });
}

async function reportFan(req: Request, res: Response) {
  const { on } = stateSchema.parse(req.body);

  const fan = await findFan(req);
  if (!fan) return res.status(401).json({ error: "Invalid API key or device" });

  const now = new Date();

  const updated = await prismaDB.$transaction(async (transaction) => {
    const changed = await transaction.fan.updateMany({
      where: { 
        id: fan.id, 
        OR: [{ 
          actualState: { not: on } 
        }, { 
          lastUpdate: null 
        }] },
      data: { 
        actualState: on, 
        lastUpdate: now 
      }
    });
    const current = await transaction.fan.findUniqueOrThrow({ where: { id: fan.id } });

    if (changed.count) {
      await transaction.fanHistory.create({
        data: { 
          fanId: fan.id, 
          state: on, 
          mode: current.mode, 
          recordedAt: now 
        }
      });
    }
    return current;
  });
  return res.json({ fan: updated });
}

export default { getFan, setFan, reportFan, getThresholds, setThresholds, addFan, setFanGroup };
