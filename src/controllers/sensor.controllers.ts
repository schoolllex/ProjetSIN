import { Request, Response } from "express";
import prismaDB from "../prisma/prismaDB";
import { getApiKeyHash } from "../utils/apiKey";
import z from "zod";

const deviceIdScheme = z.string().min(5).max(191);
const temperatureScheme = z.object({value: z.number()});
const cameraScheme = z.object({personCount: z.number().int().min(0).max(2147483647)});
const radarScheme = z.object({distance: z.number().min(0)});

const sendValue = async (req: Request, res: Response) => {
  const deviceId = deviceIdScheme.parse(req.params.deviceid);
  const apiKeyHash = getApiKeyHash(req);

  if(!apiKeyHash) return res.status(401).json({success: false, error: "Invalid API key"});


  const where = {id: deviceId, apiKeyHash};
  const device = await prismaDB.device.findUnique({
    where,
    select: {
      identifier: true, 
      name: true, 
      firmware: true
    }
  });

  if(!device) return res.status(401).json({success: false, error: "Invalid API key"});

  const recordedAt = new Date();
  const onlineUpdate = {
    where,
    data: {status: "ONLINE" as const, lastSeen: recordedAt},
    select: {id: true}
  };


  if(device.firmware === "TEMPERATURE"){
    const {value} = temperatureScheme.parse(req.body);

    const reading = await prismaDB.$transaction(async (transaction) => {
      await transaction.device.update(onlineUpdate);

      const sensor = await transaction.temperatureSensor.update({
        where: {
          deviceId_identifier: {
            deviceId, 
            identifier: device.identifier
          }
        },
        data: {
          lastValue: value, 
          lastReadAt: recordedAt
        },
        select: {
          id: true
        }
      });

      return transaction.temperatureReading.create({
        data: {
          sensorId: sensor.id, 
          value, 
          recordedAt
        }
      });
    });

    return res.status(201).json({success: true, reading});
  }

  if(device.firmware === "CAMERA"){
    const { personCount} = cameraScheme.parse(req.body);

    const reading = await prismaDB.$transaction(async (transaction) => {
      await transaction.device.update(onlineUpdate);

      const camera = await transaction.camera.upsert({
        where: {
          identifier: device.identifier
        },
        create: {
          name: device.name, 
          identifier: device.identifier, 
          deviceId, 
          lastSeen: recordedAt
        },
        update: {
          deviceId, 
          lastSeen: recordedAt
        }
      });
      
      return transaction.personDetection.create({
        data: {
          cameraId: camera.id, 
          personCount, 
          recordedAt
        }
      });
    });

    return res.status(201).json({success: true, reading});
  }

  if(device.firmware === "RADAR"){
    const {distance} = radarScheme.parse(req.body);
    const [, reading] = await prismaDB.$transaction([
      prismaDB.device.update(onlineUpdate),
      prismaDB.radarReading.create({data: {deviceId, distance, recordedAt}})
    ]);

    return res.status(201).json({success: true, reading});
  }

  return res.status(409).json({success: false, error: "Unsupported device type"});
}

export default {sendValue};
