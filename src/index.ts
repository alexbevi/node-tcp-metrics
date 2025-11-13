// Import first so it patches net/tls before anything else uses them
import "./tcp-metrics.js";

import { on } from "./tcp-metrics.js";
import { MongoClient } from "mongodb";
import Chance from "chance";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI environment variable is not set");
}
const client = new MongoClient(uri);
const delay = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms));

(async () => {
  try {
    await client.connect();
    const db = client.db("testdb");
    const collection = db.collection<{ _id: string; data: string }>("testcollection");
    const chance = new Chance(42); // Fixed seed for deterministic generation

    // Generate a complex document structure that's approximately 5MB
    const itemCount = 5000; // Adjust to control size
    const payload = {
      users: Array.from({ length: itemCount }, (_, i) => ({
      id: i,
      name: chance.name(),
      email: chance.email(),
      address: {
        street: chance.address(),
        city: chance.city(),
        state: chance.state(),
        zip: chance.zip(),
        country: chance.country()
      },
      phone: chance.phone(),
      company: chance.company(),
      bio: chance.paragraph({ sentences: 5 }),
      avatar: chance.url(),
      tags: Array.from({ length: 10 }, () => chance.word()),
      metadata: {
        createdAt: chance.date().toISOString(),
        lastLogin: chance.timestamp(),
        preferences: {
        theme: chance.pickone(['dark', 'light', 'auto']),
        language: chance.locale(),
        notifications: chance.bool()
        }
      }
      }))
    };
    const doc: any = { _id: "large-doc", ...payload };

    await collection.insertOne(doc);
    const result = await collection.findOne({ _id: "large-doc" });

    const buf = Buffer.from(JSON.stringify(result));
    console.log("Document insert and read complete, doc size (bytes):", buf.length);

    await collection.deleteOne({ _id: "large-doc" });

    // keep the application alive so monitoring connections continue to be issued
    // await delay(60000);
  } catch (err) {
    console.error("MongoDB error:", err);
  } finally {
    await client.close();
 }
})();

// Periodic report
// setInterval(() => console.log(getTotals()), 5_000);

on("socketSummary", (s) => console.log(s));
