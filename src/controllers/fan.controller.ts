import { Request, Response } from "express";

const getFanStatus = async (req: Request, res: Response) => {
    try{
        
    }catch(error){
        console.error(error);
        return {success: false, error}
    }
}


export default {getFanStatus};