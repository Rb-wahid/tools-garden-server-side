const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

// JWT verification function

const verifyJwt = async (req, res, next) => {
  console.log(req.headers);
  const token = req.headers?.authorization.split(" ")[1];
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorize access" });
  }
  jwt.verify(token, process.env.JWT_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

// Node mailer

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: "465",
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_PASS,
  },
});

// send email config

function sendEmail(user, email, body) {
  console.log(user, body);
  const receiver = email;
  const emailStructure = {
    from: process.env.ZOHO_EMAIL,
    to: receiver,
    subject: "Payment Completed",
    text: body,
    html: `
      <h5>Hello ${user},</h5>
      <p>${body}</p>
    `,
  };

  transporter.sendMail(emailStructure, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message send: ", info);
    }
  });
}

const run = async () => {
  await client.connect();
  const productsCollection = await client.db("tools").collection("products");
  const userCollection = await client.db("tools").collection("users");
  const orderCollection = await client.db("tools").collection("orders");
  const paymentCollection = await client.db("tools").collection("payment");
  const reviewCollection = await client.db("tools").collection("review");

  app.get("/", async (req, res) => {
    res.send("working");
  });

  // verification admin

  const verifyAdmin = async (req, res, next) => {
    const { email } = req.params;
    const user = await userCollection.findOne({ email });
    try {
      if (user.role === "admin") {
        next();
      }
    } catch (error) {
      return res.status(403).send({ message: "Forbidden access" });
    }
  };

  app.post("/token", async (req, res) => {
    const { user } = req.body;
    const email = user.email;
    const filter = { email };
    const getUser = await userCollection.findOne(filter);
    let role = "user";
    if (getUser) {
      role = getUser.role;
    }
    const options = { upsert: true };
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
        newQuantity < minimumOrder ? newQuantity : minimumOrder;

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

  app.get("/orders", async (req, res) => {
    const orders = await orderCollection.find({}).toArray();
    res.send(orders);
  });

  app.get("/order/:email", async (req, res) => {
    const { email } = req.params;
    const myOrder = await orderCollection.find({ email }).toArray();
    res.send(myOrder);
  });

  app.get("/order-details/:id", async (req, res) => {
    const { id } = req.params;
    const filter = { _id: ObjectId(id) };
    const order = await orderCollection.findOne(filter);
    res.send(order);
  });

  app.delete("/cancel-order/:id", async (req, res) => {
    const { id } = req.params;
    const filter = { _id: ObjectId(id) };
    const result = await orderCollection.deleteOne(filter);
    res.send(result);
  });

  app.put("/shipped-order/:id", async (req, res) => {
    const { id } = req.params;
    const filter = { _id: ObjectId(id) };
    const updateDoc = {
      $set: { status: "shipped" },
    };
    const result = await orderCollection.updateOne(filter, updateDoc);
    res.send(result);
  });

  app.post("/create-payment-intent", async (req, res) => {
    const { price } = req.body;
    const amount = price * 100;
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  });

  app.patch("/create-payment-intent/payment/:id", async (req, res) => {
    const id = req.params.id;
    const payment = req.body;
    const filter = { _id: ObjectId(id) };
    const updateDoc = {
      $set: {
        isPaid: true,
        status: "processing",
        transactionId: payment.transactionId,
      },
    };
    const email_body = `Successfully payment complete for product ID ${payment.productID}. TransactionId - ${payment.transactionId}`;
    const { email, user } = payment;

    sendEmail(user, email, email_body);
    const result = await paymentCollection.insertOne(payment);
    const order = await orderCollection.updateOne(filter, updateDoc);
    res.send(updateDoc);
  });

  app.get("/users", async (req, res) => {
    const users = await userCollection.find({}).toArray();
    res.send(users);
  });

  app.put("/make-admin/:email", verifyAdmin, async (req, res) => {
    const { email } = req.body;
    const filter = { email };
    const updateDoc = {
      $set: {
        role: "admin",
      },
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
  });

  app.put("/remove-admin/:email", verifyAdmin, async (req, res) => {
    const { email } = req.body;
    const filter = { email };
    const updateDoc = {
      $set: {
        role: "user",
      },
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
  });

  app.post("/add-product/:email", verifyAdmin, async (req, res) => {
    const { productInformation } = req.body;

    const result = await productsCollection.insertOne({
      ...productInformation,
    });
    res.send(result);
  });

  app.delete("/delete-product/:id", async (req, res) => {
    const { id } = req.params;
    const filter = { _id: ObjectId(id) };
    const result = await productsCollection.deleteOne(filter);
    res.send(result);
  });

  app.put("/update-product/:id", async (req, res) => {
    const { id } = req.params;
    const { productInformation } = req.body;
    const filter = { _id: ObjectId(id) };
    const updateDoc = {
      $set: { ...productInformation },
    };
    const result = await productsCollection.updateOne(filter, updateDoc);
    res.send(result);
  });

  app.post("/add-review/:email", verifyJwt, async (req, res) => {
    const { reviewInformation } = req.body;
    const userEmail = req.params.email;
    const decodedEmail = req.decoded?.email;
    if (userEmail === decodedEmail) {
      const result = await reviewCollection.insertOne({ reviewInformation });
      res.send(result);
    } else return res.status(403).send({ message: "403 Forbidden" });
  });

  app.get("/reviews", async (req, res) => {
    const result = await reviewCollection.find({}).toArray();
    res.send(result);
  });

  app.get("/stat", async (req, res) => {
    const customers = await userCollection.countDocuments();
    const products = await productsCollection.countDocuments();
    const reviews = await reviewCollection.countDocuments();
    const orders = await orderCollection.find({}).toArray();
    const sell = orders.reduce((sum, order) => {
      if (order.isPaid) {
        return sum + order.totalPrice;
      } else return sum + 0;
    }, 0);

    res.send({ customers, products, reviews, sell });
  });
};
run().catch(console.dir);

app.listen(port, () => console.log("running at ", port));
