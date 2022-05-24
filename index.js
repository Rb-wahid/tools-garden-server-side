const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const nodemailer = require("nodemailer");
const port = process.env.PORT || 5000;
const app = express();
app.use(express.json());
app.use(cors());



app.get("/", async (req, res) => {
  res.send("working");
});

app.listen(port, () => console.log("running at ", port));
