const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const nodemailer = require("nodemailer");
const port = process.env.PORT || 5000;
const app = express();
app.use(express.json());
app.use(cors());

// connection with mongodb

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hoyf4.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const run = async () => {
  await client.connect();
  const productsCollection = await client.db("tools").collection("products");
  const userCollection = await client.db("tools").collection("users");
  const orderCollection = await client.db("tools").collection("orders");

  app.get("/", async (req, res) => {
    res.send("working");
  });

  app.post("/token", async (req, res) => {
    const { user } = req.body;
    const email = user.email;
    const filter = { email };
    const options = { upsert: true };
    const role = user.role ? user.role : "user";
    const updateDoc = {
      $set: { ...user, role },
    };
    const result = await userCollection.updateOne(filter, updateDoc, options);
    jwt.sign(
      { email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
      function (err, token) {
        console.log(token);
        res.send(token);
      }
    );
  });

  app.get("/user/:email", async (req, res) => {
    const { email } = req.params;
    const user = await userCollection.findOne({ email });
    res.send(user);
  });

  app.post("/update-user", async (req, res) => {
    let user = req.body.user;
    user = Object.fromEntries(
      Object.entries(user).filter(([key]) => key !== "_id")
    );
    const email = user.email;
    const filter = { email };
    const updateDoc = {
      $set: { ...user },
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
  });

  app.get("/products", async (req, res) => {
    const products = await productsCollection.find({}).toArray();
    res.send(products);
  });

  app.get("/product/:id", async (req, res) => {
    const { id } = req.params;
    const query = { _id: ObjectId(id) };
    const product = await productsCollection.findOne(query);
    res.send(product);
  });

  app.post("/order", async (req, res) => {
    const { OrderInformation } = req.body;
    const { orderQuantity, productID } = OrderInformation;
    const filter = { _id: ObjectId(productID) };

    const result = await orderCollection.insertOne(OrderInformation);
    if (result.insertedId) {
      const product = await productsCollection.findOne(filter);
      const { quantity, minimumOrder } = product;
      const newQuantity = Number(quantity) - Number(orderQuantity);
      const newMinimumQuantity =
        newQuantity < 1000 ? newQuantity : minimumOrder;

      const updateDoc = {
        $set: {
          ...product,
          quantity: newQuantity,
          minimumOrder: newMinimumQuantity,
        },
      };
      const res = await productsCollection.updateOne(filter, updateDoc);
    }
    res.send(result);
  });

  app.get("/order/:email", async (req, res) => {
    const { email } = req.params;
    const myOrder = await orderCollection.find({ email }).toArray();
    res.send(myOrder);
  });
};
run().catch(console.dir);

app.listen(port, () => console.log("running at ", port));
