import Category from "../models/Category.js";

// ======================================
// GET ALL CATEGORIES
// ======================================

export const getCategories = async (
  req,
  res
) => {
  try {
    const categories =
      await Category.find({})
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error(
      "Get Categories Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load categories.",
    });
  }
};

// ======================================
// GET SINGLE CATEGORY
// ======================================

export const getCategory = async (
  req,
  res
) => {
  try {
    const category =
      await Category.findById(
        req.params.id
      );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    console.error(
      "Get Category Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load category.",
    });
  }
};

// ======================================
// CREATE CATEGORY
// ======================================

export const createCategory = async (
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
          "Category name is required.",
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
      await Category.findOne({
        slug: finalSlug,
      });

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "A category with this slug already exists.",
      });
    }

    const category =
      await Category.create({
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
        "Category created successfully.",
      category,
    });
  } catch (error) {
    console.error(
      "Create Category Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create category.",
    });
  }
};

// ======================================
// UPDATE CATEGORY
// ======================================

export const updateCategory = async (
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

    const category =
      await Category.findById(
        req.params.id
      );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    if (name !== undefined) {
      category.name =
        name.trim();
    }

    if (slug !== undefined) {
      const finalSlug =
        slug.trim().toLowerCase();

      const duplicate =
        await Category.findOne({
          slug: finalSlug,
          _id: {
            $ne: category._id,
          },
        });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message:
            "Another category already uses this slug.",
        });
      }

      category.slug =
        finalSlug;
    }

    if (
      description !== undefined
    ) {
      category.description =
        description.trim();
    }

    if (image !== undefined) {
      category.image =
        image.trim();
    }

    if (
      isActive !== undefined
    ) {
      category.isActive =
        Boolean(isActive);
    }

    await category.save();

    return res.status(200).json({
      success: true,
      message:
        "Category updated successfully.",
      category,
    });
  } catch (error) {
    console.error(
      "Update Category Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update category.",
    });
  }
};

// ======================================
// DELETE CATEGORY
// ======================================

export const deleteCategory = async (
  req,
  res
) => {
  try {
    const category =
      await Category.findByIdAndDelete(
        req.params.id
      );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Category deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Category Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to delete category.",
    });
  }
};