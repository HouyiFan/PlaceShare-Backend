const fs = require("fs");
const aws = require("aws-sdk");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");

const HttpError = require("../models/http-error");
const getCoordsForAddress = require("../util/location");
const Place = require("../models/place");
const User = require("../models/user");

aws.config.update({
  secretAccessKey: process.env.AWS_ACCESS_KEY,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID
  // region: process.env.AWS_REGION
});

const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      "something went wrong, could not find the place",
      500
    );
    return next(error);
  }

  if (!place) {
    throw new HttpError("Could not find a place for the provided id.", 404);
  }

  // without setting {getters: true}, we cannot fetch "id" and "_id", instead we only get "_id"
  res.send({ place: place.toObject({ getters: true }) }); // => { place } => { place: place }
};

// function getPlaceById() { ... }
// const getPlaceById = function() { ... }

const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid;

  // let userWithPlaces;
  let places;
  try {
    // userWithPlaces = await User.findById(userId).populate("places");
    places = await Place.find({ creator: userId });
  } catch (err) {
    const error = new HttpError(
      "Fetchingplaces failed, please try again later",
      500
    );
    return next(error);
  }

  // if(!userWithPlaces || userWithPlaces.places.length === 0) {
  if (!places) {
    return next(
      new HttpError("Could not find places for the provided user id.", 404)
    );
  }

  // let isCreator = false;
  // if (places.length === 0) {
  //   if (req.userData.userId === req.params.uid) {
  //     isCreator = true;
  //   }
  // }

  // res.json({ places: userWithPlaces.places.map(place => place.toObject({ getters: true })) });
  res.send({
    // isCreator: isCreator,
    places: places.map(place => place.toObject({ getters: true }))
  });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const { title, description, address } = req.body;

  let coordinates;
  try {
    coordinates = await getCoordsForAddress(address);
  } catch (error) {
    return next(error);
  }

  const s3 = new aws.S3();
  const s3Params = {
    ACL: "public-read",
    Bucket: process.env.AWS_BUCKET_NAME,
    Body: fs.createReadStream(req.file.path),
    Key: `placeImage/${req.file.filename}`
  };

  let imageUrl;

  try {
    const data = await s3.upload(s3Params).promise();
    // console.log(data);
    if (data) {
      imageUrl = data.Key;
    }
  } catch (err) {
    const error = new HttpError("Cannot upload place image, please try again", 500);
    return next(error);
  }

  const createdPlace = new Place({
    title,
    description,
    address,
    location: coordinates,
    image: imageUrl,
    creator: req.userData.userId
  });

  let user;

  try {
    user = await User.findById(req.userData.userId);
  } catch (err) {
    const error = new HttpError("Finding user failed, please try again", 500);
    return next(error);
  }

  if (!user) {
    const error = new HttpError("Could not find user for provided id", 500);
    return next(error);
  }

  // console.log(user);

  // DUMMY_PLACES.push(createdPlace); //unshift(createdPlace)
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    await createdPlace.save({ session: session });
    user.places.push(createdPlace);
    await user.save({ session: session });
    await session.commitTransaction();
  } catch (err) {
    const error = new HttpError("Creating place failed, please try again", 500);
    return next(error);
  }

  res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const { title, description } = req.body;
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not find the place",
      500
    );
    return next(error);
  }

  if (!place) {
    throw new HttpError("Could not find a place for the provided id.", 404);
  }

  // check if the creator is the logged in user
  if (place.creator.toString() !== req.userData.userId) {
    const error = new HttpError("You are not allowed to edit this place", 401);
    return next(error);
  }

  place.title = title;
  place.description = description;

  try {
    await place.save();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update place.",
      500
    );
    return next(error);
  }

  res.status(200).json({ place: place.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    // By using populate, we can access the User/creator associated with this placeId
    //  More specifically, place will have the creator property which is a User object
    place = await Place.findById(placeId).populate("creator");
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not find a place for that id.",
      404
    );
    return next(error);
  }

  if (!place) {
    const error = new HttpError("Could not find a place for that id.", 404);
    return next(error);
  }

  if (place.creator.id !== req.userData.userId) {
    const error = new HttpError(
      "You are not allowed to delete this place",
      401
    );
    return next(error);
  }

  const imagePath = place.image;
  // console.log(imagePath);

  const s3 = new aws.S3();
  const s3Params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: imagePath
  };

  const data = await s3.deleteObject(s3Params).promise();
  try {
    if (data) {
      console.log("delete success");
    }
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not delete place.",
      500
    );
    return next(error);
  }


  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    await place.remove({ session: session });
    place.creator.places.pull(place);
    await place.creator.save({ session: session });
    await session.commitTransaction();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not delete place.",
      500
    );
    return next(error);
  }

  // fs.unlink(imagePath, err => {
  //   console.log(err);
  // });

  res.status(200).json({ message: "Deleted place." });
};

exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
