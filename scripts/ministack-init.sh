#!/bin/bash
set -e

echo "==> Creating DynamoDB tables..."
aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" dynamodb create-table \
  --table-name report_jobs \
  --attribute-definitions \
    AttributeName=jobId,AttributeType=S \
    AttributeName=dedupHash,AttributeType=S \
  --key-schema AttributeName=jobId,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"dedupHash-index","KeySchema":[{"AttributeName":"dedupHash","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"},"ProvisionedThroughput":{"ReadCapacityUnits":1,"WriteCapacityUnits":1}}]' \
  --billing-mode PAY_PER_REQUEST

aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" dynamodb create-table \
  --table-name report_templates \
  --attribute-definitions \
    AttributeName=templateId,AttributeType=S \
    AttributeName=version,AttributeType=S \
  --key-schema \
    AttributeName=templateId,KeyType=HASH \
    AttributeName=version,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

echo "==> Creating SQS queues..."
for fmt in pdf csv xlsx txt; do
  aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" sqs create-queue --queue-name report-${fmt}-dlq
  aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" sqs create-queue --queue-name report-${fmt}-queue
done

echo "==> Creating S3 buckets..."
aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" s3 mb s3://report-service-templates-local
aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" s3 mb s3://report-service-outputs-local

echo "==> Verifying SES identity..."
aws --endpoint-url "${AWS_ENDPOINT_URL:-http://localhost:4566}" ses verify-email-identity --email-address noreply@dev.local

echo "==> MiniStack init complete"
