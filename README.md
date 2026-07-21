# Vehicle Media Pipeline

This is a backend system designed to accept uploaded vehicle images from the field, process them asynchronously, and detect potential issues like blurriness, low lighting, duplication, screenshots, and invalid number plate formats.

## Architecture

### Service Flow
1. **Upload API (`POST /upload`)**: Accepts a multipart form data upload containing an image file. It saves the file to the local disk (`./uploads`), generates a unique UUID, creates a document in MongoDB with `pending` status, and pushes the job to an in-memory queue. It returns the job ID immediately.
2. **Status API (`GET /status/:id`)**: Quickly retrieves the current processing status of the job (`pending`, `processing`, `completed`, `failed`).
3. **Results API (`GET /results/:id`)**: Retrieves the full analysis results, including any extracted issues and metadata about the image processing.

### Processing Flow
- The worker component listens to an asynchronous in-memory queue.
- When an image is picked up, its status changes to `processing`.
- **Heuristics/Analyzers**: The image is analyzed sequentially:
  - **Blur Detection**: Uses standard deviation approximation via `sharp` to detect blurred photos.
  - **Brightness Analysis**: Uses pixel intensity mean via `sharp` to find overly dark photos.
  - **Screenshot Detection**: Looks at the resolution metadata to match common screen resolutions (e.g. 1920x1080).
  - **Duplicate Detection**: Calculates a SHA-256 hash of the file buffer and queries MongoDB to check if a duplicate image hash exists.
  - **Number Plate Analysis / OCR**: Uses `tesseract.js` to extract text from the image, and uses regex mapping common Indian number plate formats.
- If processing is successful, the document is marked as `completed` with its associated issues. If an error occurs, it's marked as `failed` with the failure reason.

### Queue Strategy
- A custom **In-Memory Queue** (`InMemoryQueue` class) was implemented.
- **Why?**: The environment lacks Docker and possibly Redis, making a fully distributed message broker like BullMQ (which relies on Redis) hard to reliably run locally. An in-memory queue meets the requirement for asynchronous background processing while minimizing external dependencies.
- **Resilience**: To ensure resilience, the system hooks into the startup script to query MongoDB for any images that were left in the `pending` or `processing` state due to a potential application crash, and re-queues them.

### Major Design Decisions
- **Database**: MongoDB (with Mongoose) over `lowdb` to handle concurrency better and use actual schemas, making it production-ready.
- **Analyzers**: Relied on fast native libraries (`sharp`) and standalone pure JS ports (`tesseract.js`) so that no external binaries (like OpenCV C++) or cloud API keys (AWS Rekognition) were strictly necessary to demonstrate the capability.

## AI Usage Disclosure (Mandatory)
- **Where AI was used**: GitHub Copilot / Antigravity Agent was used to scaffold the boilerplate for Express, Mongoose schema setup, and the basic queue implementation.
- **What AI helped with**: Generating regex for the Indian number plate, generating `sharp` heuristic snippets for standard deviation, and rewriting the database bindings.
- **Where AI output was wrong**: AI initially suggested using BullMQ without checking if Docker/Redis was available locally, which would have failed the run instructions. AI also initially proposed overly complicated structural analysis using OpenCV which would cause local binding installation issues on Windows without Visual Studio tools.
- **How I validated AI-generated code**: The code was reviewed for dependency lock-in, and the OCR regex was manually reviewed. I verified that the queue implementation strictly executes sequentially to prevent race conditions in-memory, and manually verified `tesseract.js` was compatible with Windows.

## Trade-offs
- **Intentionally Simplified**: The OCR number plate regex is very naive. Real OCR on noisy backgrounds needs cropping or bounding box detection (like YOLO) before running Tesseract.
- **What I would improve with more time**: Use a real message broker like RabbitMQ or SQS. Add cloud storage (S3) instead of local disk for uploads to allow horizontal scaling.
- **Scalability concerns**: Using an in-memory queue means you cannot scale horizontally (run multiple Node.js instances). A distributed queue backed by Redis or SQS is needed for actual production scaling. The local file storage also breaks if multiple nodes exist.
- **Failure handling concerns**: If the process crashes mid-image processing, the status might be stuck in `processing`. The startup resume script handles this, but a dedicated dead-letter queue with a timeout mechanism would be better.

## Running Instructions

### Prerequisites
- Node.js installed (v18+ recommended)
- MongoDB running locally on default port (27017)

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server (runs on `http://localhost:3000`):
   ```bash
   npm run dev
   ```

### Sample API Requests

**1. Upload an Image:**
```bash
curl -X POST -F "image=@sample-images/vehicle.jpg" http://localhost:3000/upload
```
*Response:*
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "pending"
}
```

**2. Check Status:**
```bash
curl http://localhost:3000/status/123e4567-e89b-12d3-a456-426614174000
```
*Response:*
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing"
}
```

**3. Fetch Results:**
```bash
curl http://localhost:3000/results/123e4567-e89b-12d3-a456-426614174000
```
*Response:*
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "filename": "vehicle.jpg",
  "path": "uploads/123e4567...",
  "status": "completed",
  "issues": [
    {
      "type": "blurry",
      "severity": "high",
      "confidence": 0.8,
      "message": "Low edge contrast detected (possible blur)"
    }
  ],
  "hash": "..."
}
```
