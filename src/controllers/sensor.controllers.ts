import { Request, Response } from "express";
import prismaDB from "../prisma/prismaDB";
import z, { success } from "zod";
import { Device } from "../generated/prisma/client";

const deviceIdScheme = z.string().min(5).max(191);

let sensorCache = new Map<String, Device>();

const sendValue = async (req: Request, res: Response) => {
  try{
    let deviceId = deviceIdScheme.parse(req.params.deviceid);

    let cacheSearch: Device | undefined = sensorCache.get(deviceId);
    if(!cacheSearch){
      let resReq = await prismaDB.device.findUnique({where: {id: deviceId}});
      if(!resReq) return res.status(404).json({success: false, error: "Please register"});
      cacheSearch = resReq;
    }
    
  }catch(error){
    return res.status(500).json({success: false, error})
  }
}


export default {sendValue};