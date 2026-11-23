import { Request, Response } from "express";
import prismaDB from "../prisma/prismaDB";
import z, { success } from "zod";

const createSheme = z.object({
  name: z.string().min(1).max(191),
  identifier: z.string().min(1).max(191),
  status: z.enum(["ONLINE", "OFFLINE", "ERROR"]),
  ipAddress: z.string().min(1).max(191),
  firmware: z.string().min(1).max(191)
});

const deviceIdScheme = z.string().min(5).max(191);

const getDevices = async (req: Request, res: Response) => {
  try{
    let devices = await prismaDB.device.findMany();
    return res.status(200).json({sucess: true, devices});
  }catch(error){
    console.error(error);
    return res.status(500).json({success: false, error});
  }
}

const createDevices = async(req: Request, res: Response) => {
  try{
    let creation = createSheme.parse(req.body);
    
    // SEND REQUEST TO DEVICE TO GET API KEY HASH

    // IF RECEIVED VALID KEY HASH --> PUT IN DB
  }catch(error){
    console.error(error);
    return res.status(500).json({success: false, error});
  }
}

const deleteDevice = async(req: Request, res: Response) => {
  try{
    let deviceId = deviceIdScheme.parse(req.body);
    let device = await prismaDB.device.findUnique({
      where: {
        id: deviceId
      }
    });

    if(!device) return res.status(404).json({success: false, error: "Not found"});
  
    await prismaDB.device.delete({
      where: {
        id: deviceId
      }
    });

    return res.status(200).json({success: true});
  }catch(error){
    console.error(error);
    return res.status(500).json({success: false, error});
  }
}

export default {getDevices, createDevices, deleteDevice}