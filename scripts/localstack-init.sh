#!/bin/bash
set -e

echo "==> Creating DynamoDB tables..."
awslocal dynamodb create-table \
  --table-name report_jobs \
  --attribute-definitions \
    AttributeName=jobId,AttributeType=S \
    AttributeName=dedupHash,AttributeType=S \
  --key-schema AttributeName=jobId,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"dedupHash-index","KeySchema":[{"AttributeName":"dedupHash","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"},"ProvisionedThroughput":{"ReadCapacityUnits":1,"WriteCapacityUnits":1}}]' \
  --billing-mode PAY_PER_REQUEST

awslocal dynamodb create-table \
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
  awslocal sqs create-queue --queue-name report-${fmt}-dlq
  awslocal sqs create-queue --queue-name report-${fmt}-queue
done

echo "==> Creating S3 buckets..."
awslocal s3 mb s3://report-service-templates-local
awslocal s3 mb s3://report-service-outputs-local

echo "==> LocalStack init complete"
