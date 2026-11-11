# DynamoDB tables
Create these tables in the same AWS region configured in backend/.env 

## 1. VirtualClassroomStudents
- Partition key: `cardId` (String)
- No sort key required.

## 2. VirtualClassroomAccessLogs
- Partition key: `logId` (String)
- No sort key required.

The backend uses the AWS SDK v3 Document Client. The IAM identity used by the backend needs `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem`, and `dynamodb:Scan` on both table ARNs. Use least-privilege permissions. For a demo, scans are used to list students/logs and calculate counts; a production system should use queryable indexes and pagination.
