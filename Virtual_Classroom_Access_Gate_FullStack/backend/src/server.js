import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const mode = (process.env.DATABASE_MODE || "local").toLowerCase();
const region = process.env.AWS_REGION || "ap-south-1";
const studentsTable = process.env.DYNAMODB_STUDENTS_TABLE || "VirtualClassroomStudents";
const logsTable = process.env.DYNAMODB_LOGS_TABLE || "VirtualClassroomAccessLogs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const frontendDir = path.join(root, "frontend");
const dataFile = path.join(root, "backend", "data.json");

let docClient;
if (mode === "dynamodb") {
  const client = new DynamoDBClient({ region }); // Uses AWS credential chain; never put keys in source code.
  docClient = DynamoDBDocumentClient.from(client);
}
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(frontendDir));
const clean = v => String(v ?? "").trim();

// Local JSON mode is provided for testing without AWS. DynamoDB mode uses the AWS SDK.
const initialData = { students: [
  { name: "Vyshnavi", roll: "22CS101", cardId: "1001" },
  { name: "Nandini", roll: "22CS102", cardId: "1002" },
  { name: "Srujana", roll: "22CS103", cardId: "1003" }
], logs: [] };
async function readLocal() {
  try { return JSON.parse(await fs.readFile(dataFile, "utf8")); }
  catch (e) { if (e.code !== "ENOENT") throw e; await writeLocal(initialData); return structuredClone(initialData); }
}
async function writeLocal(data) { await fs.mkdir(path.dirname(dataFile), { recursive: true }); await fs.writeFile(dataFile, JSON.stringify(data, null, 2)); }
async function listStudents() {
  if (mode === "dynamodb") { const r = await docClient.send(new ScanCommand({ TableName: studentsTable })); return r.Items || []; }
  return (await readLocal()).students || [];
}
async function listLogs(limit = 50) {
  if (mode === "dynamodb") { const r = await docClient.send(new ScanCommand({ TableName: logsTable })); return (r.Items || []).sort((a,b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit); }
  return (await readLocal()).logs.slice(0, limit);
}
async function findStudent(cardId) {
  if (mode === "dynamodb") { const r = await docClient.send(new GetCommand({ TableName: studentsTable, Key: { cardId } })); return r.Item || null; }
  return (await readLocal()).students.find(s => s.cardId.toLowerCase() === cardId.toLowerCase()) || null;
}
async function saveStudent(student) {
  if (mode === "dynamodb") return docClient.send(new PutCommand({ TableName: studentsTable, Item: student, ConditionExpression: "attribute_not_exists(cardId)" }));
  const data = await readLocal();
  if (data.students.some(s => s.cardId.toLowerCase() === student.cardId.toLowerCase())) throw Object.assign(new Error("RFID card ID already registered."), { status: 409 });
  if (data.students.some(s => s.roll.toLowerCase() === student.roll.toLowerCase())) throw Object.assign(new Error("Roll number already registered."), { status: 409 });
  data.students.push(student); await writeLocal(data);
}
async function removeStudent(cardId) {
  if (mode === "dynamodb") { await docClient.send(new DeleteCommand({ TableName: studentsTable, Key: { cardId } })); return; }
  const data = await readLocal(); const before = data.students.length; data.students = data.students.filter(s => s.cardId !== cardId);
  if (before === data.students.length) throw Object.assign(new Error("Student not found."), { status: 404 });
  await writeLocal(data);
}
async function saveLog(log) {
  if (mode === "dynamodb") return docClient.send(new PutCommand({ TableName: logsTable, Item: log }));
  const data = await readLocal(); data.logs.unshift(log); await writeLocal(data);
}

app.get("/api/health", async (_req, res) => {
  try {
    if (mode === "dynamodb") {
      // Verify that configured tables are reachable.
      await docClient.send(new ScanCommand({ TableName: studentsTable, Limit: 1 }));
      res.json({ ok: true, service: "virtual-classroom-access-gate-api", database: "dynamodb", region, studentsTable, logsTable });
    } else res.json({ ok: true, service: "virtual-classroom-access-gate-api", database: "local-json" });
  } catch (e) { res.status(503).json({ ok: false, database: "dynamodb", error: e.message }); }
});
app.get("/api/students", async (_req,res) => { try { res.json(await listStudents()); } catch(e) { res.status(500).json({error:e.message}); } });
app.post("/api/students", async (req,res) => {
  const name=clean(req.body?.name), roll=clean(req.body?.roll), cardId=clean(req.body?.cardId);
  if (!name || !roll || !cardId) return res.status(400).json({error:"Name, roll number and RFID card ID are required."});
  try {
    if (mode === "dynamodb") {
      const existing = await findStudent(cardId);
      if (existing) return res.status(409).json({error:"RFID card ID already registered."});
      const all = await listStudents(); if (all.some(s => String(s.roll).toLowerCase() === roll.toLowerCase())) return res.status(409).json({error:"Roll number already registered."});
    }
    const student={name,roll,cardId,createdAt:new Date().toISOString()}; await saveStudent(student); res.status(201).json(student);
  } catch(e) { res.status(e.status || (e.name === "ConditionalCheckFailedException" ? 409 : 500)).json({error:e.message || "Student registration failed."}); }
});
app.delete("/api/students/:cardId", async (req,res) => { try { const id=clean(req.params.cardId); const found=await findStudent(id); if(!found) return res.status(404).json({error:"Student not found."}); await removeStudent(id); res.json({ok:true}); } catch(e) { res.status(500).json({error:e.message}); } });
app.post("/api/scan", async (req,res) => {
  const cardId=clean(req.body?.cardId), deviceId=clean(req.body?.deviceId)||"dashboard-test";
  if(!cardId) return res.status(400).json({error:"RFID card ID is required."});
  try { const student=await findStudent(cardId); const allowed=Boolean(student); const log={logId:randomUUID(),cardId,deviceId,studentName:student?.name||"Unknown Student",roll:student?.roll||null,result:allowed?"Granted":"Denied",timestamp:new Date().toISOString()}; await saveLog(log); res.json({allowed,message:allowed?"ACCESS GRANTED":"ACCESS DENIED",student,log}); }
  catch(e) { res.status(500).json({error:e.message || "RFID scan failed."}); }
});
app.get("/api/logs", async (req,res) => { try { res.json(await listLogs(Math.min(Number(req.query.limit)||50,200))); } catch(e) { res.status(500).json({error:e.message}); } });
app.get("/api/stats", async (_req,res) => { try { const [students,logs]=await Promise.all([listStudents(),listLogs(10000)]); res.json({registeredStudents:students.length,totalScans:logs.length,granted:logs.filter(x=>x.result==="Granted").length,denied:logs.filter(x=>x.result==="Denied").length}); } catch(e) { res.status(500).json({error:e.message}); } });
app.get("/", (_req,res) => res.sendFile(path.join(frontendDir,"index.html")));
app.listen(port, () => console.log(`Local API running at http://localhost:${port} (database: ${mode})`));
