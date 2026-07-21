import { ImageModel } from "./database"
import { Status } from "./types"
import * as analyzer from "./analyzers"
import { logger } from "./logger"

type Job = {
  id: string
  path: string
  attempts: number
}

const MAX_CONCURRENT_JOBS = 4;
const MAX_RETRIES = 3;

class InMemoryQueue {
  private queue: Job[] = []
  private activeJobs = 0

  async add(id: string, path: string, attempts = 0) {
    this.queue.push({ id, path, attempts })
    this.processNext()
  }

  private async processNext() {
    if (this.activeJobs >= MAX_CONCURRENT_JOBS || this.queue.length === 0) return

    this.activeJobs++
    const job = this.queue.shift()
    if (!job) {
      this.activeJobs--
      return
    }

    // Process asynchronously, do not await here so we can start more jobs
    this.processJob(job).finally(() => {
      this.activeJobs--
      this.processNext()
    })
    
    // Try starting more jobs if we have capacity
    this.processNext()
  }

  private async processJob(job: Job) {
    const { id, path, attempts } = job
    logger.info(`🔄 Processing image: ${id} (Attempt ${attempts + 1}/${MAX_RETRIES + 1})`)

    try {
      const image = await ImageModel.findOne({ imageId: id })
      if (!image) {
        logger.warn(`⚠️ Image not found for job ${id}`)
        return
      }

      image.status = "processing" as any
      await image.save()

      const hash = analyzer.getHash(path)

      const [blur, light, screen, ocrResult, dims, pop, meta, edit] = await Promise.all([
        analyzer.checkBlur(path),
        analyzer.checkBrightness(path),
        analyzer.checkScreenshot(path),
        analyzer.checkOCR(path),
        analyzer.checkDimensions(path),
        analyzer.checkPhotoOfPhoto(path),
        analyzer.checkMetadata(path),
        analyzer.checkEditing(path)
      ])

      image.analysis = {
        blur: { detected: blur.detected, score: blur.score },
        brightness: { detected: light.detected, score: light.score },
        ocr: { vehicleNumber: ocrResult.vehicleNumber },
        numberPlateValidation: { valid: ocrResult.valid },
        dimensions: { valid: dims.valid, details: dims.details },
        photoOfPhoto: { detected: pop.detected },
        metadata: { valid: meta.valid, details: meta.details },
        editing: { suspicious: edit.suspicious }
      }

      const issues: string[] = []
      if (blur.detected) issues.push("Blurry image")
      if (light.detected) issues.push("Low light")
      if (screen.detected) issues.push("Screenshot detected")
      if (ocrResult.issueStr && ocrResult.issueStr !== "Unclear number plate") {
        issues.push(ocrResult.issueStr)
      }
      if (!dims.valid) issues.push(dims.details)
      if (pop.detected) issues.push("Possible photo of a photo")
      if (!meta.valid) issues.push(meta.details)
      if (edit.suspicious) issues.push("Suspicious image editing detected")

      const duplicateIssue = await analyzer.checkDuplicate(hash, id)
      if (duplicateIssue) issues.push(duplicateIssue.message)

      image.issues = issues
      image.overallResult = issues.length > 0 ? "Rejected" : "Accepted"
      
      // Calculate a dynamic confidence score based on the sub-scores
      // Higher score for OCR confidence, lower for blur/bad lighting
      let baseConfidence = 1.0;
      if (blur.detected) baseConfidence -= (blur.score * 0.5);
      if (light.detected) baseConfidence -= (light.score * 0.3);
      if (ocrResult.issueStr) baseConfidence -= 0.4;
      if (baseConfidence < 0) baseConfidence = 0;
      if (baseConfidence > 1) baseConfidence = 1;
      
      image.confidence = baseConfidence
      image.status = "completed"
      image.hash = hash

      await image.save()

      logger.info(`✅ Completed: ${id}`)

    } catch (err: any) {
      logger.error(`❌ Failed processing ${id}`, err)
      
      if (attempts < MAX_RETRIES) {
        const delay = Math.pow(2, attempts) * 1000; // Exponential backoff (1s, 2s, 4s)
        logger.info(`⏳ Retrying job ${id} in ${delay}ms...`)
        
        setTimeout(() => {
          this.add(id, path, attempts + 1)
        }, delay);
      } else {
        logger.error(`❌ Job ${id} permanently failed after ${MAX_RETRIES + 1} attempts`)
        const image = await ImageModel.findOne({ imageId: id })
        if (image) {
          image.status = "failed"
          image.issues.push(err.message || "Unknown error")
          await image.save()
        }
      }
    }
  }

  async resumePending() {
    const pendingImages = await ImageModel.find({
      status: { $in: ["pending", "processing"] as any }
    })
    
    if (pendingImages.length > 0) {
      logger.info(`♻️ Resuming ${pendingImages.length} pending/processing jobs...`)
      for (const img of pendingImages) {
        this.add(img.imageId, img.path)
      }
    }
  }
}

export const imageQueue = new InMemoryQueue()