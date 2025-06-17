import express from "express";
import cors from "cors";
import roomRoutes from "./roomManagerRoutes.js"; // Import the room router
import cookieParser from "cookie-parser";
import env from "dotenv";

env.config();
const PORT = process.env.ROOM_PORT;
const app = express();

// Define CORS options only once
const corsOptions = {
  origin: [process.env.API_GW_ADD],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  credentials: true
};

// Apply CORS
app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// Use the login routes
app.use("/api/room", (req, res, next) => {
    console.log(`api gateway 'api/room' req for ${req.path} ... sending to auth router`);
    next();
}, roomRoutes);

app.listen(PORT, () => console.log(`Room Man Service running on port ${PORT}`));
