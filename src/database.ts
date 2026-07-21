import mongoose, { Document, Schema } from "mongoose"

export interface IImage extends Document {
  imageId: string
  filename: string
  path: string
  status: "pending" | "completed" | "failed"
  analysis: {
    blur: { detected: boolean; score: number }
    brightness: { detected: boolean; score: number }
    ocr: { vehicleNumber: string | null }
    numberPlateValidation: { valid: boolean }
    dimensions: { valid: boolean; details: string }
    photoOfPhoto: { detected: boolean }
    metadata: { valid: boolean; details: string }
    editing: { suspicious: boolean }
  }
  overallResult: "Accepted" | "Rejected" | "Pending"
  issues: string[]
  confidence: number
  hash: string
}

const ImageSchema = new Schema<IImage>({
  imageId: { type: String, required: true },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  status: { type: String, default: "pending" },
  analysis: {
    blur: { detected: { type: Boolean, default: false }, score: { type: Number, default: 0 } },
    brightness: { detected: { type: Boolean, default: false }, score: { type: Number, default: 0 } },
    ocr: { vehicleNumber: { type: String, default: null } },
    numberPlateValidation: { valid: { type: Boolean, default: false } },
    dimensions: { valid: { type: Boolean, default: true }, details: { type: String, default: "" } },
    photoOfPhoto: { detected: { type: Boolean, default: false } },
    metadata: { valid: { type: Boolean, default: true }, details: { type: String, default: "" } },
    editing: { suspicious: { type: Boolean, default: false } }
  },
  overallResult: { type: String, default: "Pending" },
  issues: [{ type: String }],
  confidence: { type: Number, default: 0 },
  hash: { type: String }
})

export const ImageModel = mongoose.model<IImage>("Image", ImageSchema)

export async function initDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vehicle-media-pipeline"
    await mongoose.connect(mongoUri)
    console.log("📦 Connected to MongoDB")
  } catch (error) {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  }
}