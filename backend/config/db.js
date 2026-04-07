import mongoose from "mongoose";

export const connectDB = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGO_URI or MONGODB_URI not set");
  }

  const maxPoolSize = Math.min(Math.max(Number(process.env.MONGO_MAX_POOL_SIZE || 10), 1), 100);
  const minPoolSize = Math.min(Math.max(Number(process.env.MONGO_MIN_POOL_SIZE || 2), 0), maxPoolSize);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      maxPoolSize,
      minPoolSize,
      maxIdleTimeMS: 30000,
      retryWrites: true,
      tls: true,
    });
    console.log("MongoDB connected");
  } catch (error) {
    const message = String(error?.message || "");
    const isTlsOrNetworkIssue = /tls|ssl|serverselection|econn|timeout|network/i.test(message);
    if (isTlsOrNetworkIssue) {
      console.error(
        "MongoDB connection failed. Check Atlas Network Access (allow current IP/0.0.0.0/0), user credentials, and cluster status."
      );
    }
    throw error;
  }
};
