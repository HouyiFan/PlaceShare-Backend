const aws = require("aws-sdk");
const multer = require("multer");
const uuid = require("uuid/v1");

// aws.config.update({
//   secretAccessKey: process.env.AWS_ACCESS_KEY,
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID
//   // region: process.env.AWS_REGION
// });

// const s3 = new aws.S3();

// const s3Params = {
//   Bucket: process.env.AWS_BUCKET_NAME,
//   ACL: "public-read"
// };


const MIME_TYPE_MAP = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg"
};

const fileUpload = multer({
  limits: 5000000, //5000000 bytes
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      callback(null, "uploads/images");
    },
    filename: (req, file, callback) => {
      const extension = MIME_TYPE_MAP[file.mimetype];
      callback(null, uuid() + "." + extension);
    }
  }),
  // storage: multerS3({
  //   s3: s3,
  //   bucket: process.env.AWS_BUCKET_NAME,
  //   location: (req),
  //   key: (req, file, callback) => {
  //     const extension = MIME_TYPE_MAP[file.mimetype];
  //     callback(null, uuid() + "." + extension);
  //   }
  // }),
  fileFilter: (req, file, callback) => {
    const isValid = !!MIME_TYPE_MAP[file.mimetype];
    let error = isValid ? null : new Error("Invalid mime type!");
    callback(error, isValid);
  }
});

module.exports = fileUpload;
