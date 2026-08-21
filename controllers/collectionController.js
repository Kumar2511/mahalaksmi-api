import Collection from "../models/Collection.js";

// ======================================
// GET ALL COLLECTIONS
// ======================================

export const getCollections = async (
  req,
  res
) => {
  try {
    const collections =
      await Collection.find({})
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json({
      success: true,
      count: collections.length,
      collections,
    });
  } catch (error) {
    console.error(
      "Get Collections Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load collections.",
    });
  }
};

// ======================================
// GET SINGLE COLLECTION
// ======================================

export const getCollection = async (
  req,
  res
) => {
  try {
    const collection =
      await Collection.findById(
        req.params.id
      );

    if (!collection) {
      return res.status(404).json({
        success: false,
        message:
          "Collection not found.",
      });
    }

    return res.status(200).json({
      success: true,
      collection,
    });
  } catch (error) {
    console.error(
      "Get Collection Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load collection.",
    });
  }
};

// ======================================
// CREATE COLLECTION
// ======================================

export const createCollection = async (
  req,
  res
) => {
  try {
    const {
      name,
      slug,
      description,
      image,
      isActive,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Collection name is required.",
      });
    }

    const finalSlug =
      slug?.trim().toLowerCase() ||
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const existing =
      await Collection.findOne({
        slug: finalSlug,
      });

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "A collection with this slug already exists.",
      });
    }

    const collection =
      await Collection.create({
        name: name.trim(),
        slug: finalSlug,
        description:
          description?.trim() || "",
        image: image?.trim() || "",
        isActive:
          isActive !== false,
      });

    return res.status(201).json({
      success: true,
      message:
        "Collection created successfully.",
      collection,
    });
  } catch (error) {
    console.error(
      "Create Collection Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create collection.",
    });
  }
};

// ======================================
// UPDATE COLLECTION
// ======================================

export const updateCollection = async (
  req,
  res
) => {
  try {
    const {
      name,
      slug,
      description,
      image,
      isActive,
    } = req.body;

    const collection =
      await Collection.findById(
        req.params.id
      );

    if (!collection) {
      return res.status(404).json({
        success: false,
        message:
          "Collection not found.",
      });
    }

    if (name !== undefined) {
      collection.name =
        name.trim();
    }

    if (slug !== undefined) {
      const finalSlug =
        slug.trim().toLowerCase();

      const duplicate =
        await Collection.findOne({
          slug: finalSlug,
          _id: {
            $ne: collection._id,
          },
        });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message:
            "Another collection already uses this slug.",
        });
      }

      collection.slug =
        finalSlug;
    }

    if (
      description !== undefined
    ) {
      collection.description =
        description.trim();
    }

    if (image !== undefined) {
      collection.image =
        image.trim();
    }

    if (
      isActive !== undefined
    ) {
      collection.isActive =
        Boolean(isActive);
    }

    await collection.save();

    return res.status(200).json({
      success: true,
      message:
        "Collection updated successfully.",
      collection,
    });
  } catch (error) {
    console.error(
      "Update Collection Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update collection.",
    });
  }
};

// ======================================
// DELETE COLLECTION
// ======================================

export const deleteCollection = async (
  req,
  res
) => {
  try {
    const collection =
      await Collection.findByIdAndDelete(
        req.params.id
      );

    if (!collection) {
      return res.status(404).json({
        success: false,
        message:
          "Collection not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Collection deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Collection Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to delete collection.",
    });
  }
};