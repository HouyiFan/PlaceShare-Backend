const jwt = require("jsonwebtoken");

const HttpError = require("../models/http-error");

module.exports = (req, res, next) => {
    // This is the default behavior in CORS (Cross-Origin Resource Sharing)
    //  so before a request("POST", "PATCH", any request except "GET"),
    //  a request with "OPTIONS" will be sent to the server firstly
    //  so that the server can tell the browser if the upcoming request is acceptable
    // If it is acceptable, then the browser will send the actual request
  if (req.method === "OPTIONS") {
    return next();
  }
  try {
    // console.log(req.headers.authorization);
    const token = req.headers.authorization.split(" ")[1]; // Authrization: 'Bearer TOKEN'
    if (!token) {
      throw new Error("Authentication failed!");
    }
    // jwt.verify() will throw an error if token is invalid
    //  this decodedToken is unique since if you manually change the token, the value of decoded token will also change
    const decodedToken = jwt.verify(token, process.env.JWT_KEY);
    // this will make userId accessible in the backend
    req.userData = { userId: decodedToken.userId };
    next();
  } catch (err) {
    const error = new HttpError("Authentication failed", 403);
    return next(error);
  }
};
