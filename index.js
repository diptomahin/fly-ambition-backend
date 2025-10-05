const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const { ObjectId } = require("mongodb"); // import at the top
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure uploads folder exists
fs.ensureDirSync("./uploads");

// MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("flyAmbitionDB");
    const formCollection = db.collection("formSubmissions");
    const applyCollection = db.collection("applySubmissions");
    const testimonialCollection = db.collection("testimonials");

    const testimonialStorage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, "./uploads"),
      filename: (req, file, cb) =>
        cb(null, Date.now() + path.extname(file.originalname)),
    });
    const testimonialUpload = multer({ storage: testimonialStorage });

    app.post(
      "/api/testimonials",
      testimonialUpload.single("image"),
      async (req, res) => {
        try {
          const { author, role, country, text } = req.body;
          const image = req.file ? req.file.path : null;

          if (!author || !role || !country || !text) {
            return res
              .status(400)
              .json({ success: false, error: "All fields are required" });
          }

          const newTestimonial = {
            author,
            role,
            country,
            text,
            image,
            createdAt: new Date(),
          };
          const result = await testimonialCollection.insertOne(newTestimonial);

          res.json({
            success: true,
            message: "Testimonial added!",
            testimonial: newTestimonial,
          });
        } catch (err) {
          console.error(err);
          res
            .status(500)
            .json({ success: false, error: "Failed to add testimonial" });
        }
      }
    );

    app.get("/api/testimonials", async (req, res) => {
      try {
        const testimonials = await testimonialCollection.find().toArray();
        res.json({ success: true, data: testimonials });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, error: "Failed to fetch testimonials" });
      }
    });
app.get("/api/testimonials/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate and convert id
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid ID format" });
    }

    const objectId = new ObjectId(id);

    // Find testimonial
    const testimonial = await testimonialCollection.findOne({ _id: objectId });

    if (!testimonial) {
      return res.status(404).json({ success: false, error: "Testimonial not found" });
    }

    res.json({ success: true, data: testimonial });
  } catch (err) {
    console.error("Fetch single testimonial error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch testimonial" });
  }
});

app.put(
  "/api/testimonials/:id",
  testimonialUpload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { author, role, country, text, type } = req.body; // include type
      const image = req.file ? req.file.path : null;

      const objectId = new ObjectId(id);

      // Find existing testimonial
      const testimonial = await testimonialCollection.findOne({ _id: objectId });
      if (!testimonial) {
        return res
          .status(404)
          .json({ success: false, error: "Testimonial not found" });
      }

      // Remove old image if a new one is uploaded
      if (image && testimonial.image) {
        try {
          const oldImagePath = path.resolve(testimonial.image);
          fs.unlink(oldImagePath, (err) => {
            if (err) console.log("Old image deletion error:", err);
          });
        } catch (err) {
          console.log("Image delete path error:", err);
        }
      }

      // Prepare updated data
      const updatedTestimonial = {
        author: author || testimonial.author,
        type: type || testimonial.type || "Employment", // preserve or default
        role: role || testimonial.role,
        country: country || testimonial.country,
        text: text || testimonial.text,
        image: image || testimonial.image,
        updatedAt: new Date(),
      };

      // Update in database
      await testimonialCollection.updateOne(
        { _id: objectId },
        { $set: updatedTestimonial }
      );

      res.json({
        success: true,
        message: "Testimonial updated successfully!",
        testimonial: updatedTestimonial,
      });
    } catch (err) {
      console.error("Update error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to update testimonial" });
    }
  }
);

app.delete("/api/testimonials/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Convert string to ObjectId
    const objectId = new ObjectId(id);

    // Find testimonial
    const testimonial = await testimonialCollection.findOne({ _id: objectId });
    if (!testimonial) return res.status(404).json({ success: false, error: "Testimonial not found" });

    // Delete image if exists
    if (testimonial.image) {
      const fs = require("fs");
      const path = require("path");
      const imagePath = path.join(__dirname, testimonial.image); // absolute path
      fs.unlink(imagePath, (err) => {
        if (err) console.log("Image deletion error:", err);
      });
    }

    // Delete from DB
    await testimonialCollection.deleteOne({ _id: objectId });

    res.json({ success: true, message: "Testimonial deleted!" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, error: "Failed to delete testimonial" });
  }
});

    // Route to handle employment submission
    app.post("/send-form", async (req, res) => {
      const formData = req.body;

      if (!formData.name || !formData.email || !formData.mobile) {
        return res
          .status(400)
          .json({ success: false, error: "Required fields missing" });
      }

      try {
        // Save to MongoDB
        const saveResult = await formCollection.insertOne(formData);

        // Send email
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const mailOptions = {
          headers: {
            "X-Priority": "1", // 1 = High, 3 = Normal, 5 = Low
          },
          from: process.env.EMAIL_USER,
          to: process.env.TO_EMAIL, // your own email
          subject: "📩 New Employment form Submission",
          text: JSON.stringify(formData, null, 2),
          html: `
            <h3>New Employment Form Submission</h3>
            <p><b>Name:</b> ${formData.name}</p>
            <p><b>Email:</b> ${formData.email}</p>
            <p><b>Mobile:</b> ${formData.mobile}</p>
            <p><b>Desired Job:</b> ${formData.desiredJob}</p>
            <p><b>Destination:</b> ${formData.destination}</p>
            <p><b>Location:</b> ${formData.location}</p>
            <p><b>Skills:</b> ${formData.skills}</p>
            <p><b>Message:</b> ${formData.message}</p>
          `,
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: "Form saved & email sent" });
      } catch (error) {
        console.error("Error:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to process form" });
      }
    });
    // Get all form submissions
    app.get("/submissions", async (req, res) => {
      try {
        const submissions = await formCollection.find().toArray();
        res.json({ success: true, data: submissions });
      } catch (error) {
        console.error("Error fetching submissions:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to fetch submissions" });
      }
    });

    // Route to handle Education submission
    app.post("/send-education-form", async (req, res) => {
      const formData = req.body;

      if (!formData.name || !formData.email || !formData.phone) {
        return res
          .status(400)
          .json({ success: false, error: "Required fields missing" });
      }

      try {
        // Save to MongoDB
        const saveResult = await applyCollection.insertOne(formData);

        // Send email
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const mailOptions = {
          headers: {
            "X-Priority": "1", // 1 = High, 3 = Normal, 5 = Low
          },
          from: process.env.EMAIL_USER,
          to: process.env.TO_EMAIL, // your own email
          subject: "📩 New Education form Submission",
          text: JSON.stringify(formData, null, 2),
          html: `
            <h3>New Education Form Submission</h3>
            <p><b>Name:</b> ${formData.name}</p>
            <p><b>Email:</b> ${formData.email}</p>
            <p><b>Mobile:</b> ${formData.phone}</p>
            <p><b>Desired Job:</b> ${formData.subject}</p>
            <p><b>Destination:</b> ${formData.message}</p>
          `,
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: "Form saved & email sent" });
      } catch (error) {
        console.error("Error:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to process form" });
      }
    });

    // Get all education submissions
    app.get("/apply-education", async (req, res) => {
      try {
        const submissions = await applyCollection.find().toArray();
        res.json({ success: true, data: submissions });
      } catch (error) {
        console.error("Error fetching submissions:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to fetch submissions" });
      }
    });

    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
  }
}
run().catch(console.dir);

// Base route
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
