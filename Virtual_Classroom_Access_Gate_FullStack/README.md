# Virtual Classroom Access Gate

RFID-based classroom access demo with a web dashboard, Node.js API, local JSON mode, and optional AWS DynamoDB mode.

## Run locally first
1. Install Node.js (LTS).
2. Open a terminal in the `backend` folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and leave `DATABASE_MODE=local` for local testing.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. Health check: `http://localhost:3000/api/health`.

Local mode stores data in `backend/data.json`.

## Enable DynamoDB (AWS setup required)
1. In AWS Console, select the same region as `AWS_REGION` (default `ap-south-1`).
2. Create the two tables exactly as described in `aws/dynamodb-tables.md`.
3. Configure an IAM user/role with the documented least-privilege DynamoDB permissions. Do not use root-account access keys.
4. On your own computer, configure AWS credentials using the AWS CLI (`aws configure`) or an attached IAM role. Never put access keys in source code, `.env`, screenshots, or chat.
5. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_MODE=dynamodb`.
6. Set `AWS_REGION`, `DYNAMODB_STUDENTS_TABLE`, and `DYNAMODB_LOGS_TABLE` to match your AWS setup.
7. Restart the backend with `npm start`.
8. Open `http://localhost:3000/api/health`. It should say `"database":"dynamodb"`. If it reports an error, check table names, region, IAM permissions, and local AWS credentials.

## Dashboard API
- `GET /api/health`
- `GET /api/students`
- `POST /api/students` with `{ "name", "roll", "cardId" }`
- `DELETE /api/students/:cardId`
- `POST /api/scan` with `{ "cardId", "deviceId" }`
- `GET /api/logs`
- `GET /api/stats`

The dashboard uses the same API in either local or DynamoDB mode. Existing local `data.json` records are not automatically copied to DynamoDB; register test students again after switching modes.

## Constraint checklist
- RFID tag simulates entry to a subnet: dashboard assigns a granted card a virtual IP in 10.20.30.0/24 and lists current members.
- Logs go to DynamoDB: backend `DATABASE_MODE=dynamodb`, or the Lambda in `lambda/` (table names now match the backend defaults).
- LED shows allowed/denied: green GPIO26 / red GPIO27 on the ESP32, mirrored by the on-screen gate LED.
- IoT rule SQL in `aws/iot-rule.sql` was fixed (it contained literal `\n` text and no timestamp source).
