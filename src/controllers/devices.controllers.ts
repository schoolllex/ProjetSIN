import { randomBytes } from "node:crypto";
import { Request, Response } from "express";
import prismaDB from "../prisma/prismaDB";
import { getApiKeyHash, hashApiKey } from "../utils/apiKey";
import z from "zod";
import { FAN_IDENTIFIER } from "./fan.controllers";

const registerScheme = z.object({
  name: z.string().trim().min(1).max(191),
  identifier: z.string().trim().min(1).max(191),
  ipAddress: z.union([z.ipv4(), z.ipv6()]).optional(),
  firmware: z.enum(["TEMPERATURE", "CAMERA", "RADAR"])
});

const createScheme = registerScheme.extend({
  status: z.enum(["ONLINE", "OFFLINE", "ERROR"]).default("OFFLINE")
});

const deviceIdScheme = z.string().min(5).max(191);

const getDevices = async (req: Request, res: Response) => {
  const [devices, settings] = await Promise.all([
    prismaDB.device.findMany({
      omit: {
        apiKeyHash: true
      },
      orderBy: {
        name: "asc"
      },
      include: {
        fans: {
          where: { identifier: FAN_IDENTIFIER },
          select: { mode: true, desiredState: true, actualState: true, lastUpdate: true }
        },
        sensors: {
          select: {
            lastValue: true, 
            lastReadAt: true
          }, orderBy: {
            lastReadAt: "desc"
          }, take: 1},
        camera: {
          select: {
            detections: {
              select: {
                personCount: true, 
                recordedAt: true
              }, orderBy: {
                recordedAt: "desc"
              }, take: 1
            }
          }
        },
        radarReadings: {
          select: {
            distance: true, 
            recordedAt: true
          }, orderBy: {
            recordedAt: "desc"
          }, take: 1
        }
      }
    }),
    prismaDB.systemSettings.findUnique({
      where: {
        id: 1
      }, 
      select: {
        offlineTimeout: true
      }
    })
  ]);
  const offlineTimeout = settings?.offlineTimeout ?? 15;

  return res.status(200).json({success: true, devices, offlineTimeout});
}

const createDevice = async (creation: z.infer<typeof createScheme>, lastSeen?: Date) => {
  const apiKey = randomBytes(32).toString("hex");
  const {name, identifier, firmware} = creation;

  const device = await prismaDB.device.create({
    data: {
      ...creation,
      lastSeen,
      apiKeyHash: hashApiKey(apiKey),
      sensors: firmware === "TEMPERATURE" ? {create: {name, identifier}} : undefined,
      camera: firmware === "CAMERA" ? {
        connectOrCreate: {
          where: {
            identifier
          }, create: {
            name,
            identifier
          }
        }
      } : undefined
    },
    omit: {
      apiKeyHash: true
    }
  });

  return {device, apiKey};
}

const createDevices = async (req: Request, res: Response) => {
  const creation = createScheme.parse(req.body);
  const result = await createDevice(creation);

  return res.status(201).json({success: true, ...result});
}

const registerDevice = async (req: Request, res: Response) => {
  const creation = registerScheme.parse(req.body);
  const lastSeen = new Date();

  if(!req.get("authorization")){
    const result = await createDevice({...creation, status: "ONLINE"}, lastSeen);
    return res.status(201).json({success: true, ...result});
  }

  const apiKeyHash = getApiKeyHash(req);

  const existing = apiKeyHash && await prismaDB.device.findUnique({
    where: {
      identifier: creation.identifier, 
      apiKeyHash
    },
    select: {
      firmware: true
    }
  });

  if(!existing) return res.status(401).json({success: false, error: "Invalid API key"});

  if(existing.firmware !== creation.firmware){
    return res.status(409).json({success: false, error: "Device type does not match"});
  }

  const device = await prismaDB.device.update({
    where: {
      identifier: creation.identifier, 
      apiKeyHash
    },
    data: {
      name: creation.name, 
      ipAddress: creation.ipAddress, 
      status: "ONLINE", 
      lastSeen
    },
    omit: {
      apiKeyHash: true
    }
  });

  return res.status(200).json({success: true, device});
}

const deleteDevice = async (req: Request, res: Response) => {
  const deviceId = deviceIdScheme.parse(req.params.id);

  await prismaDB.device.delete({
    where: {
      id: deviceId
    }
  });

  return res.status(200).json({success: true});
}

export default {getDevices, createDevices, registerDevice, deleteDevice};
