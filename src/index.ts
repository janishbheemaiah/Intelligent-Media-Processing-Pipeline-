import express from "express"
import multer from "multer"
import { v4 as uuid } from "uuid"
import { initDB, ImageModel } from "./database"
import { imageQueue } from "./queue"
import { Status } from "./types"
import rateLimit from "express-rate-limit"
import { logger } from "./logger"
import fs from "fs"

const app = express()
app.use(express.json())

// Ensure uploads directory exists for new clones
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads")
}

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again after 15 minutes" }
})

// Apply rate limiter to all requests
app.use(limiter)

const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: (_, file, cb) =>
      cb(null, Date.now() + "-" + file.originalname)
  })
})

app.use(express.static("public"))

app.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.file) {
    logger.warn("Upload attempt without a file");
    return res.status(400).json({ error: "No file uploaded" })
  }

  const imageId = uuid()
  const imagePath = `uploads/${Date.now()}-${req.file.originalname}`
  
  // Since we save it right there:
  fs.renameSync(req.file.path, imagePath)

  const image = new ImageModel({
    imageId,
    filename: req.file.originalname,
    path: imagePath,
    status: "pending",
    analysis: {
      blur: { detected: false, score: 0 },
      brightness: { detected: false, score: 0 },
      ocr: { vehicleNumber: null },
      numberPlateValidation: { valid: false }
    },
    overallResult: "Pending",
    issues: [],
    confidence: 0
  })

  await image.save()

  logger.info(`New image uploaded: ${imageId}`, { filename: req.file.originalname })
  await imageQueue.add(imageId, imagePath)

  res.json({ id: imageId, status: "pending" })
})

app.get("/status/:id", async (req, res) => {
  try {
    const image = await ImageModel.findOne({ imageId: req.params.id })

    if (!image) {
      return res.status(404).json({ error: "Not found" })
    }

    res.json({ id: image.imageId, status: image.status })
  } catch (err) {
    logger.error(`Error fetching status for ${req.params.id}`, err)
    res.status(500).json({ error: "Server error" })
  }
})

app.get("/results/:id", async (req, res) => {
  try {
    const image = await ImageModel.findOne({ imageId: req.params.id })
    if (!image) {
      return res.status(404).json({ error: "Image not found" })
    }

    res.json({
      imageId: image.imageId,
      status: image.status,
      analysis: image.analysis,
      overallResult: image.overallResult,
      issues: image.issues,
      confidence: image.confidence,
      filename: image.filename
    })
  } catch (error) {
    logger.error(`Error fetching results for ${req.params.id}`, error)
    res.status(500).json({ error: "Database error" })
  }
})

app.get("/analytics", async (req, res) => {
  try {
    const total = await ImageModel.countDocuments();
    const accepted = await ImageModel.countDocuments({ overallResult: "Accepted" });
    const rejected = await ImageModel.countDocuments({ overallResult: "Rejected" });
    const pending = await ImageModel.countDocuments({ overallResult: "Pending" });
    
    // Calculate average confidence for accepted images
    const acceptedImages = await ImageModel.find({ overallResult: "Accepted" });
    const avgConfidence = acceptedImages.length > 0 
      ? acceptedImages.reduce((sum, img) => sum + (img.confidence || 0), 0) / acceptedImages.length 
      : 0;

    res.json({
      total,
      accepted,
      rejected,
      pending,
      avgConfidence: (avgConfidence * 100).toFixed(2)
    });
  } catch (error) {
    logger.error("Error fetching analytics", error)
    res.status(500).json({ error: "Server error" })
  }
});

initDB().then(async () => {
  // Resume any pending/processing jobs left over if the server crashed
  await imageQueue.resumePending()
  
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info(`🚀 Server running at http://localhost:${port}`)
  })
})