import mongoose from "mongoose";

export const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI not set");
  }

  const maxPoolSize = Math.min(Math.max(Number(process.env.MONGO_MAX_POOL_SIZE || 10), 1), 100);
  const minPoolSize = Math.min(Math.max(Number(process.env.MONGO_MIN_POOL_SIZE || 2), 0), maxPoolSize);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize,
    minPoolSize,
    maxIdleTimeMS: 30000,
    retryWrites: true,
  });
  console.log("MongoDB connected");
};
