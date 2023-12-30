const express = require("express");
const cors = require("cors");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(cors());
let database;
const app = express();
app.use(express.json());

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: path.join(__dirname, "restore.db"),
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Restore back is running on http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Database error is ${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();
const salt = crypto.randomBytes(16).toString("hex");

//ap1 register user
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `select username from user where username='${username}';`;
  const dbUser = await database.get(checkUser);
  console.log(dbUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const requestQuery = `insert into user(name, username, password, gender) values(
            '${name}','${username}','${hashedPassword}','${gender}');`;
      await database.run(requestQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//api2 login user
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `select * from user where username='${username}';`;
  const dbUserExist = await database.get(checkUser);
  if (dbUserExist !== undefined) {
    const checkPassword = await bcrypt.compare(password, dbUserExist.password);
    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secret_key", { algorithm: "RS256" });
      response.send({ jwtToken });
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
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }

  if (jwtToken !== undefined) {
    jwt.verify(
      jwtToken,
      "secret_key",
      { algorithms: ["RS256"] },
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      }
    );
  }
};

app.get("/restore", authenticationToken, (req, res) => {
  res.send("Hello World!");
});
