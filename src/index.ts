// Import first so it patches net/tls before anything else uses them
import "./tcp-metrics.js";

import { on } from "./tcp-metrics.js";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI environment variable is not set");
}
const client = new MongoClient(uri);

(async () => {
  try {
    await client.connect();
    const db = client.db("testdb");
    const collection = db.collection<{ _id: string; data: string }>("testcollection");

    // Generate 15MB payload
    const payload = "x".repeat(15 * 1024 * 1024);
    const doc: { _id: string; data: string } = { _id: "large-doc", data: payload };

    console.log("Writing 15MB document to MongoDB...");
    await collection.insertOne(doc);

    console.log("Reading 15MB document from MongoDB...");
    const result = await collection.findOne({ _id: "large-doc" });
    console.log("Read complete, doc size:", result?.data?.length);

    await collection.deleteOne({ _id: "large-doc" });
  } catch (err) {
    console.error("MongoDB error:", err);
  } finally {
    await client.close();
  }
})();

// Optional: listen for per-socket summaries
on("socketSummary", (s) => {
  console.log("[tcp] socketSummary:", s);
});

// // Periodic report
// setInterval(() => {
//   const totals = getTotals();
//   console.log("[tcp] totals:", totals);
// }, 10_000);
