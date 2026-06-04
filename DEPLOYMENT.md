# Deployment Guide

## Architecture

This sample demonstrates a single Node.js Express API being built locally, packaged into a Docker image, pushed to Amazon ECR, and deployed to two targets:

- AWS ECS for cloud deployment
- An office VM that runs Docker directly over SSH

The application serves the same image to both targets, which keeps runtime behavior consistent across environments.

## Local Setup

Install dependencies and run the app:

```bash
npm install
npm start
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/health`

## Docker Build and Run

Build the image:

```bash
docker build -t ecs-vm-demo .
```

Run the container:

```bash
docker run --rm -p 3000:3000 ecs-vm-demo
```

## GitHub Actions

The workflow in `.github/workflows/deploy.yml` triggers on pushes to `main`.

It performs two deployment paths after a build and validation step:

- AWS ECS deployment using GitHub Secrets for AWS authentication, ECR push, ECS task definition update, and ECS service deployment
- Office VM deployment over SSH using GitHub Secrets to pull the image, stop the old container, start a new one, and verify the service

## AWS ECS Requirements

Before the pipeline can deploy to ECS, you need:

- An ECR repository created in the target AWS account
- An ECS cluster and service already provisioned
- A task definition JSON file stored in the repository or referenced by the workflow
- The task definition configured with a container name that matches the secret value
- An IAM user or role that can push to ECR and update ECS resources

## Office VM Deployment

The Office VM deployment expects:

- Docker installed on the VM
- SSH access from GitHub Actions
- The VM to be able to pull the built image from the registry used in the workflow
- A predictable container name so the old container can be stopped before starting the new one

## Required GitHub Secrets

AWS:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `ECR_REPOSITORY`
- `ECS_CLUSTER`
- `ECS_SERVICE`
- `ECS_TASK_DEFINITION`
- `ECS_CONTAINER_NAME`

VM:

- `VM_HOST`
- `VM_USERNAME`
- `VM_SSH_KEY`

## Testing

Run the local validation command:

```bash
npm test
```

Then verify the HTTP responses:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
```