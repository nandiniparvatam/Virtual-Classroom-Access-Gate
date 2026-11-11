import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";
import { randomUUID } from "node:crypto";

const region=process.env.AWS_REGION||"ap-south-1";
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region}));
const studentsTable=process.env.STUDENTS_TABLE||"VirtualClassroomStudents";
const logsTable=process.env.LOGS_TABLE||"VirtualClassroomAccessLogs";
const prefix=process.env.RESPONSE_TOPIC_PREFIX||"classroom/access/response/";
const iot=new IoTDataPlaneClient({region,endpoint:process.env.IOT_DATA_ENDPOINT});

export const handler=async event=>{
  console.log("RFID event",JSON.stringify(event));
  const cardId=String(event?.cardId||"").trim();
  const deviceId=String(event?.deviceId||"classroom-gate-01").trim();
  if(!cardId) return {ok:false,error:"Missing cardId"};
  const found=await db.send(new GetCommand({TableName:studentsTable,Key:{cardId}}));
  const student=found.Item||null, allowed=Boolean(student), timestamp=new Date().toISOString();
  const log={logId:randomUUID(),cardId,deviceId,studentName:student?.name||"Unknown Student",roll:student?.roll||null,result:allowed?"Granted":"Denied",timestamp};
  await db.send(new PutCommand({TableName:logsTable,Item:log}));
  const response={cardId,deviceId,allowed,result:allowed?"GRANTED":"DENIED",studentName:student?.name||"Unknown Student",timestamp};
  await iot.send(new PublishCommand({topic:`${prefix}${deviceId}`,qos:1,payload:Buffer.from(JSON.stringify(response))}));
  return {ok:true,...response};
};
