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
      name: "Ventilateur" 
    },
    update: {}
  });
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
    data: settings.mode === "MANUAL"
      ? { mode: "MANUAL", desiredState: settings.on }
      : { mode: "AUTO" }
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

export default { getFan, setFan, reportFan };
