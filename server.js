const express = require("express");
const cors = require("cors");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

let database;
const app = express();
const corsOptions = {
  origin: [
    /^https:\/\/restorephotos\.netlify\.app\/.*/,
    /^http:\/\/localhost/,
    "https://restorephotos.netlify.app",
  ],
  methods: "GET,POST",
  credentials: true,
};
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: path.join(__dirname, "restore.db"),
      driver: sqlite3.Database,
    });

    // Create the 'user' table if it doesn't exist
    const createTableResult = await database.run(`
      CREATE TABLE IF NOT EXISTS user (
        username TEXT NOT NULL,
        password TEXT NOT NULL
      );
    `);
    if (createTableResult.changes > 0) {
      console.log("Table 'user' created successfully.");
    }
    app.listen(8080, () => {
      console.log("Restore back is running on http://localhost:8080/");
    });
  } catch (error) {
    console.log(`Database error is ${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();

//ap1 register user
app.post("/register", async (request, response) => {
  const { username, password, secret } = request.body;
  if (!secret || secret !== process.env.SECRET) {
    return response.status(400).send("Invalid Secret");
  }
  const checkUser = `select username from user where username='${username}';`;
  const dbUser = await database.get(checkUser);
  console.log(dbUser);
  if (dbUser !== undefined) {
    response.status(400).send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const requestQuery = `insert into user(username, password) values(
        '${username}','${hashedPassword}');`;
      await database.run(requestQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//api2 login user
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `select * from user where username='${username}';`;
  const dbUserExist = await database.get(checkUser);
  if (dbUserExist !== undefined) {
    const checkPassword = await bcrypt.compare(password, dbUserExist.password);
    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, process.env.SECRET, {
        expiresIn: "1d",
      });
      response
        .cookie("access_token", jwtToken, { httpOnly: true, secure: true })
        .status(200)
        .json({ username: username });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//authentication jwt token
const authenticationToken = (request, response, next) => {
  const jwtToken = request.cookies.access_token;
  if (!jwtToken) {
    return response.status(401).send("Invalid JWT Token");
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, process.env.SECRET, async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/generate", authenticationToken, async (request, response) => {
  const imgUrl = request.body.imgUrl;
  console.log(imgUrl);
  // POST request to Replicate to start the image restoration generation process
  let startResponse = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Token " + process.env.REPLICATE_API_KEY,
    },
    body: JSON.stringify({
      version:
        "9283608cc6b7be6b65a8e44983db012355fde4132009bf99d976b2f0896856a3",
      input: { img: imgUrl, version: "v1.4", scale: 2 },
    }),
  });

  let jsonStartResponse = await startResponse.json();
  let endpointUrl = jsonStartResponse.urls.get;

  // GET request to get the status of the image restoration process & return the result when it's ready
  let restoredImage = null;
  while (!restoredImage) {
    // Loop in 1s intervals until the alt text is ready
    console.log("polling for result...");
    let finalResponse = await fetch(endpointUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Token " + process.env.REPLICATE_API_KEY,
      },
    });
    let jsonFinalResponse = await finalResponse.json();

    if (jsonFinalResponse.status === "succeeded") {
      restoredImage = jsonFinalResponse.output;
    } else if (jsonFinalResponse.status === "failed") {
      response.status(400).json("Failed to restore image");
      break;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  response
    .status(200)
    .json(restoredImage ? restoredImage : "Failed to restore image");
});
