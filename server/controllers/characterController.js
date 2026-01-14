const Character = require('../models/Character');
const { cloudinary } = require('../config/cloudinary');

// @desc    Get all characters (campaign directory)
// @route   GET /api/characters
// @access  Public
exports.getAllCharacters = async (req, res, next) => {
  try {
    const characters = await Character.find()
      .populate('owner', 'username')
      .sort({ createdAt: -1 });

    res.json({ characters });
  } catch (error) {
    next(error);
  }
};

// @desc    Get character by ID
// @route   GET /api/characters/:id
// @access  Public
exports.getCharacterById = async (req, res, next) => {
  try {
    const character = await Character.findById(req.params.id)
      .populate('owner', 'username email')
      .populate('topFriends', 'name profileImage myspaceUrl');

    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    res.json({ character });
  } catch (error) {
    next(error);
  }
};

// @desc    Get character by MySpace URL
// @route   GET /api/characters/url/:url
// @access  Public
exports.getCharacterByUrl = async (req, res, next) => {
  try {
    const character = await Character.findOne({ myspaceUrl: req.params.url })
      .populate('owner', 'username email')
      .populate('topFriends', 'name profileImage myspaceUrl');

    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    res.json({ character });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new character
// @route   POST /api/characters
// @access  Private
exports.createCharacter = async (req, res, next) => {
  try {
    const characterData = {
      ...req.body,
      owner: req.user._id
    };

    const character = await Character.create(characterData);

    // Auto-create a photo album for this character
    const Album = require('../models/Album');
    await Album.create({
      character: character._id,
      title: `${character.name}'s Photos`,
      description: 'Character photo album'
    });

    res.status(201).json({
      message: 'Character created successfully',
      character
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update character
// @route   PUT /api/characters/:id
// @access  Private (owner only)
exports.updateCharacter = async (req, res, next) => {
  try {
    const character = await Character.findById(req.params.id);

    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    // Check ownership
    if (character.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this character' });
    }

    // Update fields
    const allowedUpdates = [
      'name', 'race', 'class', 'level', 'stats', 'background',
      'alignment', 'bio', 'topFriends'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        character[field] = req.body[field];
      }
    });

    await character.save();

    res.json({
      message: 'Character updated successfully',
      character
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete character
// @route   DELETE /api/characters/:id
// @access  Private (owner only)
exports.deleteCharacter = async (req, res, next) => {
  try {
    const character = await Character.findById(req.params.id);

    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    // Check ownership
    if (character.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this character' });
    }

    const fs = require('fs');
    const path = require('path');

    // Delete character images from local storage if they exist
    if (character.profileImageCloudinaryId) {
      try {
        const filePath = path.join(__dirname, '../../uploads/characters', character.profileImageCloudinaryId);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Failed to delete profile image: ${character.profileImageCloudinaryId}`, error);
      }
    }
    if (character.bannerImageCloudinaryId) {
      try {
        const filePath = path.join(__dirname, '../../uploads/characters', character.bannerImageCloudinaryId);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Failed to delete banner image: ${character.bannerImageCloudinaryId}`, error);
      }
    }

    // Delete all albums and photos associated with this character
    const Album = require('../models/Album');
    const Photo = require('../models/Photo');
    const albums = await Album.find({ character: character._id });

    for (const album of albums) {
      // Delete all photos in the album
      const photos = await Photo.find({ album: album._id });
      for (const photo of photos) {
        try {
          const photoPath = path.join(__dirname, '../../uploads/photos', photo.cloudinaryId);
          if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
          }
        } catch (error) {
          console.error(`Failed to delete photo: ${photo.cloudinaryId}`, error);
        }
      }
      await Photo.deleteMany({ album: album._id });
      await album.deleteOne();
    }

    // Delete all comments by this character and photos in comments
    const Comment = require('../models/Comment');
    const comments = await Comment.find({ author: character._id });
    for (const comment of comments) {
      if (comment.photo && comment.photo.filename) {
        try {
          const commentPhotoPath = path.join(__dirname, '../../uploads/photos', comment.photo.filename);
          if (fs.existsSync(commentPhotoPath)) {
            fs.unlinkSync(commentPhotoPath);
          }
        } catch (error) {
          console.error(`Failed to delete comment photo: ${comment.photo.filename}`, error);
        }
      }
    }
    await Comment.deleteMany({ author: character._id });

    // Delete all comments on this character's wall
    await Comment.deleteMany({ character: character._id });

    // Finally, delete the character
    await character.deleteOne();

    res.json({ message: 'Character and all associated data deleted successfully' });
  } catch (error) {
    console.error('Error deleting character:', error);
    next(error);
  }
};

// @desc    Increment profile view counter
// @route   POST /api/characters/:id/view
// @access  Public
exports.incrementViewCount = async (req, res, next) => {
  try {
    const character = await Character.findByIdAndUpdate(
      req.params.id,
      { $inc: { profileViews: 1 } },
      { new: true }
    );

    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    res.json({ views: character.profileViews });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload profile or banner image
// @route   PUT /api/characters/:id/image
// @access  Private (owner only)
exports.uploadImage = async (req, res, next) => {
  try {
    console.log('Upload image request:', {
      characterId: req.params.id,
      imageType: req.body.imageType,
      hasFile: !!req.file,
      filename: req.file?.filename
    });

    const character = await Character.findById(req.params.id);

    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    // Check ownership
    if (character.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this character' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const imageType = req.body.imageType || 'profile'; // 'profile' or 'banner'

    // Delete old image from local storage if exists
    const fs = require('fs');
    const path = require('path');

    if (imageType === 'profile' && character.profileImageCloudinaryId) {
      try {
        const filePath = path.join(__dirname, '../../uploads/characters', character.profileImageCloudinaryId);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Failed to delete old profile image: ${character.profileImageCloudinaryId}`, error);
      }
    } else if (imageType === 'banner' && character.bannerImageCloudinaryId) {
      try {
        const filePath = path.join(__dirname, '../../uploads/characters', character.bannerImageCloudinaryId);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Failed to delete old banner image: ${character.bannerImageCloudinaryId}`, error);
      }
    }

    // Update character with new image
    const imageUrl = `/uploads/characters/${req.file.filename}`;

    if (imageType === 'profile') {
      character.profileImage = imageUrl;
      character.profileImageCloudinaryId = req.file.filename;
    } else {
      character.bannerImage = imageUrl;
      character.bannerImageCloudinaryId = req.file.filename;
    }

    await character.save();

    console.log('Image uploaded successfully:', imageUrl);

    res.json({
      message: `${imageType} image uploaded successfully`,
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    next(error);
  }
};

// @desc    Get user's characters
// @route   GET /api/characters/my/all
// @access  Private
exports.getMyCharacters = async (req, res, next) => {
  try {
    const characters = await Character.find({ owner: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ characters });
  } catch (error) {
    next(error);
  }
};
