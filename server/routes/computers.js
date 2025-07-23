const express = require("express");
const router = express.Router();
const Computer = require("../models/computer");
const Booking = require("../models/booking");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

// Get all computers
router.get("/", verifyToken, async (req, res) => {
  try {
    const computers = await Computer.find()
      .populate({
        path: 'bookings',
        populate: {
          path: 'user',
          select: 'name email'
        }
      })
      .sort({ name: 1 });
    res.json(computers);
  } catch (error) {
    console.error("Error fetching computers:", error);
    res.status(500).json({ message: "Error fetching computers" });
  }
});

// Get computers with their current and upcoming bookings
router.get("/with-bookings", verifyToken, async (req, res) => {
  try {
    // Get all computers with their bookings populated
    const computers = await Computer.find()
      .populate({
        path: 'bookings',
        populate: {
          path: 'user',
          select: 'name email'
        }
      })
      .sort({ name: 1 });

    // Get current date and time
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentTime = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });

    console.log("Current date and time:", { today, currentTime });

    // Process each computer to include only relevant bookings
    const computersWithActiveBookings = computers.map(computer => {
      const computerObj = computer.toObject();
      
      // Filter bookings to include only current, upcoming, and pending ones
      computerObj.bookings = (computerObj.bookings || []).filter(booking => {
        // Include if:
        // 1. Booking is pending or approved
        // 2. Booking hasn't ended yet
        if (booking.status === 'rejected' || booking.status === 'cancelled') {
          return false;
        }

        // For today's bookings
        if (booking.startDate === today) {
          return booking.endTime > currentTime;
        }

        // For future bookings
        if (booking.startDate > today) {
          return true;
        }

        // For multi-day bookings
        if (booking.startDate <= today && booking.endDate >= today) {
          return true;
        }

        return false;
      });

      return computerObj;
    });

    res.json(computersWithActiveBookings);
  } catch (error) {
    console.error("Error fetching computers with bookings:", error);
    res.status(500).json({
      message: "Error fetching computers with bookings",
      error: error.message,
    });
  }
});

// Create a new computer
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, location, specifications } = req.body;

    // Basic validation
    if (!name || !location) {
      return res
        .status(400)
        .json({ message: "Name and location are required" });
    }

    const computer = new Computer({
      name,
      location,
      specifications: specifications || "",
    });

    await computer.save();
    res.status(201).json(computer);
  } catch (error) {
    console.error("Error creating computer:", error);
    if (error.code === 11000) {
      res
        .status(400)
        .json({ message: "A computer with this name already exists" });
    } else {
      res.status(500).json({
        message: "Error creating computer",
        error: error.message,
      });
    }
  }
});

// Delete a computer
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    // Check if computer has any active bookings
    const activeBookings = await Booking.findOne({
      computerId: req.params.id,
      status: { $in: ['approved', 'pending'] },
      endDate: { $gte: new Date().toISOString().split("T")[0] },
    });

    if (activeBookings) {
      return res.status(400).json({
        message: "Cannot delete computer with active bookings",
      });
    }

    const computer = await Computer.findByIdAndDelete(req.params.id);
    if (!computer) {
      return res.status(404).json({ message: "Computer not found" });
    }

    res.json({ message: "Computer deleted successfully" });
  } catch (error) {
    console.error("Error deleting computer:", error);
    res.status(500).json({
      message: "Error deleting computer",
      error: error.message,
    });
  }
});

module.exports = router;
