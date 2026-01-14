const cloudinary = require('cloudinary').v2;
const CloudinaryStorage = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage for character images (profile & banner)
const characterStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'dnd-space/characters',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

// Storage for album photos
const photoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'dnd-space/photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
  }
});

const uploadCharacterImage = multer({
  storage: characterStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

module.exports = { cloudinary, uploadCharacterImage, uploadPhoto };
