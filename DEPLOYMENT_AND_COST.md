# Deployment & Cost Optimization Strategy

## Deployment Strategy

For a production-grade deployment of the Vehicle Media Pipeline, follow this architecture:

1. **Frontend & API Gateway (Nginx):**
   - Use Nginx as a reverse proxy to serve the static frontend assets from the `public` directory and route `/api/*` traffic to the Node.js backend.
   - Nginx handles SSL termination and provides an additional layer of security.

2. **Backend Server (Node.js + PM2):**
   - Run the Node.js application using **PM2** to ensure it stays alive and can utilize multiple CPU cores (Cluster Mode).
   - The queue concurrency is currently handled in-memory. For a distributed system, consider replacing `InMemoryQueue` with **Redis + BullMQ**.

3. **Database (MongoDB Atlas):**
   - Offload database management to MongoDB Atlas. Use a replica set for high availability.

## Cost Optimization Thinking

To minimize costs, especially if running a high-volume media pipeline:

1. **Storage Tiering:**
   - **Current:** Images are stored on the local disk (`uploads/`), which fills up fast and costs a lot on block storage (e.g., AWS EBS).
   - **Optimization:** Upload directly to **AWS S3** or **Cloudflare R2** (cheaper egress). Implement lifecycle policies to delete images after 7 days if they aren't needed for retraining models.

2. **Serverless Compute for OCR (Tesseract):**
   - Running Tesseract on an always-on VPS can be expensive due to the CPU requirements.
   - **Optimization:** Offload the OCR and Image Processing (Sharp) to serverless functions (like AWS Lambda). You only pay for compute time used during processing.

3. **Database Caching:**
   - The `/analytics` endpoint queries the entire database. As data grows, this becomes slow and expensive in DB I/O.
   - **Optimization:** Implement caching for analytics (update stats incrementally on upload/process instead of counting all documents every time).

4. **Rate Limiting (Implemented):**
   - Rate limiting is already implemented via `express-rate-limit` to prevent abuse and save costs from malicious spam traffic.
