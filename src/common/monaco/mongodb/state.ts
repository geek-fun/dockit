type MongoDynamicOptions = {
  collectionNames?: string[];
  databaseNames?: string[];
  activeCollection?: string;
};

const dynamicOptionsMap = new Map<string, MongoDynamicOptions>();

export const setMongoDynamicOptions = (modelUri: string, options: MongoDynamicOptions): void => {
  const existing = dynamicOptionsMap.get(modelUri) || {};
  dynamicOptionsMap.set(modelUri, { ...existing, ...options });
};

export const getMongoDynamicOptions = (modelUri: string): MongoDynamicOptions => {
  return dynamicOptionsMap.get(modelUri) || {};
};

export const clearMongoDynamicOptions = (modelUri: string): void => {
  dynamicOptionsMap.delete(modelUri);
};

export const mongoSampleQueries = {
  findAll: `db.collection.find({}).limit(100)`,
  findOne: `db.collection.findOne({ _id: ObjectId("...") })`,
  findWithFilter: `db.collection.find({
  status: "active",
  age: { $gt: 18 }
}).sort({ createdAt: -1 }).limit(10)`,
  aggregate: `db.collection.aggregate([
  { $match: { status: "active" } },
  { $group: { _id: "$category", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
])`,
  countDocuments: `db.collection.countDocuments({ status: "active" })`,
  insertOne: `db.collection.insertOne({
  name: "example",
  status: "active",
  createdAt: new Date()
})`,
  insertMany: `db.collection.insertMany([
  { name: "first", status: "active" },
  { name: "second", status: "inactive" }
])`,
  updateOne: `db.collection.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: "inactive", updatedAt: new Date() } }
)`,
  updateMany: `db.collection.updateMany(
  { status: "pending" },
  { $set: { status: "active" }, $inc: { version: 1 } }
)`,
  deleteOne: `db.collection.deleteOne({ _id: ObjectId("...") })`,
  deleteMany: `db.collection.deleteMany({ status: "archived" })`,
  createIndex: `db.collection.createIndex({ email: 1 }, { unique: true })`,
  dropIndex: `db.collection.dropIndex("email_1")`,
  distinct: `db.collection.distinct("status")`,
  bulkWrite: `db.collection.bulkWrite([
  { insertOne: { document: { name: "new" } } },
  { updateOne: { filter: { name: "old" }, update: { $set: { name: "updated" } } } },
  { deleteOne: { filter: { name: "delete" } } }
])`,
};
