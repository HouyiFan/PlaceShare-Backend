const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const aws = require("aws-sdk");
const fs = require("fs");

const User = require("../models/user");
const HttpError = require("../models/http-error");

aws.config.update({
  secretAccessKey: process.env.ACCESS_KEY,
  accessKeyId: process.env.ACCESS_KEY_ID
  // region: process.env.REGION
});

const getUsers = async (req, res, next) => {
  // console.log(req);
  let users;
  try {
    users = await User.find({}, "-password"); // exclude the password
  } catch (err) {
    const error = new HttpError(
      "Fetching users failed, please try again later.",
      500
    );
    return next(error);
  }
  res.send({
    users: users.map(user => user.toObject({ getters: true }))
  });
};

const signup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }
  const { name, email, password } = req.body;

  let existingUser;
  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError(
      "Signing up failed, please try again later.",
      500
    );
    return next(error);
  }
  if (existingUser) {
    const error = new HttpError(
      "Could not create user, email already exists. Please login instead.",
      422
    );
    return next(error);
  }

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password, 12);
  } catch (err) {
    const error = new HttpError("Could not create user, please try again", 500);
    return next(error);
  }

  const s3 = new aws.S3();
  const s3Params = {
    ACL: "public-read",
    Bucket: process.env.S3_BUCKET_NAME,
    Body: fs.createReadStream(req.file.path),
    Key: `userAvatar/${req.file.filename}`
  };

  let imageUrl;

  // s3.upload(s3Params, (err, data) => {
  //   if (err) {
  //     console.log("Error uploading user avatar", err);
  //   }
  //   console.log(data);
  //   if (data) {
  //     imageUrl = data.Location;
  //   }
  // });

  try {
    const data = await s3.upload(s3Params).promise();
    // console.log(data);
    // if (data) {
    //   imageUrl = data.Location;
    // }
    if (data) {
      imageUrl = data.Key;
    }
  } catch (err) {
    const error = new HttpError("Cannot upload user avatar, please try again", 500);
    return next(error);
  }

  // image: req.file.path,
  // console.log(req.file.filename);
  const createdUser = new User({
    name,
    email,
    image: imageUrl,
    password: hashedPassword,
    places: []
  });

  // console.log(createdUser);

  try {
    await createdUser.save();
  } catch (err) {
    const error = new HttpError("Signing up failed, please try again", 500);
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      {
        userId: createdUser.id,
        email: createdUser.email
      },
      process.env.JWT_KEY, // It is the scecret key, any string is fine
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError(
      "Signing up failed, please try again later.",
      500
    );
    return next(error);
  }

  res
    .status(201)
    .json({ userId: createdUser.id, email: createdUser.email, token: token });
};

const login = async (req, res, next) => {
  const { email, password } = req.body;

  let existingUser;
  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }

  if (!existingUser) {
    const error = new HttpError(
      "Invalid credentials, could not log you in.",
      403
    );
    return next(error);
  }

  let isValidPassword = false;
  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (err) {
    const error = new HttpError(
      "Could not log yopu in, please check your credentials and try again.",
      403
    );
    return next(error);
  }

  if (!isValidPassword) {
    const error = new HttpError(
      "Invalid credentials, could not log you in.",
      403
    );
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      {
        userId: existingUser.id,
        email: existingUser.email
      },
      process.env.JWT_KEY, // It is the scecret key, any string is fine
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }

  res.send({
   userId: existingUser.id, 
   email: existingUser.email,
   token: token
  });
};

exports.getUsers = getUsers;
exports.signup = signup;
exports.login = login;
